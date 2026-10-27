import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "#src/context.ts";
import { openApi, rpc } from "#src/orpc.ts";
import { archiveRoute } from "#src/routes/archive.ts";
import { captchaRoute } from "#src/routes/captcha.ts";
import { exportsRoute } from "#src/routes/exports.ts";
import { filesRoute } from "#src/routes/files.ts";
import { installRoute } from "#src/routes/install.ts";
import { officeRoute } from "#src/routes/office.ts";

const authHandler = async (c: Context) => await auth.handler(c.req.raw);

/**
 * 覆盖原图走 `/api/files/upload?replaceAssetId=...`：部分反向代理/WAF 会拦截
 * `/replace` 路径，但上传路径是放行的。这里在服务端内部转给同一个处理逻辑。
 */
const replaceViaUpload = async (c: Context, next: () => Promise<void>) => {
  const assetId = c.req.query("replaceAssetId");

  if (!assetId) {
    await next();

    return;
  }

  const url = new URL(c.req.url);
  // filesRoute 自身没有 /api/files 前缀，挂载点由外层 app 提供。
  url.pathname = `/${encodeURIComponent(assetId)}/replace`;
  url.search = "";

  return await filesRoute.fetch(new Request(url, c.req.raw));
};

export const app = new Hono()
  .use(logger())
  .use(secureHeaders())
  .on(["GET", "POST"], "/api/auth/*", authHandler)
  .use("/api/files/upload", replaceViaUpload)
  .route("/api/files", filesRoute)
  .route("/api/office", officeRoute)
  .route("/api/exports", exportsRoute)
  .route("/api/install", installRoute)
  .route("/api/captcha", captchaRoute)
  .route("/api/archive", archiveRoute)
  .all("/rpc/*", rpc)
  .all("/api/*", openApi);
