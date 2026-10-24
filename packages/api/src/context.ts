import type { Session } from "@medihub/auth";
import type { Database } from "@medihub/db";
import type { StorageDriver, StorageTargetLike } from "@medihub/storage";

import type { Viewer } from "#src/access.ts";

/** 服务端注入的存储访问器：密钥留在 apps/server，api 包只拿驱动实例。 */
export interface StorageAccess {
  driverFor: (target: StorageTargetLike) => StorageDriver;
  /** 用服务端密钥加密存储目标配置（含 S3 密钥）。 */
  encrypt: (value: unknown) => string;
  /** 解密配置，用于掩码展示与「部分字段更新时保留旧密钥」。 */
  decrypt: <T>(payload: string) => T;
}

export interface Context {
  db: Database;
  session: Session | null;
  storage?: StorageAccess;
  /** 由 `protectedProcedure` 注入：已归一化的当前用户。 */
  viewer?: Viewer;
  /** 由 `organizationProcedure` 注入：当前用户的工作空间。 */
  organizationId?: string;
}
