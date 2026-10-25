import { runDueArchiveSchedules } from "@medihub/api";

import { db, storage } from "#src/context.ts";

/**
 * 定时归档调度：进程内每分钟检查一次到期计划。
 * 单进程部署（本项目的默认形态）下足够；多实例部署应改为只在一个实例开启。
 */
export const startArchiveScheduler = () => {
  const tick = () => {
    void runDueArchiveSchedules({ db, storage }).catch((error: unknown) => {
      console.error("[archive-scheduler] 执行失败", error);
    });
  };

  // 启动后稍等再跑，避免和迁移/健康检查抢资源。
  setTimeout(tick, 5000);
  const timer = setInterval(tick, 60_000);

  timer.unref();

  return () => {
    clearInterval(timer);
  };
};
