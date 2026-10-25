import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { ZipArchive } from "archiver";
import type { ArchiverError } from "archiver";
import { eq, inArray } from "drizzle-orm";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import { archiveJob } from "@medihub/db/schema/system";
import type { ArchiveChunk } from "@medihub/db/schema/system";
import type { StorageDriver } from "@medihub/storage";

import type { StorageAccess } from "#src/context.ts";

export interface ArchiveAssetRow {
  admissionId: string | null;
  byteSize: number;
  capturedAt: Date | null;
  createdAt: Date;
  description: string | null;
  id: string;
  kind: string;
  mimeType: string;
  originalName: string;
  patientId: string | null;
  stage: string | null;
  storageKey: string;
  storageTargetId: string;
  tags: string[];
}

interface RunArchiveInput {
  assets: ArchiveAssetRow[];
  chunkBytes: number;
  deleteSource: boolean;
  jobId: string;
  organization: { code: string; id: string; name: string };
  requester: { email: string; id: string; name: string };
  storage: StorageAccess;
  target: { config: string; driver: StorageDriver["kind"] };
  targetName: string;
}

const safeFileName = (name: string) => {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replaceAll(/[\\/:*?"<>|]/g, "").trim();

  return cleaned.slice(0, 120) || "file";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** 分片规划：按素材边界累积，单片不超过 chunkBytes（大文件单独成片）。 */
export const planArchiveChunks = (
  assets: { byteSize: number }[],
  chunkBytes: number
): number[] => {
  const groups: number[] = [];
  let current = 0;

  for (const row of assets) {
    if (current > 0 && current + row.byteSize > chunkBytes) {
      groups.push(current);
      current = 0;
    }

    current += row.byteSize;
  }

  if (current > 0) {
    groups.push(current);
  }

  return groups;
};

const sliceAssets = (assets: ArchiveAssetRow[], chunkBytes: number) => {
  const slices: ArchiveAssetRow[][] = [];
  let current: ArchiveAssetRow[] = [];
  let size = 0;

  for (const row of assets) {
    if (size > 0 && size + row.byteSize > chunkBytes) {
      slices.push(current);
      current = [];
      size = 0;
    }

    current.push(row);
    size += row.byteSize;
  }

  if (current.length > 0) {
    slices.push(current);
  }

  return slices;
};

const viewerHtml = (
  job: { id: string; organizationName: string; chunkIndex: number },
  assets: {
    capturedAt: string;
    id: string;
    kind: string;
    mimeType: string;
    name: string;
    relativePath: string;
  }[]
) => {
  const rows = assets
    .map((row) => {
      const preview =
        row.kind === "image"
          ? `<img alt="" loading="lazy" src="${row.relativePath}" />`
          : row.kind === "video"
            ? `<video controls preload="metadata" src="${row.relativePath}"></video>`
            : `<span class="badge">${escapeHtml(row.kind)}</span>`;

      return `<article><div class="preview">${preview}</div><h3>${escapeHtml(row.name)}</h3><p>${escapeHtml(row.capturedAt)} · ${escapeHtml(row.mimeType)}</p><p><a href="${row.relativePath}" download>下载原文件</a></p></article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>医档通冷数据归档 · ${escapeHtml(job.organizationName)}</title>
<style>
:root{color-scheme:light dark;--bg:#f7f7f8;--card:#fff;--text:#18181b;--muted:#6b7280;--line:#e4e4e7}
@media (prefers-color-scheme:dark){:root{--bg:#111113;--card:#1b1b1f;--text:#f4f4f5;--muted:#a1a1aa;--line:#2c2c31}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:24px 20px;border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:20px}
main{padding:20px;display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
article{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;padding-bottom:10px}
.preview{aspect-ratio:4/3;display:grid;place-items:center;background:var(--bg);overflow:hidden}
.preview img,.preview video{width:100%;height:100%;object-fit:cover}
h3{font-size:14px;margin:10px 12px 2px;word-break:break-all}p{margin:0 12px;color:var(--muted);font-size:12px}a{color:#0e7490}
.badge{padding:4px 8px;border-radius:999px;background:var(--bg);font-size:12px}
footer{padding:16px 20px;color:var(--muted);font-size:12px;border-top:1px solid var(--line)}
</style></head><body>
<header><h1>${escapeHtml(job.organizationName)} · 冷数据归档</h1>
<p>第 ${job.chunkIndex} 片 · 任务 ${escapeHtml(job.id)} · 本文件可直接离线打开，也可作为桌面端数据源</p></header>
<main>${rows}</main>
<footer>医档通 MediHub 归档包。文件按原始素材顺序存放于 files/ 目录；manifest.json 含完整元数据。</footer>
</body></html>`;
};

const zipChunk = async (
  input: RunArchiveInput,
  rows: ArchiveAssetRow[],
  chunkIndex: number,
  tempRoot: string
) => {
  const fileName = `chunk-${String(chunkIndex + 1).padStart(3, "0")}.zip`;
  const zipPath = path.join(tempRoot, fileName);

  const driver = input.storage.driverFor({
    config: input.target.config,
    driver: input.target.driver,
  });

  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 6 } });

  const finished = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", (error: ArchiverError) => reject(error));
    archive.on("warning", (error: ArchiverError) => {
      if (error.code !== "ENOENT") {
        reject(error);
      }
    });
  });

  archive.pipe(output);

  const manifestAssets = rows.map((row, index) => {
    const relativePath = `files/${String(index + 1).padStart(4, "0")}-${safeFileName(row.originalName)}`;

    return {
      admissionId: row.admissionId,
      archivedAt: new Date().toISOString(),
      byteSize: row.byteSize,
      capturedAt: row.capturedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      description: row.description,
      id: row.id,
      kind: row.kind,
      mimeType: row.mimeType,
      name: row.originalName,
      patientId: row.patientId,
      relativePath,
      stage: row.stage,
      tags: row.tags,
    };
  });

  const manifest = {
    archive: {
      chunkCount: undefined,
      chunkIndex,
      createdAt: new Date().toISOString(),
      deleteSource: input.deleteSource,
      jobId: input.jobId,
      organization: input.organization,
      requester: input.requester,
      targetName: input.targetName,
    },
    assets: manifestAssets,
    schema: "medihub.archive/v1",
  };

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  archive.append(
    [
      `# ${input.organization.name} 冷数据归档`,
      "",
      `- 任务 id：${input.jobId}`,
      `- 分片：第 ${chunkIndex + 1} 片`,
      `- 素材数：${rows.length}`,
      "- 打开 `viewer.html` 可离线浏览；`manifest.json` 含完整元数据。",
      "- 文件位于 `files/`，文件名前缀是素材顺序号。",
      "",
    ].join("\n"),
    { name: "README.md" }
  );
  archive.append(
    viewerHtml(
      {
        chunkIndex: chunkIndex + 1,
        id: input.jobId,
        organizationName: input.organization.name,
      },
      manifestAssets.map((row) => ({
        capturedAt: row.capturedAt ?? "",
        id: row.id,
        kind: row.kind,
        mimeType: row.mimeType,
        name: row.name,
        relativePath: row.relativePath,
      }))
    ),
    { name: "viewer.html" }
  );

  for (const [index, row] of rows.entries()) {
    const stream = await driver.get(row.storageKey);
    const buffer = Buffer.from(await new Response(stream).arrayBuffer());
    const relativePath = `files/${String(index + 1).padStart(4, "0")}-${safeFileName(row.originalName)}`;

    archive.append(Readable.from(buffer), { name: relativePath });
  }

  await archive.finalize();
  await finished;

  const bytes = await readFile(zipPath);
  const storageKey = `archive/${input.jobId}/${fileName}`;

  await driver.put(storageKey, bytes);

  await rm(zipPath, { force: true });

  return {
    chunk: {
      index: chunkIndex,
      key: storageKey,
      size: bytes.byteLength,
    } satisfies ArchiveChunk,
    rows,
  };
};

