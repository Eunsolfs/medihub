import { ORPCError } from "@orpc/server";

import type { SessionUser } from "@medihub/auth";

/**
 * root 最高权限管理员 / 科室管理员 / 科室成员 / 无所属组织的自然人。
 * 自然人拥有自动创建的个人组织，因此在组织内部拥有与科室管理员同等的权力，
 * 但只能看到自己组织（即自己）的数据。
 */
export type Role = "root" | "dept_admin" | "member" | "individual";

export interface Viewer {
  email: string;
  id: string;
  name: string;
  organizationId: string | null;
  role: Role;
  status: "active" | "disabled";
  title: string | null;
}

const ROLES: ReadonlySet<string> = new Set([
  "root",
  "dept_admin",
  "member",
  "individual",
]);

const asRole = (value: unknown): Role =>
  typeof value === "string" && ROLES.has(value)
    ? (value as Role)
    : "individual";

export const toViewer = (user: SessionUser): Viewer => ({
  email: user.email,
  id: user.id,
  name: user.name,
  organizationId:
    typeof user.organizationId === "string" ? user.organizationId : null,
  role: asRole(user.role),
  status: user.status === "disabled" ? "disabled" : "active",
  title: typeof user.title === "string" ? user.title : null,
});

export const isAdminRole = (role: Role) =>
  role === "root" || role === "dept_admin";

/** 能管理成员与存储配置的角色。 */
export const requireAdmin = (viewer: Viewer) => {
  if (!isAdminRole(viewer.role)) {
    throw new ORPCError("FORBIDDEN", { message: "需要科室管理员及以上权限" });
  }
};

export const requireRoot = (viewer: Viewer) => {
  if (viewer.role !== "root") {
    throw new ORPCError("FORBIDDEN", { message: "需要超级管理员权限" });
  }
};

/** 跨科室访问一律视为不存在，避免泄露其它科室的数据是否存在。 */
export const assertOrganization = (viewer: Viewer, organizationId: string) => {
  if (viewer.role === "root") {
    return;
  }

  if (viewer.organizationId !== organizationId) {
    throw new ORPCError("NOT_FOUND", { message: "记录不存在" });
  }
};

/**
 * 临床数据的删除权：管理员可删任意记录，普通成员只能删自己创建的记录。
 */
export const canDelete = (
  viewer: Viewer,
  createdBy: string | null | undefined
) =>
  isAdminRole(viewer.role) ||
  viewer.role === "individual" ||
  createdBy === viewer.id;

/**
 * 患者档案的可见与可编辑范围。
 *
 * 「谁的患者归谁」：创建者本人与科室管理员（及以上）可见可编辑，
 * 同科室的其他成员既看不到、也不能改，避免互相翻阅未授权的病历。
 * 自然人的个人空间里所有档案都是自己创建的，因此不额外限制。
 */
export const canAccessPatient = (
  viewer: Viewer,
  record: { createdBy?: string | null; organizationId?: string }
) => {
  if (isAdminRole(viewer.role)) {
    return true;
  }

  if (record.createdBy && record.createdBy === viewer.id) {
    return true;
  }

  return (
    viewer.role === "individual" &&
    record.organizationId !== undefined &&
    record.organizationId === viewer.organizationId
  );
};

/** 患者档案列表的过滤条件：非管理员只能看到自己建档的患者。 */
export const canSeeAllPatients = (viewer: Viewer) => isAdminRole(viewer.role);

/**
 * 科室内的「有主内容」（帖子、学习会议、患者档案）统一口径：
 * 管理员看全部，普通成员只看自己创建的那些。
 */
export const canSeeAllContent = (viewer: Viewer) => isAdminRole(viewer.role);

/** 有主内容的编辑权：创建者本人或管理员。 */
export const canEditOwned = (
  viewer: Viewer,
  ownerId: string | null | undefined
) => isAdminRole(viewer.role) || ownerId === viewer.id;

/** `organizationProcedure` 之后的上下文一定有组织，这里把类型收窄成非空。 */
export const organizationIdOf = (context: { organizationId?: string }) => {
  if (!context.organizationId) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "当前账号没有归属科室",
    });
  }

  return context.organizationId;
};
