import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";

import type { Database } from "@medihub/db";
import * as schema from "@medihub/db/schema/auth";
import { organization } from "@medihub/db/schema/organization";

/**
 * 管理员直接创建账号时用同一套哈希写 `account.password`，
 * 避免在 API 层复刻 Better Auth 的密码格式。
 */
export { hashPassword, verifyPassword } from "better-auth/crypto";

interface AuthOptions {
  db: Database;
  baseURL: string;
  secret: string;
}

/**
 * 没有科室归属的自然人也会得到一个 `personal` 组织作为私人工作空间，
 * 这样权限模型只有「组织内」一种边界，临床数据与个人资料共用同一套表。
 */
const createPersonalWorkspace = async (
  db: Database,
  userId: string,
  name: string
) => {
  const organizationId = crypto.randomUUID();

  await db.insert(organization).values({
    code: `personal-${organizationId.slice(0, 8)}`,
    description: "注册时自动创建的个人工作空间",
    id: organizationId,
    kind: "personal",
    name: `${name} 的个人空间`,
  });

  await db
    .update(schema.user)
    .set({ organizationId })
    .where(eq(schema.user.id, userId));

  return organizationId;
};

export const createAuth = ({ db, baseURL, secret }: AuthOptions) =>
  betterAuth({
    baseURL,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await createPersonalWorkspace(db, created.id, created.name);
          },
        },
      },
    },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // 默认 3 次/10 秒（按 IP）对医院内网共享出口太紧，任意一人连续输错
    // 密码就会把同一 IP 的其他人一起锁住；放宽到 10 次/分钟。
    rateLimit: {
      customRules: {
        "/change-password": { max: 10, window: 60 },
        "/sign-in/email": { max: 10, window: 60 },
        "/sign-up/email": { max: 10, window: 60 },
      },
      max: 120,
      window: 60,
    },
    secret,
    // 1Panel/Nginx 会覆盖 X-Forwarded-For；Better Auth 需要显式信任这个头，
    // 否则所有用户会被当成同一个 IP 共享限流桶。
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    // 开发时同一台机器可能通过 localhost / 127.0.0.1 / 局域网 IP 访问，
    // 这些都应当被当作同一个站点，否则 Better Auth 会拒绝请求。
    trustedOrigins: [
      baseURL,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean) ?? []),
    ].filter((origin, index, list) => list.indexOf(origin) === index),
    user: {
      additionalFields: {
        organizationId: { input: false, required: false, type: "string" },
        phone: { required: false, type: "string" },
        role: {
          defaultValue: "individual",
          input: false,
          required: false,
          type: "string",
        },
        status: {
          defaultValue: "active",
          input: false,
          required: false,
          type: "string",
        },
        title: { required: false, type: "string" },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;

export type Session = Auth["$Infer"]["Session"];

export type SessionUser = Session["user"];

export type { Database };
