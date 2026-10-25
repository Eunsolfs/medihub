import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  snakeCase,
  text,
} from "drizzle-orm/sqlite-core";

import { user } from "#src/schema/auth.ts";
import { primaryId, timestamps } from "#src/schema/common.ts";
import { organization } from "#src/schema/organization.ts";

export const storageDriver = ["local", "nas", "s3"] as const;

/** 全站键值配置（容量上限等不需要独立表结构的少量设置）。 */
export const appSetting = snakeCase.table("app_setting", {
  key: text().primaryKey(),
  value: text().notNull(),
  ...timestamps,
});

/**
 * 一个可写入的存储位置。`config` 是 AES-256-GCM 加密后的 JSON，
 * 平台不落明文密钥；解密只发生在服务端进程内。
 */
export const storageTarget = snakeCase.table(
  "storage_target",
  {
    id: primaryId(),
    /** null 表示全站共享；有值时仅该科室可用。 */
    organizationId: text().references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text().notNull(),
    driver: text({ enum: storageDriver }).notNull(),
    /** 加密后的 JSON：local/nas 是 { rootPath }，s3 是 endpoint/bucket/密钥等。 */
    config: text().notNull(),
    isDefault: integer({ mode: "boolean" }).notNull().default(false),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("storage_target_organization_idx").on(table.organizationId),
    check("storage_target_config_present", sql`length(${table.config}) > 0`),
  ]
);

export const exportKind = [
  "patient",
  "admission",
  "session",
  "post",
  "selection",
] as const;

export const exportStatus = ["pending", "running", "ready", "failed"] as const;

/** 一次导出任务：打成 zip 后保存到某个存储目标，供下载。 */
export const exportJob = snakeCase.table(
  "export_job",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestedBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text({ enum: exportKind }).notNull(),
    /** 导出参数（患者 id、入出院 id、勾选的字段与附件 id 等）。 */
    params: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text({ enum: exportStatus }).notNull().default("pending"),
    fileName: text(),
    storageTargetId: text(),
    storageKey: text(),
    byteSize: integer(),
    assetCount: integer(),
    error: text(),
    completedAt: integer({ mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("export_job_organization_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("export_job_requester_idx").on(table.requestedBy),
  ]
);

/** 敏感操作审计：登录之外的数据变更、下载、权限调整。 */
export const auditLog = snakeCase.table(
  "audit_log",
  {
    id: primaryId(),
    organizationId: text().references(() => organization.id, {
      onDelete: "cascade",
    }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),
    detail: text({ mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer({ mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`),
  },
  (table) => [
    index("audit_log_organization_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("audit_log_actor_idx").on(table.actorId),
  ]
);

export const archiveStatus = ["pending", "running", "ready", "failed"] as const;

export interface ArchiveChunk {
  index: number;
  /** 存储目标内的相对路径。 */
  key: string;
  size: number;
}

/**
 * 一次冷数据归档：把某科室在 `beforeAt` 之前上传的素材打成若干分片 zip，
 * 推到指定存储目标；可选删除服务器上的源文件以释放空间。
 */
export const archiveJob = snakeCase.table(
  "archive_job",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    requestedBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text({ enum: archiveStatus }).notNull().default("pending"),
    /** 只归档这个时间点之前上传的素材。 */
    beforeAt: integer({ mode: "timestamp_ms" }).notNull(),
    /** 每片压缩包的目标大小（字节），实际按素材边界切分。 */
    chunkBytes: integer().notNull(),
    chunks: text({ mode: "json" })
      .$type<ArchiveChunk[]>()
      .notNull()
      .default(sql`'[]'`),
    chunkCount: integer().notNull().default(0),
    assetCount: integer().notNull().default(0),
    byteSize: integer().notNull().default(0),
    storageTargetId: text().notNull(),
    storagePrefix: text().notNull(),
    deleteSource: integer({ mode: "boolean" }).notNull().default(false),
    error: text(),
    completedAt: integer({ mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("archive_job_organization_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("archive_job_status_idx").on(table.status),
  ]
);

export const archiveFrequency = ["daily", "weekly", "monthly"] as const;

/** 定时归档计划：到期后按截止天数把旧素材归档到指定目标，自动运营。 */
export const archiveSchedule = snakeCase.table(
  "archive_schedule",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enabled: integer({ mode: "boolean" }).notNull().default(true),
    frequency: text({ enum: archiveFrequency }).notNull().default("monthly"),
    /** 本地时间整点（0-23）。 */
    hour: integer().notNull().default(3),
    /** weekly 用：1=周一 … 7=周日。 */
    weekday: integer().notNull().default(1),
    /** monthly 用：1-28，避免月末不存在。 */
    dayOfMonth: integer().notNull().default(1),
    /** 归档「多少天之前上传」的素材。 */
    beforeDays: integer().notNull().default(730),
    chunkBytes: integer()
      .notNull()
      .default(200 * 1024 * 1024),
    targetId: text().notNull(),
    deleteSource: integer({ mode: "boolean" }).notNull().default(true),
    lastRunAt: integer({ mode: "timestamp_ms" }),
    nextRunAt: integer({ mode: "timestamp_ms" }),
    lastJobId: text(),
    lastError: text(),
    ...timestamps,
  },
  (table) => [
    index("archive_schedule_org_idx").on(table.organizationId, table.enabled),
    index("archive_schedule_next_idx").on(table.enabled, table.nextRunAt),
  ]
);

export const mirrorStatus = ["pending", "running", "ready", "failed"] as const;

/** 镜像备份任务：把数据库快照（可选连同素材）复制到另一个存储目标。 */
export const mirrorJob = snakeCase.table(
  "mirror_job",
  {
    id: primaryId(),
    organizationId: text().references(() => organization.id, {
      onDelete: "cascade",
    }),
    requestedBy: text().references(() => user.id, { onDelete: "set null" }),
    status: text({ enum: mirrorStatus }).notNull().default("pending"),
    includeAssets: integer({ mode: "boolean" }).notNull().default(false),
    targetId: text().notNull(),
    storagePrefix: text().notNull(),
    dbKey: text(),
    manifestKey: text(),
    assetCount: integer().notNull().default(0),
    byteSize: integer().notNull().default(0),
    error: text(),
    completedAt: integer({ mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [index("mirror_job_created_idx").on(table.createdAt)]
);

export type ArchiveSchedule = typeof archiveSchedule.$inferSelect;

export type MirrorJobRow = typeof mirrorJob.$inferSelect;

export type StorageTarget = typeof storageTarget.$inferSelect;

export type StorageDriver = (typeof storageDriver)[number];

export type ExportJob = typeof exportJob.$inferSelect;

export type AuditLog = typeof auditLog.$inferSelect;

export type ArchiveJob = typeof archiveJob.$inferSelect;
