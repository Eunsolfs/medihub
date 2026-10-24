import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";

import { hashPassword } from "@medihub/auth";
import type { Database } from "@medihub/db";
import { migrateDatabase } from "@medihub/db/migrate";
import { account, user } from "@medihub/db/schema/auth";

export interface InstallInput {
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  onlyOfficeJwtSecret?: string;
  onlyOfficeUrl?: string;
}

export interface InstallResult {
  /** 是否写入了 OnlyOffice 配置（需要重启服务才生效）。 */
  restartRequired: boolean;
  userId: string;
}

const userTableExists = async (db: Database) => {
  // node:sqlite 驱动是同步的：这一层查询直接返回结果。
  const rows = db.all<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name = 'user'`
  );

  return rows.length > 0;
};

/** 是否已经完成安装：有 user 表且至少一个账号。 */
export const detectInstalled = async (db: Database) => {
  if (!(await userTableExists(db))) {
    return false;
  }

  const [row] = await db.select({ id: user.id }).from(user).limit(1);

  return row !== undefined;
};

/** 读取 .env 当前内容（不存在时返回空串）。 */
const readEnvFile = () => {
  try {
    return readFileSync(path.resolve(".env"), "utf-8");
  } catch {
    return "";
  }
};

const setEnvLine = (content: string, key: string, value: string) => {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "mu");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const suffix = content.length === 0 || content.endsWith("\n") ? "" : "\n";

  return `${content}${suffix}${line}\n`;
};

/**
 * 写入 OnlyOffice 参数。进程内的 env 在启动时已经解析，因此返回 true 表示
 * 需要重启服务；未提供参数时返回 false。
 */
export const applyOnlyOfficeConfig = (input: InstallInput) => {
  const url = input.onlyOfficeUrl?.trim();
  const secret = input.onlyOfficeJwtSecret?.trim();

  if (!url || !secret) {
    return false;
  }

  let content = readEnvFile();
  content = setEnvLine(content, "ONLYOFFICE_URL", url);
  content = setEnvLine(content, "ONLYOFFICE_JWT_SECRET", secret);
  writeFileSync(path.resolve(".env"), content, "utf-8");

  return true;
};

/**
 * 首次安装：迁移数据库 → 创建超级管理员（无科室，与 seed 的 root 一致）。
 * 已存在账号时抛错，避免二次覆盖。
 */
export const runInstall = async (
  db: Database,
  input: InstallInput
): Promise<InstallResult> => {
  if (await detectInstalled(db)) {
    throw new Error("系统已经完成安装");
  }

  migrateDatabase(db);

  const email = input.adminEmail.trim().toLowerCase();

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing) {
    throw new Error("该邮箱已经注册");
  }

  const userId = crypto.randomUUID();

  await db.insert(user).values({
    email,
    emailVerified: true,
    id: userId,
    name: input.adminName.trim(),
    organizationId: null,
    role: "root",
  });

  await db.insert(account).values({
    accountId: userId,
    id: crypto.randomUUID(),
    password: await hashPassword(input.adminPassword),
    providerId: "credential",
    userId,
  });

  const restartRequired = applyOnlyOfficeConfig(input);

  return { restartRequired, userId };
};
