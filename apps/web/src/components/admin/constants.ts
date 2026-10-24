import type {
  OrgKind,
  StorageDriver,
  StorageScope,
  UserRole,
  UserStatus,
} from "#src/components/admin/types.ts";
import { roleLabel } from "#src/lib/format.ts";

export const PAGE_SIZE = 20;

/** 筛选器里「全部」的哨兵值：oRPC 输入用 undefined 表示不过滤。 */
export const ALL = "all";

/** 表单里「不归属科室」的哨兵值。 */
export const NO_ORGANIZATION = "__none__";

export const USER_ROLE_VALUES = [
  "member",
  "dept_admin",
  "root",
  "individual",
] as const satisfies readonly UserRole[];

export const isUserRole = (value: string): value is UserRole =>
  USER_ROLE_VALUES.some((role) => role === value);

export const userRoleLabel = (role: UserRole) => roleLabel(role);

export const USER_STATUS_VALUES = [
  "active",
  "disabled",
] as const satisfies readonly UserStatus[];

export const isUserStatus = (value: string): value is UserStatus =>
  USER_STATUS_VALUES.some((status) => status === value);

export const userStatusLabel = (status: UserStatus) =>
  status === "active" ? "正常" : "已停用";

export const ORG_KIND_VALUES = [
  "department",
  "personal",
] as const satisfies readonly OrgKind[];

export const isOrgKind = (value: string): value is OrgKind =>
  ORG_KIND_VALUES.some((kind) => kind === value);

export const orgKindLabel = (kind: OrgKind) =>
  kind === "department" ? "科室" : "个人空间";

export const STORAGE_DRIVER_VALUES = [
  "local",
  "nas",
  "s3",
] as const satisfies readonly StorageDriver[];

export const isStorageDriver = (value: string): value is StorageDriver =>
  STORAGE_DRIVER_VALUES.some((driver) => driver === value);

const STORAGE_DRIVER_LABELS: Record<StorageDriver, string> = {
  local: "本地磁盘",
  nas: "NAS 挂载",
  s3: "S3 对象存储",
};

export const storageDriverLabel = (driver: StorageDriver) =>
  STORAGE_DRIVER_LABELS[driver];

export const storageScopeLabel = (scope: StorageScope) =>
  scope === "global" ? "全部科室" : "本科室";

/** 审计日志里出现过的操作；新增操作时在这里补一条即可。 */
export const AUDIT_ACTION_OPTIONS = [
  { label: "创建账号", value: "user.create" },
  { label: "更新账号", value: "user.update" },
  { label: "删除账号", value: "user.remove" },
  { label: "创建科室", value: "org.create" },
  { label: "更新科室", value: "org.update" },
  { label: "删除科室", value: "org.remove" },
  { label: "新建存储目标", value: "storage.create" },
  { label: "更新存储目标", value: "storage.update" },
  { label: "设为默认存储", value: "storage.set_default" },
  { label: "删除存储目标", value: "storage.remove" },
  { label: "创建导出任务", value: "export.create" },
  { label: "删除导出记录", value: "export.remove" },
] as const;

export const auditActionLabel = (action: string) => {
  const option = AUDIT_ACTION_OPTIONS.find((item) => item.value === action);

  return option?.label ?? action;
};

const ENTITY_TYPE_LABELS = new Map<string, string>([
  ["export_job", "导出任务"],
  ["organization", "科室"],
  ["storage_target", "存储目标"],
  ["user", "账号"],
]);

export const auditEntityTypeLabel = (entityType: string) =>
  ENTITY_TYPE_LABELS.get(entityType) ?? entityType;
