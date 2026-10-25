import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Context as HonoContext } from "hono";

import { appRouter } from "@medihub/api";
import type { Context } from "@medihub/api";

import { auth, db, storage } from "#src/context.ts";
import { env } from "#src/env.ts";
import { updater, updaterEnabled } from "#src/updater.ts";
import { appVersion } from "#src/version.ts";

const logServerError = (cause: unknown) => {
  if (!(cause instanceof ORPCError) || cause.status >= 500) {
    console.error(cause);
  }
};

const mount =
  (
    handler: RPCHandler<Context> | OpenAPIHandler<Context>,
    prefix: `/${string}`
  ) =>
  async (c: HonoContext) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    // root 通过顶部「科室」切换器指定作用域；普通账号的这个头会被忽略。
    const scopeOrganizationId =
      c.req.header("x-org-scope")?.trim() || undefined;

    const { matched, response } = await handler.handle(c.req.raw, {
      context: {
        db,
        dbPath: env.DATABASE_URL,
        session,
        scopeOrganizationId,
        storage,
        version: appVersion,
        ...(updaterEnabled() ? { updater } : {}),
      },
      prefix,
    });

    return matched
      ? c.newResponse(response.body, response)
      : await c.notFound();
  };

export const rpc = mount(
  new RPCHandler(appRouter, { interceptors: [onError(logServerError)] }),
  "/rpc"
);

export const openApi = mount(
  new OpenAPIHandler(appRouter, {
    interceptors: [onError(logServerError)],
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: {
            title: "medihub",
            version: "0.0.0",
          },
        },
      }),
    ],
  }),
  "/api"
);
