import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  snakeCase,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "#src/schema/auth.ts";
import {
  primaryId,
  shareVisibility,
  tagsColumn,
  timestamp,
  timestamps,
} from "#src/schema/common.ts";
import { learningSession } from "#src/schema/learning.ts";
import { organization } from "#src/schema/organization.ts";
import { admission, patient } from "#src/schema/patients.ts";

/** 资料库的可视范围：整个科室可见，或仅创建者可见。 */
export const assetVisibility = ["org", "private"] as const;

export const assetKind = [
  "image",
  "video",
  "document",
  "audio",
  "archive",
  "other",
] as const;

/** 临床照片的分期，时间线按它分组，也用于导出时筛选。 */
export const clinicalStage = [
  "preop",
  "intraop",
  "postop",
  "follow_up",
  "imaging",
  "pathology",
  "other",
] as const;

export { shareVisibility };

export const postVisibility = shareVisibility;

/** 资料库中的文件夹 / 专题。 */
export const collection = snakeCase.table(
  "collection",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    parentId: text(),
    name: text().notNull(),
    description: text(),
    visibility: text({ enum: assetVisibility }).notNull().default("org"),
    sortOrder: integer().notNull().default(0),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("collection_organization_idx").on(
      table.organizationId,
      table.parentId
    ),
    check(
      "collection_name_length",
      sql`length(trim(${table.name})) between 1 and 120`
    ),
  ]
);

/** 指定可见范围的受众：某个/某些科室，或某个/某些用户。 */
export const contentAudience = snakeCase.table(
  "content_audience",
  {
    id: primaryId(),
    /** post | session */
    contentType: text({ enum: ["post", "session"] as const }).notNull(),
    contentId: text().notNull(),
    /** organization | user */
    targetType: text({ enum: ["organization", "user"] as const }).notNull(),
    targetId: text().notNull(),
    ...timestamps,
  },
  (table) => [
    index("content_audience_content_idx").on(
      table.contentType,
      table.contentId
    ),
    index("content_audience_target_idx").on(table.targetType, table.targetId),
    check(
      "content_audience_target_distinct",
      sql`length(${table.targetId}) > 0`
    ),
  ]
);

/** 教学 / 分享帖子，类似 WordPress：草稿 → 发布，按可见范围对外分享。 */
export const post = snakeCase.table(
  "post",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    /** 对外分享用的短链标识：/p/<slug>。 */
    slug: text().notNull(),
    excerpt: text(),
    /** Markdown 正文。 */
    content: text().notNull().default(""),
    /** 封面图指向一个 asset，不设外键以免与 asset.postId 形成环。 */
    coverAssetId: text(),
    visibility: text({ enum: postVisibility }).notNull().default("org"),
    /**
     * 「任何人」可见时可选访问密码（scrypt 哈希）。
     * 只有 `visibility = public` 且设置了密码时才会拦截阅读与素材下载。
     */
    accessPasswordHash: text(),
    status: text({ enum: ["draft", "published"] as const })
      .notNull()
      .default("draft"),
    publishedAt: timestamp(),
    tags: tagsColumn(),
    viewCount: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("post_slug_unique").on(table.slug),
    index("post_organization_idx").on(table.organizationId, table.status),
    index("post_author_idx").on(table.authorId),
  ]
);

/** 帖子内嵌的多媒体：本系统素材、B 站视频、外部链接。 */
export const postMediaProvider = ["asset", "bilibili", "external"] as const;
export const postMediaKind = ["video", "image", "audio", "file"] as const;

export const postMedia = snakeCase.table(
  "post_media",
  {
    id: primaryId(),
    postId: text()
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    kind: text({ enum: postMediaKind }).notNull().default("video"),
    provider: text({ enum: postMediaProvider }).notNull().default("asset"),
    assetId: text(),
    /** provider=bilibili 时是 BV 号或完整链接；provider=external 时是外链。 */
    url: text(),
    title: text(),
    durationSeconds: integer(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("post_media_post_idx").on(table.postId, table.sortOrder),
    check(
      "post_media_source",
      sql`(${table.provider} = 'asset' and ${table.assetId} is not null)
        or (${table.provider} in ('bilibili', 'external') and ${table.url} is not null)`
    ),
  ]
);

/**
 * 一个文件（图片 / 视频 / 文档 / 压缩包…）。既可以是患者某次入院的临床资料，
 * 也可以是科室资料库里的培训材料，或帖子附件 / 学习会议材料。
 */
export const asset = snakeCase.table(
  "asset",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text({ enum: assetKind }).notNull(),
    mimeType: text().notNull(),
    originalName: text().notNull(),
    byteSize: integer().notNull(),
    /** sha-256，用于去重与完整性校验。 */
    checksum: text().notNull(),
    /** 存储目标（本地 / NAS / S3），见 storage_target。 */
    storageTargetId: text().notNull(),
    /** 在目标内的相对路径，例如 patient/2026/10/uuid.jpg。 */
    storageKey: text().notNull(),
    width: integer(),
    height: integer(),
    durationMs: integer(),
    /** 拍摄 / 资料日期，时间线按它排序。 */
    capturedAt: timestamp(),
    stage: text({ enum: clinicalStage }),
    /** 部位，如「左前臂」。 */
    bodyPart: text(),
    description: text(),
    tags: tagsColumn(),
    visibility: text({ enum: assetVisibility }).notNull().default("org"),
    patientId: text().references(() => patient.id, { onDelete: "cascade" }),
    admissionId: text().references(() => admission.id, { onDelete: "cascade" }),
    collectionId: text().references(() => collection.id, {
      onDelete: "set null",
    }),
    sessionId: text().references(() => learningSession.id, {
      onDelete: "set null",
    }),
    postId: text().references(() => post.id, { onDelete: "set null" }),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 时间线内的手工顺序，同一天的照片可拖拽调整。 */
    timelineOrder: integer().notNull().default(0),
    deletedAt: timestamp(),
    ...timestamps,
  },
  (table) => [
    index("asset_organization_idx").on(table.organizationId, table.createdAt),
    index("asset_patient_idx").on(table.patientId, table.capturedAt),
    index("asset_admission_idx").on(table.admissionId, table.capturedAt),
    index("asset_collection_idx").on(table.collectionId),
    index("asset_session_idx").on(table.sessionId),
    index("asset_post_idx").on(table.postId),
    index("asset_checksum_idx").on(table.organizationId, table.checksum),
    check("asset_byte_size_positive", sql`${table.byteSize} > 0`),
  ]
);

export type Asset = typeof asset.$inferSelect;

export type AssetKind = (typeof assetKind)[number];

export type ClinicalStage = (typeof clinicalStage)[number];

export type Collection = typeof collection.$inferSelect;

export type Post = typeof post.$inferSelect;

export type PostVisibility = (typeof postVisibility)[number];

export type PostMedia = typeof postMedia.$inferSelect;
