import { and, eq, lte } from "drizzle-orm";

import type { Database } from "@medihub/db";
import { archiveSchedule } from "@medihub/db/schema/system";

import type { StorageAccess } from "#src/context.ts";
import { computeNextRun } from "#src/schedules.ts";
import {
  createArchiveJob,
  listArchiveCandidates,
  resolveArchiveTarget,
} from "#src/services/archive-create.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_TARGET_MAX_BYTES = 200 * 1024 * 1024;

const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

/**
 * 每分钟由服务端调用：把到期的归档计划变成真实归档任务。
 * 顺序执行，避免同一时刻多个任务同时打包拖垮磁盘。
 */
export const runDueArchiveSchedules = async (input: {
  db: Database;
  now?: Date;
  storage: StorageAccess;
}) => {
  const now = input.now ?? new Date();

  const due = await input.db
    .select()
    .from(archiveSchedule)
    .where(
      and(
        eq(archiveSchedule.enabled, true),
        lte(archiveSchedule.nextRunAt, now)
      )
    )
    .limit(5);

  const results: { id: string; jobId?: string; error?: string }[] = [];

  for (const schedule of due) {
    const beforeAt = new Date(now.getTime() - schedule.beforeDays * DAY_MS);

    const nextTiming = {
      dayOfMonth: schedule.dayOfMonth,
      frequency: schedule.frequency,
      hour: schedule.hour,
      weekday: schedule.weekday,
    };

    const nextRunAt = computeNextRun(nextTiming, now);

    try {
      const target = await resolveArchiveTarget(
        input.db,
        schedule.organizationId,
        schedule.targetId
      );

      if (!target) {
        throw new Error("存储目标已不可用，请重新选择目标");
      }

      if (target.driver === "local") {
        const candidates = await listArchiveCandidates(
          input.db,
          schedule.organizationId,
          beforeAt
        );

        const total = candidates.reduce((sum, row) => sum + row.byteSize, 0);

        if (total >= LOCAL_TARGET_MAX_BYTES) {
          throw new Error(
            `预计归档 ${(total / 1024 / 1024).toFixed(1)}MB，超过本地目标 200MB 限制；请改用 NAS/S3`
          );
        }
      }

      const { job } = await createArchiveJob({
        beforeAt,
        chunkBytes: schedule.chunkBytes,
        db: input.db,
        deleteSource: schedule.deleteSource,
        organizationId: schedule.organizationId,
        requestedBy: schedule.createdBy,
        storage: input.storage,
        targetId: schedule.targetId,
      });

      await input.db
        .update(archiveSchedule)
        .set({
          lastError: null,
          lastJobId: job.id,
          lastRunAt: now,
          nextRunAt,
        })
        .where(eq(archiveSchedule.id, schedule.id));

      results.push({ id: schedule.id, jobId: job.id });
    } catch (error) {
      await input.db
        .update(archiveSchedule)
        .set({
          lastError: messageOf(error),
          lastRunAt: now,
          nextRunAt,
        })
        .where(eq(archiveSchedule.id, schedule.id));

      results.push({ error: messageOf(error), id: schedule.id });
    }
  }

  return results;
};
