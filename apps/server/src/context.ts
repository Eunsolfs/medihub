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

export const db = createDb(env.DATABASE_URL);

export const auth = createAuth({
  baseURL: env.BETTER_AUTH_URL,
  db,
  secret: env.BETTER_AUTH_SECRET,
});

/** 存储配置的加密密钥独立于会话密钥，轮换会话密钥不会让已有的存储配置失效。 */
const storageSecret = env.BETTER_AUTH_SECRET;

export const storageRoot = path.resolve(env.STORAGE_ROOT);

export const storage: StorageAccess = {
  decrypt: <T>(payload: string) => decryptConfig<T>(payload, storageSecret),
  driverFor: (target) => createStorageDriver(target, storageSecret),
  encrypt: (value) => encryptConfig(value, storageSecret),
};
