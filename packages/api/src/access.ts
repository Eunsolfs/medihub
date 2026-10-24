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
 * 患者档案的可见与可编辑范围（「谁的患者归谁」）。
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
 * 科室内的「有主内容」（帖子、学习会议）统一口径：
 * 管理员看全部，普通成员看到本科室公开范围内的内容（只读）+ 自己创建的内容。
 */
export const canSeeAllContent = (viewer: Viewer) => isAdminRole(viewer.role);

/**
 * 没有归属科室的账号（`individual`，注册后落在个人空间）只能只读：
 * 可以浏览公开/登录可见的内容，但不能发帖子、开会议、建资料库目录。
 */
export const canPublishContent = (viewer: Viewer) =>
  viewer.role !== "individual";

/** 写操作前的校验：无科室账号一律拒绝。 */
export const requirePublishRights = (viewer: Viewer) => {
  if (!canPublishContent(viewer)) {
    throw new ORPCError("FORBIDDEN", {
      message:
        "当前账号没有归属科室，只能浏览内容；请联系管理员分配科室后再发布",
    });
  }
};

/** 有主内容的编辑权：创建者本人或管理员（与阅读权解耦）。 */
export const canEditOwned = (
  viewer: Viewer,
  ownerId: string | null | undefined
) => isAdminRole(viewer.role) || ownerId === viewer.id;

/**
 * 内容的可见范围（教学帖与学习会议共用）：
 * - private   仅自己（管理员可读）
 * - org       本科室登录用户
 * - logged_in 全系统登录用户
 * - selected  指定科室 / 指定用户（对象存 content_audience）
 * - public    任何人（带链接即可）
 */
export type PostShareVisibility =
  | "private"
  | "org"
  | "logged_in"
  | "selected"
  | "public";

/** 被拦下的原因：未登录 / 非本科室 / 仅作者 / 不在指定受众里。 */
export type PostGateReason =
  | "login"
  | "organization"
  | "owner"
  | "audience"
  | "password";

/** 指定受众（与 content_audience 表对应）。 */
export interface ShareAudience {
  organizations: string[];
  users: string[];
}

export interface PostShareRecord {
  authorId: string;
  organizationId: string;
  visibility: PostShareVisibility;
}

/**
 * 阅读范围判定：能读不等于能改，编辑权始终只归作者与管理员。
 */
export const postViewGate = (
  record: PostShareRecord,
  viewer: Viewer | null,
  audience?: ShareAudience
): { allowed: boolean; reason?: PostGateReason } => {
  if (record.visibility === "public") {
    return { allowed: true };
  }

  if (!viewer) {
    return { allowed: false, reason: "login" };
  }

  if (record.visibility === "logged_in") {
    return { allowed: true };
  }

  const sameOrganization = viewer.organizationId === record.organizationId;
  const isOwner = record.authorId === viewer.id;

  if (record.visibility === "private") {
    if (isOwner || viewer.role === "root") {
      return { allowed: true };
    }

    if (viewer.role === "dept_admin" && sameOrganization) {
      return { allowed: true };
    }

    return { allowed: false, reason: "owner" };
  }

  if (record.visibility === "selected") {
    if (isOwner || viewer.role === "root") {
      return { allowed: true };
    }

    if (viewer.role === "dept_admin" && sameOrganization) {
      return { allowed: true };
    }

    const inAudience =
      audience !== undefined &&
      ((viewer.organizationId !== null &&
        audience.organizations.includes(viewer.organizationId)) ||
        audience.users.includes(viewer.id));

    return inAudience
      ? { allowed: true }
      : { allowed: false, reason: "audience" };
  }

  if (viewer.role === "root" || sameOrganization) {
    return { allowed: true };
  }

  return { allowed: false, reason: "organization" };
};

/** `organizationProcedure` 之后的上下文一定有组织，这里把类型收窄成非空。 */
export const organizationIdOf = (context: { organizationId?: string }) => {
  if (!context.organizationId) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "当前账号没有归属科室",
    });
  }

  return context.organizationId;
};
