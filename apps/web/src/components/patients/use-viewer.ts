import { useRouteContext } from "@tanstack/react-router";

import { getSessionRole } from "#src/components/app-shell/roles.ts";

/**
 * 会话上的角色：better-auth 的 Session 类型没有业务字段，
 * 由 app-shell 的宽松读取器解析。这里只做展示层的门禁，真正的权限由 oRPC 过程兜底。
 */
export const useViewer = () => {
  const { session } = useRouteContext({ from: "__root__" });
  const role = getSessionRole(session);
  const isAdmin = role === "root" || role === "dept_admin";

  return {
    canManageIdCard: isAdmin,
    id: session?.user.id,
    isAdmin,
    name: session?.user.name,
    role,
  };
};

/**
 * 编辑 / 删除权：作者本人或管理员（root / dept_admin）。
 * 跨科室管理员在后端只会拿到 NOT_FOUND，页面根本渲染不出来，因此这里不需要再做科室比较。
 */
export const canEditRecord = (input: {
  role: string | undefined;
  viewerId: string | undefined;
  createdBy: string | null | undefined;
}) => {
  if (input.role === "root" || input.role === "dept_admin") {
    return true;
  }

  return Boolean(input.viewerId) && input.createdBy === input.viewerId;
};
