import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { archiveFrequency, archiveSchedule } from "@medihub/db/schema/system";

import type { Viewer } from "#src/access.ts";
import type { StorageAccess } from "#src/context.ts";
import { adminProcedure } from "#src/procedures.ts";
import {
  createArchiveJob,
  listArchiveCandidates,
  resolveArchiveTarget,
} from "#src/services/archive-create.ts";

const LOCAL_TARGET_MAX_BYTES = 200 * 1024 * 1024;

export const requireStorage = (
  storage: StorageAccess | undefined
): StorageAccess => {
  if (!storage) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "服务端未配置存储访问器",
    });
  }

  return storage;
};

export const scopedOrganizationId = (
  viewer: Viewer,
  requested?: string | null
) => {
  if (viewer.role === "root") {
    return requested ?? null;
  }

  if (!viewer.organizationId) {
    throw new ORPCError("FORBIDDEN", { message: "当前账号没有归属科室" });
  }

  if (requested && requested !== viewer.organizationId) {
    throw new ORPCError("FORBIDDEN", { message: "只能操作本科室的数据" });
  }

  return viewer.organizationId;
};

/** 定时计划在「本地磁盘目标」上只允许很小的归档，避免自动任务写满服务器。 */
export const assertLocalTargetAllowed = async (
  context: { db: Parameters<typeof listArchiveCandidates>[0] },
  organizationId: string,
  target: { driver: string },
  beforeAt: Date
) => {
  if (target.driver !== "local") {
    return;
  }

  const rows = await listArchiveCandidates(
    context.db,
    organizationId,
    beforeAt
  );

  const total = rows.reduce((sum, row) => sum + row.byteSize, 0);

  if (total >= LOCAL_TARGET_MAX_BYTES) {
    throw new ORPCError("BAD_REQUEST", {
      message: `本次预计归档 ${(total / 1024 / 1024).toFixed(1)}MB，超过本地目标的 200MB 限制；请改用 NAS/S3 目标`,
    });
  }
};

const scheduleInput = z.object({
  beforeDays: z.int().min(1).max(3650).default(730),
  chunkBytes: z
    .int()
    .min(50 * 1024 * 1024)
    .max(8 * 1024 * 1024 * 1024)
    .default(200 * 1024 * 1024),
  dayOfMonth: z.int().min(1).max(28).default(1),
  deleteSource: z.boolean().default(true),
  enabled: z.boolean().default(true),
  frequency: z.enum(archiveFrequency).default("monthly"),
  hour: z.int().min(0).max(23).default(3),
  organizationId: z.string().min(1).nullish(),
  targetId: z.string().min(1),
  weekday: z.int().min(1).max(7).default(1),
});

