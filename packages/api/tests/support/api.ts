import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll } from "vite-plus/test";

import { createAuth } from "@medihub/auth";
import { user } from "@medihub/db/schema/auth";
import { organization } from "@medihub/db/schema/organization";
import { createTestDatabase } from "@medihub/db/testing";
import {
  createStorageDriver,
  decryptConfig,
  encryptConfig,
} from "@medihub/storage";

import { appRouter } from "#src/index.ts";
import type { Context, StorageAccess } from "#src/index.ts";
import type { UpdaterAccess } from "#src/update.ts";

// Each test file has a database of its own, so files run in parallel and share no rows.
const { db, remove } = await createTestDatabase();

afterAll(remove);

const auth = createAuth({
  baseURL: "http://localhost",
  db,
  secret: "test-secret-that-is-at-least-32-characters",
});

const secret = "test-secret-that-is-at-least-32-characters";

/** 与 apps/server 注入的 storage 同构：真实本地磁盘 + 真实加解密。 */
export const testStorage: StorageAccess = {
  decrypt: <T>(payload: string) => decryptConfig<T>(payload, secret),
  driverFor: (target) => createStorageDriver(target, secret),
  encrypt: (value) => encryptConfig(value, secret),
};

/** 直接读写测试库，用于准备路由无法创建的行（例如素材）。 */
export const testDb = db;

/** Calls the procedures in this process, through their middleware and validation, as the session's user. */
export interface ClientOptions {
  updater?: UpdaterAccess;
  version?: string;
}

export const createClient = (
  session: Context["session"] = null,
  storage: StorageAccess = testStorage,
  options: ClientOptions = {}
) =>
  createRouterClient(appRouter, {
    context: {
      db,
      session,
      storage,
      updater: options.updater,
      version: options.version,
    },
  });

/** Same as `signUp`, but also hands back the email so the account can be re-signed-in. */
export const signUpAccount = async (password = "correct-horse-battery") => {
  const email = `${crypto.randomUUID()}@example.com`;

  const { headers } = await auth.api.signUpEmail({
    body: { email, name: "Test User", password },
    returnHeaders: true,
  });

  const cookie = headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  return {
    client: createClient(
      await auth.api.getSession({ headers: new Headers({ cookie }) })
    ),
    email,
    password,
  };
};

/**
 * Re-signs an existing account in. A client snapshots the session user, so a test
 * that changes a user's role or organization in the database must build a new one.
 */
export const clientForEmail = async (
  email: string,
  password = "correct-horse-battery"
) => {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });

  const cookie = headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  return createClient(
    await auth.api.getSession({ headers: new Headers({ cookie }) })
  );
};

/** Signs a new user up through Better Auth and returns a client that calls as them. */
export const signUp = async () => {
  const account = await signUpAccount();

  return account.client;
};

/**
 * 注册一个「有科室」的账号：把个人空间升级成科室（kind=department）并设置角色。
 * 无科室账号（individual）不能发布内容，所以需要写内容的测试都要用这个。
 */
export const signUpDepartment = async (
  role: "member" | "dept_admin" = "member"
) => {
  const account = await signUpAccount();
  const profile = await account.client.me.profile();
  const organizationId = profile?.viewer.organizationId;

  if (!organizationId) {
    throw new Error("缺少组织");
  }

  await db
    .update(organization)
    .set({ kind: "department" })
    .where(eq(organization.id, organizationId));

  await db.update(user).set({ role }).where(eq(user.id, profile.viewer.id));

  return {
    client: await clientForEmail(account.email),
    email: account.email,
    organizationId,
  };
};
