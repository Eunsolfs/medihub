import path from "node:path";

import type { StorageAccess } from "@medihub/api";
import { createAuth } from "@medihub/auth";
import { createDb } from "@medihub/db";
import {
  createStorageDriver,
  decryptConfig,
  encryptConfig,
} from "@medihub/storage";

import { env } from "#src/env.ts";

/**
 * `DATABASE_URL` / `STORAGE_ROOT` 是相对路径时，以 apps/server 为基准解析，
 * 而不是进程 cwd——systemd 的 cwd 是 apps/server，但命令行脚本可能从安装根目录运行。
 */
const serverDir = path.resolve(import.meta.dirname, "..");

const resolveFromServer = (value: string) =>
  path.isAbsolute(value) ? value : path.resolve(serverDir, value);

export const db = createDb(resolveFromServer(env.DATABASE_URL));

export const auth = createAuth({
  baseURL: env.BETTER_AUTH_URL,
  db,
  secret: env.BETTER_AUTH_SECRET,
});

/** 存储配置的加密密钥独立于会话密钥，轮换会话密钥不会让已有的存储配置失效。 */
const storageSecret = env.BETTER_AUTH_SECRET;

export const storageRoot = resolveFromServer(env.STORAGE_ROOT);

export const storage: StorageAccess = {
  decrypt: <T>(payload: string) => decryptConfig<T>(payload, storageSecret),
  driverFor: (target) => createStorageDriver(target, storageSecret),
  encrypt: (value) => encryptConfig(value, storageSecret),
};
