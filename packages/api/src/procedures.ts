import { ORPCError, os } from "@orpc/server";
import { asc, eq } from "drizzle-orm";

import { organization } from "@medihub/db/schema/organization";

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

/** 系统里第一个科室，供没有归属科室的 root 兜底使用。 */
const firstDepartment = async (context: Context) => {
  const [row] = await context.db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.kind, "department"))
    .orderBy(asc(organization.createdAt))
    .limit(1);

  return row?.id ?? null;
};

/**
 * 解析本次请求的科室作用域。
 *
 * - 普通账号：只能是自己的科室；没有科室直接拒绝。
 * - root：可以使用顶部切换器传来的 `x-org-scope`，也可以是自己的科室，
 *   都没有时回落到系统里的第一个科室——这样 root 不做任何设置也能立即使用。
 */
export const organizationProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    const { viewer } = context;

    if (!viewer) {
      throw new ORPCError("UNAUTHORIZED");
    }

    let organizationId: string | null;

    if (viewer.role === "root") {
      const requested = context.scopeOrganizationId ?? viewer.organizationId;

      if (requested) {
        const [target] = await context.db
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, requested));

        if (!target) {
          throw new ORPCError("BAD_REQUEST", {
            message: "所选科室不存在，请刷新后重试",
          });
        }

        organizationId = target.id;
      } else {
        organizationId = await firstDepartment(context);
      }
    } else {
      ({ organizationId } = viewer);
    }

    if (!organizationId) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          viewer.role === "root"
            ? "系统中还没有科室，请先在「系统管理 → 科室」创建"
            : "当前账号没有归属科室，请联系管理员分配",
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
