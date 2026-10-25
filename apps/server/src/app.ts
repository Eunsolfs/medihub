import { Hono } from "hono";
import type { Context } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "#src/context.ts";
import { openApi, rpc } from "#src/orpc.ts";
import { archiveRoute } from "#src/routes/archive.ts";
import { exportsRoute } from "#src/routes/exports.ts";
import { filesRoute } from "#src/routes/files.ts";
import { installRoute } from "#src/routes/install.ts";
import { officeRoute } from "#src/routes/office.ts";

const authHandler = async (c: Context) => await auth.handler(c.req.raw);

export const app = new Hono()
  .use(logger())
  .use(secureHeaders())
  .on(["GET", "POST"], "/api/auth/*", authHandler)
  .route("/api/files", filesRoute)
  .route("/api/office", officeRoute)
  .route("/api/exports", exportsRoute)
  .route("/api/install", installRoute)
  .route("/api/archive", archiveRoute)
  .all("/rpc/*", rpc)
  .all("/api/*", openApi);
