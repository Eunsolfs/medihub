import { Hono } from "hono";

import { db } from "#src/context.ts";
import { env } from "#src/env.ts";
import { detectInstalled, runInstall } from "#src/install.ts";
import { appVersion } from "#src/version.ts";

interface Attempt {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const tooManyAttempts = (ip: string) => {
  const now = Date.now();
  const current = attempts.get(ip);

  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });

    return false;
  }

  current.count += 1;

  return current.count > MAX_ATTEMPTS;
};

const clientIp = (header: string | null) =>
  header?.split(",")[0]?.trim() ?? "unknown";

interface InstallBody {
  adminEmail?: unknown;
  adminName?: unknown;
  adminPassword?: unknown;
  onlyOfficeJwtSecret?: unknown;
  onlyOfficeUrl?: unknown;
}

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * 首次安装引导：仅在系统还没有任何账号时可用。
 * 安装完成后接口一律返回 409，避免被用来重置管理员。
 */
export const installRoute = new Hono()
  .get("/status", async (c) => {
    const installed = await detectInstalled(db).catch(() => false);

    return c.json({
      installed,
      onlyOfficeConfigured: Boolean(
        env.ONLYOFFICE_URL && env.ONLYOFFICE_JWT_SECRET
      ),
      siteUrl: env.BETTER_AUTH_URL,
      version: appVersion,
    });
  })
  .post("/run", async (c) => {
    if (await detectInstalled(db).catch(() => false)) {
      return c.json({ error: "系统已经完成安装，如需继续请直接登录" }, 409);
    }

    if (tooManyAttempts(clientIp(c.req.header("x-forwarded-for") ?? null))) {
      return c.json({ error: "尝试次数过多，请 10 分钟后再试" }, 429);
    }

    let body: InstallBody;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "请求格式不正确" }, 400);
    }

    const adminName = asString(body.adminName);
    const adminEmail = asString(body.adminEmail).toLowerCase();
    const adminPassword = asString(body.adminPassword);
    const onlyOfficeUrl = asString(body.onlyOfficeUrl);
    const onlyOfficeJwtSecret = asString(body.onlyOfficeJwtSecret);

    if (adminName.length < 1 || adminName.length > 60) {
      return c.json({ error: "请填写管理员姓名（1–60 个字符）" }, 400);
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(adminEmail)) {
      return c.json({ error: "管理员邮箱格式不正确" }, 400);
    }

    if (adminPassword.length < 8 || adminPassword.length > 128) {
      return c.json({ error: "密码至少 8 位" }, 400);
    }

    if (onlyOfficeUrl && !/^https?:\/\//u.test(onlyOfficeUrl)) {
      return c.json({ error: "OnlyOffice 地址必须以 http(s):// 开头" }, 400);
    }

    try {
      const result = await runInstall(db, {
        adminEmail,
        adminName,
        adminPassword,
        onlyOfficeJwtSecret: onlyOfficeJwtSecret || undefined,
        onlyOfficeUrl: onlyOfficeUrl || undefined,
      });

      return c.json({ ok: true, restartRequired: result.restartRequired });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "安装失败，请查看服务端日志";

      return c.json({ error: message }, 400);
    }
  });
