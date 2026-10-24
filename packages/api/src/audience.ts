import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { Database } from "@medihub/db";
import { user } from "@medihub/db/schema/auth";
import { contentAudience } from "@medihub/db/schema/content";

import type { PostShareVisibility, Viewer } from "#src/access.ts";

export type ContentType = "post" | "session";

export interface AudienceTargets {
  organizations: string[];
  users: string[];
}

/** 读取一条内容保存的指定受众。 */
export const loadAudience = async (
  db: Database,
  contentType: ContentType,
  contentId: string
): Promise<AudienceTargets> => {
  const rows = await db
    .select({
      targetId: contentAudience.targetId,
      targetType: contentAudience.targetType,
    })
    .from(contentAudience)
    .where(
      and(
        eq(contentAudience.contentType, contentType),
        eq(contentAudience.contentId, contentId)
      )
    );

  return {
    organizations: rows
      .filter((row) => row.targetType === "organization")
      .map((row) => row.targetId),
    users: rows
      .filter((row) => row.targetType === "user")
      .map((row) => row.targetId),
  };
};

/** 覆盖式保存受众：先清空再写入（一次编辑一个内容，量很小）。 */
export const replaceAudience = async (
  db: Database,
  contentType: ContentType,
  contentId: string,
  targets: AudienceTargets
) => {
  await db
    .delete(contentAudience)
    .where(
      and(
        eq(contentAudience.contentType, contentType),
        eq(contentAudience.contentId, contentId)
      )
    );

  const values = [
    ...targets.organizations.map((targetId) => ({
      contentId,
      contentType,
      targetId,
      targetType: "organization" as const,
    })),
    ...targets.users.map((targetId) => ({
      contentId,
      contentType,
      targetId,
      targetType: "user" as const,
    })),
  ];

  if (values.length > 0) {
    await db.insert(contentAudience).values(values);
  }
};

/** 删除内容时一并清理受众记录。 */
export const deleteAudience = async (
  db: Database,
  contentType: ContentType,
  contentId: string
) => {
  await db
    .delete(contentAudience)
    .where(
      and(
        eq(contentAudience.contentType, contentType),
        eq(contentAudience.contentId, contentId)
      )
    );
};

/**
 * 「指定科室 / 指定用户」的匹配条件：既支持列表里的 `post.id IN (...)`，
 * 也支持详情里判断当前访问者是否命中。
 */
export const audienceMatches = (
  db: Database,
  contentType: ContentType,
  contentIdColumns: Parameters<typeof inArray>[0],
  viewer: Viewer
): SQL | undefined => {
  const conditions: SQL[] = [];

  if (viewer.organizationId) {
    conditions.push(
      inArray(
        contentIdColumns,
        db
          .select({ id: contentAudience.contentId })
          .from(contentAudience)
          .where(
            and(
              eq(contentAudience.contentType, contentType),
              eq(contentAudience.targetType, "organization"),
              eq(contentAudience.targetId, viewer.organizationId)
            )
          )
      )
    );
  }

  conditions.push(
    inArray(
      contentIdColumns,
      db
        .select({ id: contentAudience.contentId })
        .from(contentAudience)
        .where(
          and(
            eq(contentAudience.contentType, contentType),
            eq(contentAudience.targetType, "user"),
            eq(contentAudience.targetId, viewer.id)
          )
        )
    )
  );

  let combined: SQL | undefined;

  for (const condition of conditions) {
    const next = combined ? and(combined, condition) : condition;

    if (next) {
      combined = next;
    }
  }

  return combined;
};

/**
 * 可见范围的权限上限：权限越高，能发布的受众越大。
 *
 * - 成员：本科室 / 公开链接（不涉及跨科室或指定用户）
 * - 科室管理员：额外可以「全系统登录用户」与「指定本科室的用户」
 * - root：任意科室、任意用户
 */
export const assertShareScope = async (
  db: Database,
  viewer: Viewer,
  visibility: PostShareVisibility,
  targets: AudienceTargets
) => {
  if (visibility !== "selected" && visibility !== "logged_in") {
    return;
  }

  if (viewer.role === "root") {
    return;
  }

  if (viewer.role !== "dept_admin") {
    throw new ORPCError("FORBIDDEN", {
      message: "只有科室管理员及以上可以设置「全系统用户」或「指定对象」",
    });
  }

  if (visibility === "logged_in") {
    return;
  }

  if (targets.organizations.some((id) => id !== viewer.organizationId)) {
    throw new ORPCError("FORBIDDEN", {
      message: "科室管理员只能指定本科室作为可见范围",
    });
  }

  if (targets.users.length > 0) {
    const rows = await db
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          inArray(user.id, targets.users),
          eq(user.organizationId, viewer.organizationId ?? "")
        )
      );

    if (rows.length !== targets.users.length) {
      throw new ORPCError("FORBIDDEN", {
        message: "指定用户必须属于本科室",
      });
    }
  }
};
