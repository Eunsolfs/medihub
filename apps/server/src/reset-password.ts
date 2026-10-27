import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { hashPassword } from "@medihub/auth";
import { account, user } from "@medihub/db/schema/auth";

import { db } from "#src/context.ts";

const listUsers = async () => {
  const rows = await db
    .select({
      email: user.email,
      id: user.id,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .orderBy(user.createdAt);

  if (rows.length === 0) {
    console.log("数据库里还没有任何账号。");

    return;
  }

  console.log("账号列表：");

  for (const row of rows) {
    console.log(`- ${row.email}（${row.role}，${row.name}）`);
  }
};

const resetPassword = async (email: string, password?: string) => {
  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));

  if (!target) {
    console.error(`用户不存在：${email}`);
    await listUsers();
    process.exitCode = 1;

    return;
  }

  const nextPassword = password || randomBytes(9).toString("base64url");
  const hash = await hashPassword(nextPassword);

  const [existing] = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.userId, target.id));

  await (existing
    ? db
        .update(account)
        .set({ password: hash, providerId: "credential" })
        .where(eq(account.userId, target.id))
    : db.insert(account).values({
        accountId: target.id,
        id: crypto.randomUUID(),
        password: hash,
        providerId: "credential",
        userId: target.id,
      }));

  console.log(`已重置密码：${email}`);
  console.log(`新密码：${nextPassword}`);
};

const [email, password] = process.argv.slice(2);

try {
  await (email && email !== "--list"
    ? resetPassword(email, password)
    : listUsers());
} finally {
  db.$client.close();
}
