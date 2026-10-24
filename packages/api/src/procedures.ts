import { ORPCError, os } from "@orpc/server";

import { requireAdmin, requireRoot, toViewer } from "#src/access.ts";
import type { Context } from "#src/context.ts";

export const publicProcedure = os.$context<Context>();

export const protectedProcedure = publicProcedure.use(
  async ({ context, next }) => {
    if (!context.session) {
      throw new ORPCError("UNAUTHORIZED");
    }

    const viewer = toViewer(context.session.user);

    if (viewer.status === "disabled") {
      throw new ORPCError("FORBIDDEN", {
        message: "账号已被禁用，请联系管理员",
      });
    }

    return await next({
      context: { ...context, session: context.session, viewer },
    });
  }
);

/** 所有科室数据都挂在一个组织下，这个中间件保证组织已就绪。 */
export const organizationProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    const organizationId = context.viewer?.organizationId;

    if (!organizationId) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "当前账号没有归属科室，请联系管理员分配",
      });
    }

    return await next({ context: { ...context, organizationId } });
  }
);

const requireViewer = (context: Context) => {
  if (!context.viewer) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return context.viewer;
};

export const adminProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    requireAdmin(requireViewer(context));

    return await next();
  }
);

export const rootProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    requireRoot(requireViewer(context));

    return await next();
  }
);