export const scheduleRouter = {
  list: adminProcedure
    .input(z.object({ organizationId: z.string().min(1).optional() }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const filters = [
        viewer.role === "root"
          ? input.organizationId
            ? eq(archiveSchedule.organizationId, input.organizationId)
            : undefined
          : eq(archiveSchedule.organizationId, viewer.organizationId ?? ""),
      ];

      const items = await context.db
        .select()
        .from(archiveSchedule)
        .where(and(...filters.filter(Boolean)))
        .orderBy(desc(archiveSchedule.createdAt));

      return { items };
    }),

  create: adminProcedure
    .input(scheduleInput)
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const organizationId = scopedOrganizationId(viewer, input.organizationId);

      if (!organizationId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "请指定要归档的科室（root 需要先在顶部选择科室）",
        });
      }

      const target = await resolveArchiveTarget(
        context.db,
        organizationId,
        input.targetId
      );

      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "存储目标不存在" });
      }

      const now = Date.now();

      const [created] = await context.db
        .insert(archiveSchedule)
        .values({
          beforeDays: input.beforeDays,
          chunkBytes: input.chunkBytes,
          createdBy: viewer.id,
          dayOfMonth: input.dayOfMonth,
          deleteSource: input.deleteSource,
          enabled: input.enabled,
          frequency: input.frequency,
          hour: input.hour,
          nextRunAt: new Date(
            Math.max(
              now + 60_000,
              computeNextRunMs(
                {
                  dayOfMonth: input.dayOfMonth,
                  frequency: input.frequency,
                  hour: input.hour,
                  weekday: input.weekday,
                },
                now
              )
            )
          ),
          organizationId,
          targetId: target.id,
          weekday: input.weekday,
        })
        .returning();

      return created;
    }),

  update: adminProcedure
    .input(scheduleInput.partial().extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select()
        .from(archiveSchedule)
        .where(eq(archiveSchedule.id, input.id));

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "计划不存在" });
      }

      if (
        viewer.role !== "root" &&
        existing.organizationId !== viewer.organizationId
      ) {
        throw new ORPCError("NOT_FOUND", { message: "计划不存在" });
      }

      const nextRunAt =
        input.enabled === false
          ? existing.nextRunAt
          : new Date(
              Math.max(
                Date.now() + 60_000,
                computeNextRunMs(
                  {
                    dayOfMonth: input.dayOfMonth ?? existing.dayOfMonth,
                    frequency: input.frequency ?? existing.frequency,
                    hour: input.hour ?? existing.hour,
                    weekday: input.weekday ?? existing.weekday,
                  },
                  Date.now()
                )
              )
            );

      const [updated] = await context.db
        .update(archiveSchedule)
        .set({
          ...(input.beforeDays === undefined
            ? {}
            : { beforeDays: input.beforeDays }),
          ...(input.chunkBytes === undefined
            ? {}
            : { chunkBytes: input.chunkBytes }),
          ...(input.dayOfMonth === undefined
            ? {}
            : { dayOfMonth: input.dayOfMonth }),
          ...(input.deleteSource === undefined
            ? {}
            : { deleteSource: input.deleteSource }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.frequency === undefined
            ? {}
            : { frequency: input.frequency }),
          ...(input.hour === undefined ? {} : { hour: input.hour }),
          ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
          ...(input.weekday === undefined ? {} : { weekday: input.weekday }),
          nextRunAt,
        })
        .where(eq(archiveSchedule.id, input.id))
        .returning();

      return updated;
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select()
        .from(archiveSchedule)
        .where(eq(archiveSchedule.id, input.id));

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "计划不存在" });
      }

      if (
        viewer.role !== "root" &&
        existing.organizationId !== viewer.organizationId
      ) {
        throw new ORPCError("NOT_FOUND", { message: "计划不存在" });
      }

      await context.db
        .delete(archiveSchedule)
        .where(eq(archiveSchedule.id, input.id));

      return { id: input.id };
    }),

  /** 立即执行一次（用于验证配置，不影响下次计划时间）。 */
  runNow: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [schedule] = await context.db
        .select()
        .from(archiveSchedule)
        .where(eq(archiveSchedule.id, input.id));

      if (!schedule) {
        throw new ORPCError("NOT_FOUND", { message: "计划不存在" });
      }

      if (
        viewer.role !== "root" &&
        schedule.organizationId !== viewer.organizationId
      ) {
        throw new ORPCError("NOT_FOUND", { message: "计划不存在" });
      }

      const storage = requireStorage(context.storage);

      const beforeAt = new Date(
        Date.now() - schedule.beforeDays * 24 * 60 * 60 * 1000
      );

      // 本地目标先做体积校验，避免任务已经开始打包才失败。
      const resolvedTarget = await resolveArchiveTarget(
        context.db,
        schedule.organizationId,
        schedule.targetId
      );

      if (!resolvedTarget) {
        throw new ORPCError("NOT_FOUND", { message: "存储目标不存在" });
      }

      await assertLocalTargetAllowed(
        context,
        schedule.organizationId,
        resolvedTarget,
        beforeAt
      );

      const { job } = await createArchiveJob({
        beforeAt,
        chunkBytes: schedule.chunkBytes,
        db: context.db,
        deleteSource: schedule.deleteSource,
        organizationId: schedule.organizationId,
        requestedBy: viewer.id,
        storage,
        targetId: schedule.targetId,
      });

      await context.db
        .update(archiveSchedule)
        .set({
          lastError: null,
          lastJobId: job.id,
          lastRunAt: new Date(),
          nextRunAt: new Date(
            computeNextRunMs(
              {
                dayOfMonth: schedule.dayOfMonth,
                frequency: schedule.frequency,
                hour: schedule.hour,
                weekday: schedule.weekday,
              },
              Date.now()
            )
          ),
        })
        .where(eq(archiveSchedule.id, schedule.id));

      return { jobId: job.id };
    }),
};

/** 供 scheduler 复用的计算入口（毫秒时间戳）。 */
export const computeNextRunMs = (
  timing: {
    dayOfMonth: number;
    frequency: (typeof archiveFrequency)[number];
    hour: number;
    weekday: number;
  },
  from: number
): number => {
  const fromDate = new Date(from);
  const hour = Math.min(23, Math.max(0, Math.trunc(timing.hour)));

  for (let offset = 0; offset < 400; offset += 1) {
    const candidate = new Date(fromDate);
    candidate.setDate(fromDate.getDate() + offset);
    candidate.setHours(hour, 0, 0, 0);

    if (candidate.getTime() <= from) {
      continue;
    }

    if (timing.frequency === "daily") {
      return candidate.getTime();
    }

    if (timing.frequency === "weekly") {
      const jsDay = timing.weekday === 7 ? 0 : timing.weekday;

      if (candidate.getDay() === jsDay) {
        return candidate.getTime();
      }

      continue;
    }

    if (candidate.getDate() === Math.min(28, Math.max(1, timing.dayOfMonth))) {
      return candidate.getTime();
    }
  }

  return from + 24 * 60 * 60 * 1000;
};
