const ADMIN_ROLES = ["root", "dept_admin"] as const;

/**
 * 系统管理（/admin）入口仅对超级管理员与科室管理员可见。
 * 角色中文名统一取 #src/lib/format.ts 的 roleLabel。
 */
export const isAdminRole = (role: string | undefined): boolean =>
  ADMIN_ROLES.some((adminRole) => adminRole === role);

type SessionLike = { user: object | null } | null | undefined;

/**
 * 会话里的 role 由服务端写入 Better Auth user，类型定义里没有这个字段。
 * 这里只做展示用的宽松读取：角色不是字符串时视为未设置，不参与任何权限判断。
 */
export const getSessionRole = (session: SessionLike): string | undefined => {
  const user = session?.user;

  if (user === null || user === undefined || !("role" in user)) {
    return undefined;
  }

  const { role } = user;

  if (
    role === "root" ||
    role === "dept_admin" ||
    role === "member" ||
    role === "individual"
  ) {
    return role;
  }

  return undefined;
};
