import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { archiveJob } from "@medihub/db/schema/system";

import type { Viewer } from "#src/access.ts";
import type { StorageAccess } from "#src/context.ts";
import { adminProcedure } from "#src/procedures.ts";
import { scheduleRouter } from "#src/routers/archive-schedules.ts";
import { createArchiveJob } from "#src/services/archive-create.ts";

const requireStorage = (storage: StorageAccess | undefined): StorageAccess => {
  if (!storage) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "服务端未配置存储访问器",
    });
  }

  return storage;
};

const scopeForViewer = (viewer: Viewer, requested?: string | null) => {
  if (viewer.role === "root") {
    return requested ?? viewer.organizationId ?? null;
  }

  if (!viewer.organizationId) {
    throw new ORPCError("FORBIDDEN", { message: "当前账号没有归属科室" });
  }

  if (requested && requested !== viewer.organizationId) {
    throw new ORPCError("FORBIDDEN", { message: "只能归档本科室的数据" });
  }

  return viewer.organizationId;
};

export const archiveRouter = {
  create: adminProcedure
    .input(
      z.object({
        beforeAt: z.coerce.date(),
        chunkBytes: z
          .int()
          .min(50 * 1024 * 1024)
          .max(8 * 1024 * 1024 * 1024)
          .default(200 * 1024 * 1024),
        deleteSource: z.boolean().default(true),
        organizationId: z.string().min(1).nullish(),
        targetId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const organizationId = scopeForViewer(viewer, input.organizationId);

      if (!organizationId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "请指定要归档的科室（root 需要先在顶部选择科室）",
        });
      }

      const { job } = await createArchiveJob({
        beforeAt: input.beforeAt,
        chunkBytes: input.chunkBytes,
        db: context.db,
        deleteSource: input.deleteSource,
        organizationId,
        requestedBy: viewer.id,
        storage: requireStorage(context.storage),
        targetId: input.targetId,
      });

      return job;
    }),

  list: adminProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).optional(),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const organizationId =
        viewer.role === "root" ? input.organizationId : viewer.organizationId;

      const items = await context.db
        .select({
          assetCount: archiveJob.assetCount,
          beforeAt: archiveJob.beforeAt,
          byteSize: archiveJob.byteSize,
          chunkCount: archiveJob.chunkCount,
          completedAt: archiveJob.completedAt,
          createdAt: archiveJob.createdAt,
          deleteSource: archiveJob.deleteSource,
          error: archiveJob.error,
          id: archiveJob.id,
          organizationId: archiveJob.organizationId,
          status: archiveJob.status,
          storageTargetId: archiveJob.storageTargetId,
        })
        .from(archiveJob)
        .where(
          organizationId
            ? eq(archiveJob.organizationId, organizationId)
            : undefined
        )
        .orderBy(desc(archiveJob.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, page: input.page, pageSize: input.pageSize };
    }),

  get: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [job] = await context.db
        .select()
        .from(archiveJob)
        .where(eq(archiveJob.id, input.id));

      if (!job) {
        throw new ORPCError("NOT_FOUND", { message: "归档任务不存在" });
      }

      if (
        viewer.role !== "root" &&
        job.organizationId !== viewer.organizationId
      ) {
        throw new ORPCError("NOT_FOUND", { message: "归档任务不存在" });
      }

      return job;
    }),

  schedules: scheduleRouter,
};
