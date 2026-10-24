import { useRouteContext } from "@tanstack/react-router";

import { getSessionRole } from "#src/components/app-shell/roles.ts";

/**
 * 没有归属科室的账号（注册后落在个人空间）只能只读：浏览/下载，
 * 不能发帖子、开会议、建资料库目录或上传科室资料。
 */
export const useCanPublish = () => {
  const { session } = useRouteContext({ from: "/_authenticated" });

  return getSessionRole(session) !== "individual";
};
