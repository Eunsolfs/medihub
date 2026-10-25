import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@medihub/ui/components/sonner";

import { InstallPrompt } from "#src/components/pwa/install-prompt.tsx";
import { getSession } from "#src/lib/auth.ts";

interface RouterContext {
  queryClient: QueryClient;
}

/** 开发工具会浮在底部导航上，截图与端到端测试时通过 `VITE_DEVTOOLS=off` 关掉。 */
const showDevtools =
  import.meta.env.DEV && import.meta.env.VITE_DEVTOOLS !== "off";

const RootLayout = () => (
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    disableTransitionOnChange
    scriptProps={{ type: "application/json" }}
  >
    <HeadContent />
    <Outlet />
    <Toaster position="top-center" richColors />
    <InstallPrompt />
    {showDevtools ? (
      <>
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools buttonPosition="bottom-right" />
      </>
    ) : null}
  </ThemeProvider>
);

export const Route = createRootRouteWithContext<RouterContext>()({
  // 会话接口偶发失败（服务重启、网络抖动）时按未登录处理：
  // 页面会跳到登录页，而不是整站白屏报错。
  beforeLoad: async () => {
    try {
      return { session: await getSession() };
    } catch {
      return { session: null };
    }
  },
  // 会话 5 分钟内不重复请求：否则每次点击侧栏都会重新校验登录态，
  // 页面先闪成空白/骨架再恢复。
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "医档通 MediHub" },
      {
        name: "description",
        content: "医院科室多媒体与病历资料管理后台",
      },
    ],
  }),
  component: RootLayout,
});
