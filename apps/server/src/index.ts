import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { env } from "#src/env.ts";
import { applyPendingRestore } from "#src/restore.ts";

// 恢复镜像必须在打开 SQLite 之前完成，所以 app / db 用动态 import。
await applyPendingRestore();

const { app } = await import("#src/app.ts");
const { db } = await import("#src/context.ts");
const { startArchiveScheduler } = await import("#src/scheduler.ts");

const publicDir = fileURLToPath(new URL("public", import.meta.url));

if (existsSync(publicDir)) {
  app
    .use(serveStatic({ root: publicDir }))
    .get("*", serveStatic({ root: publicDir, path: "index.html" }));
}

const stopScheduler = startArchiveScheduler();

const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`Server listening on http://localhost:${port}`);
});

await Promise.race([once(process, "SIGINT"), once(process, "SIGTERM")]);

stopScheduler();

server.close();

await once(server, "close");

db.$client.close();
