import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { archiveJob, storageTarget } from "@medihub/db/schema/system";
import type { ArchiveChunk } from "@medihub/db/schema/system";

import { db, storage } from "#src/context.ts";
import { viewerOf } from "#src/lib/session.ts";

const contentDisposition = (name: string) => {
  const fallback = name
    .replaceAll(/[^\u0020-\u007E]/g, "_")
    .replaceAll('"', "'");

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

/**
 * 归档分片下载：按 `archive_job.chunks` 里记录的 key 从存储目标流式读取。
 * 分片本身已经是 zip，支持 Range 便于断点续传/大文件重试。
 */
export const archiveRoute = new Hono().get("/:id/:index", async (c) => {
  const viewer = await viewerOf(c.req.raw);

  if (!viewer) {
    return c.json({ error: "请先登录" }, 401);
  }

  const [job] = await db
    .select()
    .from(archiveJob)
    .where(eq(archiveJob.id, c.req.param("id")));

  if (!job) {
    return c.json({ error: "归档任务不存在" }, 404);
  }

  if (viewer.role !== "root" && viewer.role !== "dept_admin") {
    return c.json({ error: "没有下载归档的权限" }, 403);
  }

  if (viewer.role !== "root" && job.organizationId !== viewer.organizationId) {
    return c.json({ error: "归档任务不存在" }, 404);
  }

  const index = Number(c.req.param("index"));

  const chunk = (job.chunks ?? []).find(
    (item: ArchiveChunk) => item.index === index
  );

  if (!chunk) {
    return c.json({ error: "分片不存在" }, 404);
  }

  const [target] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.id, job.storageTargetId));

  if (!target) {
    return c.json({ error: "归档的存储目标已被删除" }, 410);
  }

  const driver = storage.driverFor({
    config: target.config,
    driver: target.driver,
  });

  const info = await driver.stat(chunk.key);

  if (!info) {
    return c.json({ error: "归档分片已从存储中移除" }, 410);
  }

  const fileName = `medihub-archive-${job.id.slice(0, 8)}-${String(index + 1).padStart(3, "0")}.zip`;

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": contentDisposition(fileName),
    "Content-Type": "application/zip",
  });

  const rangeHeader = c.req.header("range") ?? null;

  const match = rangeHeader
    ? /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim())
    : null;

  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : info.size - 1;

    if (start > end || start >= info.size) {
      headers.set("Content-Range", `bytes */${info.size}`);

      return new Response(null, { headers, status: 416 });
    }

    const safeEnd = Math.min(end, info.size - 1);
    headers.set("Content-Length", String(safeEnd - start + 1));
    headers.set("Content-Range", `bytes ${start}-${safeEnd}/${info.size}`);

    return new Response(await driver.get(chunk.key, { end: safeEnd, start }), {
      headers,
      status: 206,
    });
  }

  headers.set("Content-Length", String(info.size));

  return new Response(await driver.get(chunk.key), { headers, status: 200 });
});
