import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { ZipArchive } from "archiver";
import type { ArchiverError } from "archiver";
import { inArray } from "drizzle-orm";

import type { Database } from "@medihub/db";
import type { exportKind } from "@medihub/db/schema/system";
import { storageTarget } from "@medihub/db/schema/system";
import type { StorageDriver } from "@medihub/storage";

import type { StorageAccess } from "#src/context.ts";

type ExportKind = (typeof exportKind)[number];

/** data.csv 的一行：键是列名，缺列按空字符串输出。 */
export type ExportRow = Record<string, string>;

/** 参与导出的素材；文件按需从存储读取，不进内存。 */
export interface ExportAssetRow {
  byteSize: number;
  capturedAt: Date | null;
  id: string;
  mimeType: string;
  originalName: string;
  storageKey: string;
  storageTargetId: string;
}

interface ExportDocument {
  assets: ExportAssetRow[];
  columns: string[];
  kind: ExportKind;
  /** 写进 manifest 的请求参数，便于复现这次导出。 */
  params: Record<string, unknown>;
  rows: ExportRow[];
  /** README 里的「来源」一行，如「患者 张三（病案号 A123）」。 */
  source: string;
}

interface RunExportInput {
  db: Database;
  document: ExportDocument;
  fileName: string;
  includeFiles: boolean;
  jobId: string;
  organization: { code: string; id: string; name: string };
  requester: { email: string; id: string; name: string };
  storage: StorageAccess;
  target: { config: string; driver: StorageDriver["kind"]; id: string };
}

interface RunExportResult {
  assetCount: number;
  byteSize: number;
  fileName: string;
  storageKey: string;
}

const iso = (value: Date | null) => (value ? value.toISOString() : "");

const escapeCsv = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Excel 需要 BOM 才按 UTF-8 打开；CRLF 兼容 Windows。 */
const buildCsv = (columns: string[], rows: ExportRow[]) => {
  const lines = [
    columns.map(escapeCsv).join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCsv(row[column] ?? "")).join(",")
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}\r\n`;
};

/** 原始文件名可能带上路径或非法字符，压缩包里只保留安全的文件名。 */
const safeFileName = (name: string) => {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replaceAll(/[\\/:*?"<>|]/g, "").trim();

  return cleaned.slice(0, 120);
};

/** 重名文件加序号，避免解压时互相覆盖。 */
const uniqueFileName = (name: string, index: number, used: Set<string>) => {
  const fallback = `file-${index + 1}`;
  const base = safeFileName(name) || fallback;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const extension = dot > 0 ? base.slice(dot) : "";
  let candidate = base;
  let counter = 1;

  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}-${counter}${extension}`;
    counter += 1;
  }

  used.add(candidate.toLowerCase());

  return candidate;
};

/**
 * 存储驱动返回的是 Web ReadableStream，archiver 需要 Node 的 Readable。
 * lib.dom 与 @types/node 对同一实现的泛型声明不一致，这里用读取器桥接，
 * 避免类型断言把差异藏起来。
 */
const toNodeStream = (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();

  return Readable.from(
    (async function* readChunks() {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          return;
        }

        yield value;
      }
    })()
  );
};

const buildReadme = (
  input: RunExportInput,
  document: ExportDocument,
  fileCount: number,
  generatedAt: Date
) =>
  [
    `# ${document.kind} 导出`,
    "",
    `- 生成时间：${generatedAt.toISOString()}`,
    `- 操作人：${input.requester.name} <${input.requester.email}>`,
    `- 所属科室：${input.organization.name}（${input.organization.code}）`,
    `- 来源：${document.source}`,
    `- 记录数：${document.rows.length}`,
    `- 附件：${fileCount} 个（${input.includeFiles ? "已包含原始文件" : "仅元数据"}）`,
    "",
    "## 目录结构",
    "",
    "- `data.csv`：结构化数据，UTF-8 带 BOM，可直接用 Excel 打开。",
    "- `manifest.json`：本次导出的参数、字段清单与附件明细，供程序读取。",
    "- `files/`：原始附件，文件名沿用系统内的原始文件名（重名自动加序号）。",
    "",
    "## 字段",
    "",
    document.columns.map((column) => `- ${column}`).join("\n"),
    "",
  ].join("\n");

