import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * 站点入口只做分流：已登录进工作台，未登录进登录页。
 * 没有独立的落地页，避免在后台系统里出现营销页式的空转。
 */
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.session ? "/dashboard" : "/login" });
  },
});
