const ADMIN_ROLES = ["root", "dept_admin"] as const;

/**
 * 系统管理（/admin）入口仅对超级管理员与科室管理员可见。
 * 角色中文名统一取 #src/lib/format.ts 的 roleLabel。
 */
export const isAdminRole = (role: string | undefined): boolean =>
  ADMIN_ROLES.some((adminRole) => adminRole === role);

/**
 * 没有归属科室的账号（注册后落在个人空间）：患者档案与上传一律不可用。
 * 这是产品口径上的硬拦截，不是只读提示。
 */
export const isOrglessRole = (role: string | undefined): boolean =>
  role === "individual";

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
