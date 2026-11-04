import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { hashPassword } from "@medihub/auth";
import { account, user } from "@medihub/db/schema/auth";

import { db } from "#src/context.ts";

const USAGE = `用法：
  node --env-file=.env src/reset-password.ts --list
  node --env-file=.env src/reset-password.ts <邮箱>
  node --env-file=.env src/reset-password.ts <邮箱> <新密码>

不传新密码时会生成随机密码并打印一次。`;

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
  if (password && password.length < 8) {
    console.error("新密码至少需要 8 位。");
    process.exitCode = 1;

    return;
  }

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
  if (!email || email === "--list" || email === "-l") {
    await listUsers();
  } else if (email === "--help" || email === "-h") {
    console.log(USAGE);
  } else {
    await resetPassword(email.trim().toLowerCase(), password);
  }
} catch (error) {
  console.error(
    "操作失败。若是新库，请先在 apps/server 目录执行 pnpm run db:migrate。"
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  db.$client.close();
}
