import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { asset } from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";
import { archiveJob, storageTarget } from "@medihub/db/schema/system";

import type { Viewer } from "#src/access.ts";
import type { StorageAccess } from "#src/context.ts";
import { adminProcedure } from "#src/procedures.ts";
import {
  deleteArchivedSources,
  failArchiveJob,
  finishArchiveJob,
  markAssetsArchived,
  runArchiveJob,
} from "#src/services/archive.ts";

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
  /** 创建归档任务：把 beforeAt 之前上传、仍在本地的素材打包并推到目标存储。 */
  create: adminProcedure
    .input(
      z.object({
        beforeAt: z.coerce.date(),
        chunkBytes: z
          .int()
          .min(64 * 1024 * 1024)
          .max(8 * 1024 * 1024 * 1024)
          .default(1024 * 1024 * 1024),
        deleteSource: z.boolean().default(true),
        organizationId: z.string().min(1).nullish(),
        targetId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const storage = requireStorage(context.storage);
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

      const [department] = await context.db
        .select({
          code: organization.code,
          id: organization.id,
          name: organization.name,
        })
        .from(organization)
        .where(eq(organization.id, organizationId));

      if (!department) {
        throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
      }

      const candidates = await context.db
        .select()
        .from(storageTarget)
        .where(
          and(
            eq(storageTarget.enabled, true),
            or(
              isNull(storageTarget.organizationId),
              eq(storageTarget.organizationId, organizationId)
            ),
            input.targetId
              ? eq(storageTarget.id, input.targetId)
              : eq(storageTarget.isDefault, true)
          )
        )
        .orderBy(desc(storageTarget.isDefault));

      // 优先用本科室自己的目标（素材实际存放在那里），没有再回落到全局目标。
      const target =
        candidates.find((row) => row.organizationId === organizationId) ??
        candidates.find((row) => row.organizationId === null) ??
        candidates[0];

      if (!target) {
        throw new ORPCError("BAD_REQUEST", {
          message: "没有可用的存储目标，请先在系统管理里配置",
        });
      }

      const rows = await context.db
        .select({
          admissionId: asset.admissionId,
          byteSize: asset.byteSize,
          capturedAt: asset.capturedAt,
          createdAt: asset.createdAt,
          description: asset.description,
          id: asset.id,
          kind: asset.kind,
          mimeType: asset.mimeType,
          originalName: asset.originalName,
          patientId: asset.patientId,
          stage: asset.stage,
          storageKey: asset.storageKey,
          storageTargetId: asset.storageTargetId,
          tags: asset.tags,
        })
        .from(asset)
        .where(
          and(
            eq(asset.organizationId, organizationId),
            isNull(asset.deletedAt),
            isNull(asset.archivedAt),
            lt(asset.createdAt, input.beforeAt)
          )
        )
        .orderBy(desc(asset.createdAt))
        .limit(5000);

      if (rows.length === 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: "这个时间点之前没有可归档的素材",
        });
      }

      const [job] = await context.db
        .insert(archiveJob)
        .values({
          beforeAt: input.beforeAt,
          chunkBytes: input.chunkBytes,
          deleteSource: input.deleteSource,
          organizationId,
          requestedBy: viewer.id,
          status: "running",
          storagePrefix: `archive/${crypto.randomUUID()}`,
          storageTargetId: target.id,
        })
        .returning();

      if (!job) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建归档任务失败",
        });
      }

      const totalBytes = rows.reduce((sum, row) => sum + row.byteSize, 0);

      // 归档在后台执行；前端轮询 archive.get 看进度与分片。
      void (async () => {
        try {
          const result = await runArchiveJob({
            assets: rows,
            chunkBytes: input.chunkBytes,
            deleteSource: input.deleteSource,
            jobId: job.id,
            organization: department,
            requester: {
              email: viewer.email,
              id: viewer.id,
              name: viewer.name,
            },
            storage,
            target: { config: target.config, driver: target.driver },
            targetName: target.name,
          });

          await markAssetsArchived(
            context.db,
            rows.map((row) => row.id),
            job.id
          );

          if (input.deleteSource) {
            await deleteArchivedSources(storage, rows, {
              config: target.config,
              driver: target.driver,
            });
          }

          await finishArchiveJob(context.db, job.id, {
            assetCount: rows.length,
            byteSize: totalBytes,
            chunks: result.chunks,
          });
        } catch (error) {
          await failArchiveJob(context.db, job.id, error);
        }
      })();

      return job;
    }),

  /** 归档列表（按科室隔离；root 可看全部）。 */
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

      const filters = [
        organizationId
          ? eq(archiveJob.organizationId, organizationId)
          : undefined,
      ];

      const where = and(...filters.filter(Boolean));

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
        .where(where)
        .orderBy(desc(archiveJob.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, page: input.page, pageSize: input.pageSize };
    }),

  /** 单个归档详情：含分片列表，用于逐片下载。 */
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
};
