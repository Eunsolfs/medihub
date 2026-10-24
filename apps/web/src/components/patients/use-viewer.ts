import { useRouteContext } from "@tanstack/react-router";

const ROLES = ["root", "dept_admin", "member", "individual"] as const;

export type ViewerRole = (typeof ROLES)[number];

/**
 * 会话上的角色：better-auth 的 Session 类型没有业务字段，外壳也是这么取的。
 * 这里只做展示层的门禁，真正的权限由 oRPC 过程兜底。
 */
export const useViewer = () => {
  const { session } = useRouteContext({ from: "__root__" });
  const user: { role?: unknown } | undefined = session?.user;
  const role = ROLES.find((candidate) => candidate === user?.role);

  return {
    canManageIdCard: role === "root" || role === "dept_admin",
    id: session?.user.id,
    name: session?.user.name,
    role,
  };
};

/** 与后端 canDelete 保持一致：管理员可删任意记录，成员只能删自己创建的。 */
export const canDeleteRecord = (input: {
  role: ViewerRole | undefined;
  viewerId: string | undefined;
  createdBy: string | null | undefined;
}) =>
  input.role === "root" ||
  input.role === "dept_admin" ||
  input.role === "individual" ||
  (Boolean(input.viewerId) && input.createdBy === input.viewerId);
