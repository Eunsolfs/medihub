import { statfs } from "node:fs/promises";

import { eq } from "drizzle-orm";

import { globalUsage, organizationUsage, readGlobalQuota } from "@medihub/api";
import type { StorageAccess } from "@medihub/api";
import type { Database } from "@medihub/db";
import { organization } from "@medihub/db/schema/organization";
import type { StorageTarget } from "@medihub/db/schema/system";
import type { LocalStorageConfig } from "@medihub/storage";

/** 磁盘至少保留 512MB，避免写满后 SQLite/系统本身不可用。 */
const DISK_RESERVE_BYTES = 512 * 1024 * 1024;

export type QuotaCheck =
  | { ok: true }
  | { message: string; ok: false; status: 413 | 500 | 507 };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const gb = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;

/**
 * 上传前的容量检查：科室配额 → 全站配额 → 目标磁盘剩余空间。
 * 只统计未归档、未删除的素材；S3 目标不做磁盘检查。
 */
export const checkUploadQuota = async (input: {
  byteSize: number;
  db: Database;
  organizationId: string;
  storage: StorageAccess;
  target: StorageTarget;
}): Promise<QuotaCheck> => {
  const { byteSize, db, organizationId, storage, target } = input;

  const [department] = await db
    .select({ name: organization.name, quotaBytes: organization.quotaBytes })
    .from(organization)
    .where(eq(organization.id, organizationId));

  if (department?.quotaBytes !== null && department?.quotaBytes !== undefined) {
    const used = await organizationUsage(db, organizationId);

    if (used + byteSize > department.quotaBytes) {
      return {
        message: `科室存储空间不足：已用 ${gb(used)} / 上限 ${gb(department.quotaBytes)}。请联系管理员清理旧素材，或在系统管理里调整存储上限`,
        ok: false,
        status: 413,
      };
    }
  }

  const globalQuota = await readGlobalQuota(db);

  if (globalQuota) {
    const used = await globalUsage(db);

    if (used + byteSize > globalQuota) {
      return {
        message: `全站存储空间不足：已用 ${gb(used)} / 上限 ${gb(globalQuota)}。请联系管理员扩容或归档旧数据`,
        ok: false,
        status: 413,
      };
    }
  }

  if (target.driver === "s3") {
    return { ok: true };
  }

  try {
    const config = storage.decrypt<LocalStorageConfig>(target.config);
    const stats = await statfs(config.rootPath);
    const free = Number(stats.bavail) * Number(stats.bsize);

    if (free - byteSize < DISK_RESERVE_BYTES) {
      return {
        message: `存储磁盘剩余空间不足：剩余 ${gb(free)}，本次需要 ${mb(byteSize)}，并需预留 512MB。请归档旧数据或更换存储目标`,
        ok: false,
        status: 507,
      };
    }
  } catch {
    return {
      message: "无法读取存储磁盘剩余空间，请检查挂载路径是否可访问",
      ok: false,
      status: 500,
    };
  }

  return { ok: true };
};
