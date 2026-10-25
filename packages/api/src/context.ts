import type { Session } from "@medihub/auth";
import type { Database } from "@medihub/db";
import type { StorageDriver, StorageTargetLike } from "@medihub/storage";

import type { Viewer } from "#src/access.ts";
import type { UpdaterAccess } from "#src/update.ts";

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
  /** SQLite 文件路径（恢复镜像时用于定位、备份与重启替换）。 */
  dbPath?: string;
  session: Session | null;
  storage?: StorageAccess;
  /** 在线升级执行器；未配置时 updater 为 undefined。 */
  updater?: UpdaterAccess;
  /** 由 `protectedProcedure` 注入：已归一化的当前用户。 */
  viewer?: Viewer;
  /**
   * 由 `organizationProcedure` 注入：本次请求生效的科室。
   * root 可以借助顶部「科室」切换器指定任意科室（请求头 x-org-scope）。
   */
  organizationId?: string;
  /** 请求头里 root 指定的科室 id，只有 root 会用它。 */
  scopeOrganizationId?: string;
  /** 应用版本号（由服务端从 package.json 读取），用于 /health 与运维核对。 */
  version?: string;
}