const buildManifest = (
  input: RunExportInput,
  document: ExportDocument,
  entries: { included: boolean; path: string; row: ExportAssetRow }[],
  generatedAt: Date
) => ({
  assetCount: entries.filter((entry) => entry.included).length,
  columns: document.columns,
  files: entries.map((entry) => ({
    byteSize: entry.row.byteSize,
    capturedAt: iso(entry.row.capturedAt),
    id: entry.row.id,
    included: entry.included,
    mimeType: entry.row.mimeType,
    originalName: entry.row.originalName,
    path: entry.included ? `files/${entry.path}` : null,
    storageKey: entry.row.storageKey,
  })),
  generatedAt: generatedAt.toISOString(),
  kind: document.kind,
  organization: input.organization,
  params: document.params,
  requestedBy: input.requester,
  rowCount: document.rows.length,
  source: document.source,
});

/**
 * 把一次导出打成 zip 并写进目标存储。
 * 素材以流的形式逐个写入压缩包，内存里只留目录信息与最终的 zip 缓冲区。
 */
export const runExportJob = async (
  input: RunExportInput
): Promise<RunExportResult> => {
  const { document, storage, target } = input;
  const generatedAt = new Date();
  const storageKey = `${input.organization.id}/exports/${input.jobId}.zip`;
  const directory = await mkdtemp(path.join(tmpdir(), "medihub-export-"));
  const zipPath = path.join(directory, "export.zip");
  const drivers = new Map<string, StorageDriver>();
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  const driverFor = async (targetId: string) => {
    const cached = drivers.get(targetId);

    if (cached) {
      return cached;
    }

    const [row] = await input.db
      .select()
      .from(storageTarget)
      .where(inArray(storageTarget.id, [targetId]));

    if (!row) {
      return null;
    }

    const driver = storage.driverFor(row);
    drivers.set(targetId, driver);

    return driver;
  };

  try {
    const used = new Set<string>();

    const entries: {
      included: boolean;
      path: string;
      row: ExportAssetRow;
    }[] = [];

    for (const [index, row] of document.assets.entries()) {
      const fileName = uniqueFileName(row.originalName, index, used);

      const driver = input.includeFiles
        ? await driverFor(row.storageTargetId)
        : null;

      const available = driver
        ? await driver.stat(row.storageKey).catch(() => null)
        : null;

      entries.push({ included: Boolean(available), path: fileName, row });
    }

    const completed = new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      output.on("error", reject);
      archive.on("error", reject);
      archive.on("warning", (error: ArchiverError) => {
        if (error.code !== "ENOENT") {
          reject(error);
        }
      });
    });

    archive.pipe(output);
    archive.append(
      buildReadme(
        input,
        document,
        entries.filter((entry) => entry.included).length,
        generatedAt
      ),
      { name: "README.md" }
    );
    archive.append(
      `${JSON.stringify(buildManifest(input, document, entries, generatedAt), null, 2)}\n`,
      { name: "manifest.json" }
    );
    archive.append(buildCsv(document.columns, document.rows), {
      name: "data.csv",
    });

    for (const entry of entries) {
      if (!entry.included) {
        continue;
      }

      const driver = await driverFor(entry.row.storageTargetId);

      if (!driver) {
        continue;
      }

      const stream = await driver.get(entry.row.storageKey);
      archive.append(toNodeStream(stream), { name: `files/${entry.path}` });
    }

    await archive.finalize();
    await completed;

    const bytes = await readFile(zipPath);
    await storage.driverFor(target).put(storageKey, bytes);

    return {
      assetCount: entries.filter((entry) => entry.included).length,
      byteSize: bytes.byteLength,
      fileName: input.fileName,
      storageKey,
    };
  } finally {
    output.destroy();
    await rm(directory, { force: true, recursive: true });
  }
};
