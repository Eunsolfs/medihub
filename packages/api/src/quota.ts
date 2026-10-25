import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import { appSetting } from "@medihub/db/schema/system";

/** 全站存储上限（字节）在 app_setting 里的键名。 */
export const GLOBAL_QUOTA_KEY = "storage.globalQuotaBytes";

/** 只统计仍然占用服务器空间的素材：软删除与已归档的不计。 */
const liveAssetWhere = and(isNull(asset.deletedAt), isNull(asset.archivedAt));

export const readGlobalQuota = async (db: Database): Promise<number | null> => {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, GLOBAL_QUOTA_KEY));

  if (!row) {
    return null;
  }

  const parsed = Number(row.value);

  // 0 是合法上限（禁止继续占用），null 才表示不限制。
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const writeGlobalQuota = async (
  db: Database,
  quotaBytes: number | null
) => {
  if (quotaBytes === null) {
    await db.delete(appSetting).where(eq(appSetting.key, GLOBAL_QUOTA_KEY));

    return;
  }

  const value = String(Math.max(0, Math.trunc(quotaBytes)));

  await db
    .insert(appSetting)
    .values({ key: GLOBAL_QUOTA_KEY, value })
    .onConflictDoUpdate({
      set: { value },
      target: appSetting.key,
    });
};

export const organizationUsage = async (
  db: Database,
  organizationId: string
) => {
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${asset.byteSize}), 0)` })
    .from(asset)
    .where(and(liveAssetWhere, eq(asset.organizationId, organizationId)));

  return Number(row?.used ?? 0);
};

export const globalUsage = async (db: Database) => {
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${asset.byteSize}), 0)` })
    .from(asset)
    .where(liveAssetWhere);

  return Number(row?.used ?? 0);
};
