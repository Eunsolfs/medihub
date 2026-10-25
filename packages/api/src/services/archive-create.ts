import { ORPCError } from "@orpc/server";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";
import { archiveJob, storageTarget } from "@medihub/db/schema/system";

import type { StorageAccess } from "#src/context.ts";
import {
  deleteArchivedSources,
  failArchiveJob,
  finishArchiveJob,
  markAssetsArchived,
  runArchiveJob,
} from "#src/services/archive.ts";

export interface CreateArchiveInput {
  beforeAt: Date;
  chunkBytes: number;
  db: Database;
  deleteSource: boolean;
  organizationId: string;
  requestedBy: string;
  storage: StorageAccess;
  targetId?: string;
}

/** 选出本科室在 beforeAt 之前上传、尚未归档的素材（最多 5000 条）。 */
export const listArchiveCandidates = async (
  db: Database,
  organizationId: string,
  beforeAt: Date
) =>
  await db
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
        lt(asset.createdAt, beforeAt)
      )
    )
    .orderBy(desc(asset.createdAt))
    .limit(5000);

export const resolveArchiveTarget = async (
  db: Database,
  organizationId: string,
  targetId?: string
) => {
  const candidates = await db
    .select()
    .from(storageTarget)
    .where(
      and(
        eq(storageTarget.enabled, true),
        or(
          isNull(storageTarget.organizationId),
          eq(storageTarget.organizationId, organizationId)
        ),
        targetId ? eq(storageTarget.id, targetId) : undefined
      )
    )
    .orderBy(desc(storageTarget.isDefault));

  return (
    candidates.find((row) => row.organizationId === organizationId) ??
    candidates.find((row) => row.organizationId === null) ??
    candidates[0]
  );
};

/**
 * 创建归档任务并在后台执行（路由与定时计划共用）。
 * 返回的 job 状态为 running，前端轮询 archive.get 查看进度。
 */
export const createArchiveJob = async (input: CreateArchiveInput) => {
  const [department] = await input.db
    .select({
      code: organization.code,
      id: organization.id,
      name: organization.name,
    })
    .from(organization)
    .where(eq(organization.id, input.organizationId));

  if (!department) {
    throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
  }

  const target = await resolveArchiveTarget(
    input.db,
    input.organizationId,
    input.targetId
  );

  if (!target) {
    throw new ORPCError("BAD_REQUEST", {
      message: "没有可用的存储目标，请先在系统管理里配置",
    });
  }

  const rows = await listArchiveCandidates(
    input.db,
    input.organizationId,
    input.beforeAt
  );

  if (rows.length === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "这个时间点之前没有可归档的素材",
    });
  }

  const [job] = await input.db
    .insert(archiveJob)
    .values({
      beforeAt: input.beforeAt,
      chunkBytes: input.chunkBytes,
      deleteSource: input.deleteSource,
      organizationId: input.organizationId,
      requestedBy: input.requestedBy,
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
  const { storage } = input;

  // 后台执行；失败写 lastError，前端轮询可见。
  void (async () => {
    try {
      const result = await runArchiveJob({
        assets: rows,
        chunkBytes: input.chunkBytes,
        deleteSource: input.deleteSource,
        jobId: job.id,
        organization: department,
        requester: { email: "", id: input.requestedBy, name: "" },
        storage,
        target: { config: target.config, driver: target.driver },
        targetName: target.name,
      });

      await markAssetsArchived(
        input.db,
        rows.map((row) => row.id),
        job.id
      );

      if (input.deleteSource) {
        await deleteArchivedSources(storage, rows, {
          config: target.config,
          driver: target.driver,
        });
      }

      await finishArchiveJob(input.db, job.id, {
        assetCount: rows.length,
        byteSize: totalBytes,
        chunks: result.chunks,
      });
    } catch (error) {
      await failArchiveJob(input.db, job.id, error);
    }
  })();

  return { job, rows, target };
};
