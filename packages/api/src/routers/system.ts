import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { requireRoot } from "#src/access.ts";
import { protectedProcedure } from "#src/procedures.ts";
import type { UpdateStatus } from "#src/update.ts";

const versionSchema = z
  .string()
  .trim()
  .regex(/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u, "版本号格式不正确");

/** root 才能看到/触发升级。 */
const rootOnly = (viewer: Parameters<typeof requireRoot>[0] | undefined) => {
  if (!viewer) {
    throw new ORPCError("UNAUTHORIZED");
  }

  requireRoot(viewer);

  return viewer;
};

export const systemRouter = {
  /** 升级面板：当前版本、最新 Release、执行状态与是否可回滚。 */
  updateStatus: protectedProcedure.handler(async ({ context }) => {
    rootOnly(context.viewer);

    const currentVersion = context.version ?? "unknown";
    const { updater } = context;

    if (!updater) {
      return {
        canRollback: false,
        currentVersion,
        enabled: false,
        latest: { error: "未配置在线升级", latestVersion: null },
        state: { phase: "idle" },
      } satisfies UpdateStatus;
    }

    const [latest, state, canRollback] = await Promise.all([
      updater.checkLatest(),
      updater.state(),
      updater.canRollback(),
    ]);

    return {
      canRollback,
      currentVersion,
      enabled: true,
      latest,
      state,
    } satisfies UpdateStatus;
  }),

  /** 发起升级：任务在服务端异步执行，前端轮询 updateStatus 看进度。 */
  startUpdate: protectedProcedure
    .input(z.object({ targetVersion: versionSchema }))
    .handler(async ({ context, input }) => {
      rootOnly(context.viewer);

      if (!context.updater) {
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "未启用在线升级，请先在服务端配置 UPDATE_ENABLED 等变量",
        });
      }

      const state = await context.updater.state();

      if (state.phase === "running") {
        throw new ORPCError("CONFLICT", { message: "已有升级任务在执行" });
      }

      const normalized = input.targetVersion.replace(/^v/u, "");

      // 不能升级到与当前相同的版本，避免无意义的重启。
      if (context.version === normalized) {
        throw new ORPCError("BAD_REQUEST", { message: "当前已是最新版本" });
      }

      return await context.updater.start(normalized);
    }),

  /** 回滚：还原最近一次升级前的代码与数据库。 */
  rollbackUpdate: protectedProcedure.handler(async ({ context }) => {
    rootOnly(context.viewer);

    if (!context.updater) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "未启用在线升级",
      });
    }

    if (!(await context.updater.canRollback())) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "没有可回滚的备份",
      });
    }

    return await context.updater.rollback();
  }),
};
