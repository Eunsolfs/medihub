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

export type StorageTarget = typeof storageTarget.$inferSelect;

export type StorageDriver = (typeof storageDriver)[number];

export type ExportJob = typeof exportJob.$inferSelect;

export type AuditLog = typeof auditLog.$inferSelect;
