import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { exportJob, storageTarget } from "@medihub/db/schema/system";

import { db, storage } from "#src/context.ts";
import { viewerOf } from "#src/lib/session.ts";

const contentDisposition = (name: string) => {
  const fallback = name
    .replaceAll(/[^\u0020-\u007E]/g, "_")
    .replaceAll('"', "'");

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

export const exportsRoute = new Hono().get("/:id/download", async (c) => {
  const id = c.req.param("id");
  const viewer = await viewerOf(c.req.raw);

  if (!viewer) {
    return c.json({ error: "请先登录" }, 401);
  }

  const [job] = await db.select().from(exportJob).where(eq(exportJob.id, id));

  if (!job) {
    return c.json({ error: "导出任务不存在" }, 404);
  }

  const isOwner = job.requestedBy === viewer.id;

  const isAdmin =
    viewer.role === "root" ||
    (viewer.role === "dept_admin" &&
      viewer.organizationId === job.organizationId);

  if (!(isOwner || isAdmin)) {
    return c.json({ error: "没有下载该导出的权限" }, 403);
  }

  if (job.status !== "ready" || !(job.storageTargetId && job.storageKey)) {
    return c.json({ error: "导出尚未完成" }, 409);
  }

  const [target] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.id, job.storageTargetId));

  if (!target) {
    return c.json({ error: "导出文件所在的存储目标已被删除" }, 410);
  }

  const driver = storage.driverFor(target);
  const info = await driver.stat(job.storageKey);

  if (!info) {
    return c.json({ error: "导出文件已丢失" }, 410);
  }

  const fileName = job.fileName ?? `medihub-export-${job.id}.zip`;

  return new Response(await driver.get(job.storageKey), {
    headers: {
      "Content-Disposition": contentDisposition(fileName),
      "Content-Length": String(info.size),
      "Content-Type": "application/zip",
    },
  });
});
