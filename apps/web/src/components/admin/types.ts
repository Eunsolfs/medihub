import type { AppRouterClient } from "@medihub/api";

/**
 * 管理端的数据类型全部从 oRPC 客户端推导，接口变化时不需要手改。
 * 推导方式与患者档案模块保持一致（见 components/patients/types.ts）。
 */
type ProcedureOutput<TProcedure> = TProcedure extends (
  ...args: never[]
) => Promise<infer TOutput>
  ? TOutput
  : never;

type UserClient = AppRouterClient["users"];

type OrgsClient = AppRouterClient["orgs"];

type StorageClient = AppRouterClient["storage"];

type ArchiveClient = AppRouterClient["archive"];

type AuditClient = AppRouterClient["audit"];

type UsersList = ProcedureOutput<UserClient["list"]>;

export type UserRow = UsersList["items"][number];

export type UserRole = UserRow["role"];

export type UserStatus = UserRow["status"];

type OrgsList = ProcedureOutput<OrgsClient["list"]>;

export type OrgRow = OrgsList["items"][number];

export type OrgKind = OrgRow["kind"];

export type StorageTargetRow = ProcedureOutput<StorageClient["list"]>[number];

export type StorageDriver = StorageTargetRow["driver"];

export type StorageScope = StorageTargetRow["scope"];

export type StorageUsage = ProcedureOutput<StorageClient["usage"]>;

export type OrganizationUsage = StorageUsage["organizations"][number];

export type DiskUsage = StorageUsage["disks"][number];

type ArchiveList = ProcedureOutput<ArchiveClient["list"]>;

export type ArchiveJobRow = ArchiveList["items"][number];

export type ArchiveDetail = ProcedureOutput<ArchiveClient["get"]>;

export type ArchiveChunkRow = ArchiveDetail["chunks"][number];

export type ArchiveScheduleRow = ProcedureOutput<
  ArchiveClient["schedules"]["list"]
>["items"][number];

type MirrorClient = AppRouterClient["mirror"];

type MirrorList = ProcedureOutput<MirrorClient["list"]>;

export type MirrorJobRow = MirrorList["items"][number];

type AuditList = ProcedureOutput<AuditClient["list"]>;

export type AuditRow = AuditList["items"][number];

type SystemClient = AppRouterClient["system"];

/** 在线升级面板的完整状态（当前版本 / 最新 Release / 任务状态 / 可回滚）。 */
export type UpdateStatus = ProcedureOutput<SystemClient["updateStatus"]>;

/** 系统管理页只对两种管理员角色开放。 */
type AdminRole = "root" | "dept_admin";

/** 页面从会话里读出的操作者信息：服务端仍会按角色重新校验。 */
export interface AdminViewer {
  id: string;
  organizationId: string | null;
  role: AdminRole;
}