export const runArchiveJob = async (input: RunArchiveInput) => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "medihub-archive-"));
  const slices = sliceAssets(input.assets, input.chunkBytes);
  const chunks: ArchiveChunk[] = [];

  try {
    for (const [index, rows] of slices.entries()) {
      const { chunk } = await zipChunk(input, rows, index, tempRoot);
      chunks.push(chunk);
    }

    return { chunks, slices };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
};

export const markAssetsArchived = async (
  db: Database,
  assetIds: string[],
  jobId: string
) => {
  if (assetIds.length === 0) {
    return;
  }

  await db
    .update(asset)
    .set({ archiveId: jobId, archivedAt: new Date() })
    .where(inArray(asset.id, assetIds));
};

export const deleteArchivedSources = async (
  storage: StorageAccess,
  assets: ArchiveAssetRow[],
  target: { config: string; driver: StorageDriver["kind"] }
) => {
  const driver = storage.driverFor({
    config: target.config,
    driver: target.driver,
  });

  for (const row of assets) {
    try {
      await driver.delete(row.storageKey);
    } catch {
      // 单个文件删不掉不应阻塞整个归档；遗留对象由运维清理。
    }
  }
};

export const finishArchiveJob = async (
  db: Database,
  jobId: string,
  result: { chunks: ArchiveChunk[]; assetCount: number; byteSize: number }
) => {
  await db
    .update(archiveJob)
    .set({
      assetCount: result.assetCount,
      byteSize: result.byteSize,
      chunkCount: result.chunks.length,
      chunks: result.chunks,
      completedAt: new Date(),
      status: "ready",
    })
    .where(eq(archiveJob.id, jobId));
};

export const failArchiveJob = async (
  db: Database,
  jobId: string,
  error: unknown
) => {
  const message = error instanceof Error ? error.message : String(error);

  await db
    .update(archiveJob)
    .set({
      completedAt: new Date(),
      error: message.slice(0, 1000),
      status: "failed",
    })
    .where(eq(archiveJob.id, jobId));
};
