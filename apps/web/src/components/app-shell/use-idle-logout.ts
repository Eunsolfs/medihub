import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { beginBusyTask, endBusyTask, isBusy } from "#src/lib/activity.ts";
import { authClient } from "#src/lib/auth.ts";

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

/** 活动事件节流：滚动会高频触发，只记录到秒级即可。 */
const ACTIVITY_THROTTLE_MS = 1000;

/** 后台标签页的定时器会被浏览器降频，回到前台时再补一次检查。 */
const CHECK_INTERVAL_MS = 20_000;

/** 下载开始后先占住忙碌状态这么久，避免大文件还在传就被踢下线。 */
const DOWNLOAD_BUSY_MS = 60_000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
] as const;

const EVENT_OPTIONS = { passive: true } as const;

/** 下载链接：带 download 属性，或指向 /api/*&#47;download。 */
const isDownloadLink = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const anchor = target.closest("a[href]");

  if (!(anchor instanceof HTMLAnchorElement)) {
    return false;
  }

  const href = anchor.getAttribute("href") ?? "";

  return anchor.hasAttribute("download") || /\/download(?:[?#]|$)/u.test(href);
};

/**
 * 登录后 1 小时无操作自动登出。
 *
 * - 上传/覆盖保存/下载等长任务通过 `lib/activity` 的忙碌计数暂停登出，
 *   任务结束后重新计时；
 * - 页面切到后台只是暂停检查，回到前台按「最后一次活动时间」补算，
 *   超时且不忙才登出；
 * - 全程 SPA 导航，不做整页刷新。
 */
export const useIdleLogout = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const href = useRouterState({ select: (state) => state.location.href });
  const hrefRef = useRef(href);
  const lastActivityRef = useRef(0);
  const wasBusyRef = useRef(false);
  const signingOutRef = useRef(false);

  useEffect(() => {
    hrefRef.current = href;
  }, [href]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // 挂载时开始计时；忙碌中的任务（例如刷新页面时仍在进行的场景）先不打断。
    lastActivityRef.current = Date.now();
    wasBusyRef.current = isBusy();

    const markActivity = () => {
      const now = Date.now();

      if (now - lastActivityRef.current >= ACTIVITY_THROTTLE_MS) {
        lastActivityRef.current = now;
      }
    };

    const signOutForIdle = async () => {
      if (signingOutRef.current) {
        return;
      }

      signingOutRef.current = true;

      // 先记住用户原本所在的页面：invalidate 会把地址改写成 /login?redirect=…，
      // 之后再读 hrefRef 会拿到登录页自己，造成 redirect 嵌套。
      const redirectTarget = hrefRef.current;

      try {
        await authClient.signOut();
      } catch {
        // 网络异常也要回到登录页，避免界面停在已失效的会话上。
      }

      queryClient.clear();

      await router.invalidate();
      await router.navigate({
        search: { redirect: redirectTarget },
        to: "/login",
      });

      // 导航到登录页后再提示：登出会卸载当前布局，提前弹的 toast 会随路由切换消失。
      toast.warning("已超过 1 小时未操作，请重新登录");
    };

    const checkIdle = () => {
      const busy = isBusy();

      // 忙碌期间不计时：任务结束后从这一刻重新开始。
      if (wasBusyRef.current && !busy) {
        lastActivityRef.current = Date.now();
      }

      wasBusyRef.current = busy;

      if (busy || signingOutRef.current) {
        return;
      }

      if (Date.now() - lastActivityRef.current < IDLE_TIMEOUT_MS) {
        return;
      }

      void signOutForIdle();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkIdle();
      }
    };

    // 下载链接在点击时临时占用忙碌状态。浏览器不提供「下载完成」事件，
    // 用固定窗口兜底，窗口内不会因为空闲计时被登出。
    const pendingDownloadTimers = new Map<number, true>();

    const handleDownloadClick = (event: Event) => {
      if (!isDownloadLink(event.target)) {
        return;
      }

      beginBusyTask();

      const downloadTimer = window.setTimeout(() => {
        pendingDownloadTimers.delete(downloadTimer);
        endBusyTask();
      }, DOWNLOAD_BUSY_MS);

      pendingDownloadTimers.set(downloadTimer, true);
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, EVENT_OPTIONS);
    }

    document.addEventListener("click", handleDownloadClick, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity);
      }

      document.removeEventListener("click", handleDownloadClick, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);

      for (const downloadTimer of pendingDownloadTimers.keys()) {
        window.clearTimeout(downloadTimer);
        endBusyTask();
      }

      pendingDownloadTimers.clear();
    };
  }, [queryClient, router]);
};
