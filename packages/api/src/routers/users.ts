import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { hashPassword } from "@medihub/auth";
import {
  account,
  session,
  user,
  userRole,
  userStatus,
} from "@medihub/db/schema/auth";
import { asset } from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";

import type { Viewer } from "#src/access.ts";
import { assertOrganization } from "#src/access.ts";
import { adminProcedure } from "#src/procedures.ts";
import { recordAudit } from "#src/routers/audit.ts";

/** 非 root 的管理者只能在本组织内管理成员；rest 一律看不到。 */
const scopedOrganizationId = (viewer: Viewer) => {
  if (!viewer.organizationId) {
    throw new ORPCError("FORBIDDEN", {
      message: "当前账号没有归属科室，无法管理成员",
    });
  }

  return viewer.organizationId;
};

const userSummary = {
  createdAt: user.createdAt,
  email: user.email,
  id: user.id,
  name: user.name,
  organizationId: user.organizationId,
  organizationName: organization.name,
  role: user.role,
  status: user.status,
  title: user.title,
};

const roleValues = z.enum(userRole);

export const usersRouter = {
  list: adminProcedure
    .input(
      z.object({
        /** root 用：只看某个科室。 */
        organizationId: z.string().min(1).optional(),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
        q: z.string().trim().max(80).optional(),
        role: roleValues.optional(),
        status: z.enum(userStatus).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const filters: SQL[] = [];

      // 非 root 的筛选条件与本组织取交集：显式查别的科室只会得到空列表，
      // 而不是静默回退成本组织成员。
      if (viewer.role !== "root") {
        filters.push(eq(user.organizationId, scopedOrganizationId(viewer)));
      } else if (context.scopeOrganizationId) {
        // 全局管理员切换科室后，成员列表跟随当前科室。
        filters.push(eq(user.organizationId, context.scopeOrganizationId));
      }

      if (input.organizationId) {
        filters.push(eq(user.organizationId, input.organizationId));
      }

      if (input.q) {
        const keyword = `%${input.q}%`;
        const search = or(like(user.name, keyword), like(user.email, keyword));

        if (search) {
          filters.push(search);
        }
      }

      if (input.role) {
        filters.push(eq(user.role, input.role));
      }

      if (input.status) {
        filters.push(eq(user.status, input.status));
      }

      const where = and(...filters);

      const [items, totals] = await Promise.all([
        context.db
          .select(userSummary)
          .from(user)
          .leftJoin(organization, eq(user.organizationId, organization.id))
          .where(where)
          .orderBy(desc(user.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(user).where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        email: z
          .email()
          .max(160)
          .transform((value) => value.trim().toLowerCase()),
        name: z.string().trim().min(1).max(60),
        organizationId: z.string().min(1).nullish(),
        password: z.string().min(8).max(128),
        phone: z.string().trim().max(30).nullish(),
        role: roleValues.default("member"),
        title: z.string().trim().max(60).nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const organizationId =
        viewer.role === "root"
          ? (input.organizationId ?? null)
          : scopedOrganizationId(viewer);

      if (viewer.role !== "root") {
        if (input.role !== "member") {
          throw new ORPCError("FORBIDDEN", {
            message: "科室管理员只能创建普通成员账号",
          });
        }

        if (input.organizationId) {
          // 跨组织一律按不存在处理，不泄露其它科室是否存在。
          assertOrganization(viewer, input.organizationId);
        }
      } else if (organizationId) {
        const [targetOrganization] = await context.db
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, organizationId));

        if (!targetOrganization) {
          throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
        }
      }

      const [existing] = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, input.email));

      if (existing) {
        throw new ORPCError("BAD_REQUEST", { message: "该邮箱已被使用" });
      }

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(input.password);

      // 直接写 user + account：创建账号是管理员动作，不经过 Better Auth 的注册接口，
      // 密码哈希沿用 Better Auth 的凭证格式，创建后即可用 sign-in/email 登录。
      context.db.transaction((tx) => {
        tx.insert(user)
          .values({
            email: input.email,
            id,
            name: input.name,
            organizationId,
            phone: input.phone?.trim() || null,
            role: input.role,
            status: "active",
            title: input.title?.trim() || null,
          })
          .run();

        tx.insert(account)
          .values({
            accountId: id,
            id: crypto.randomUUID(),
            password: passwordHash,
            providerId: "credential",
            userId: id,
          })
          .run();
      });

      await recordAudit(context.db, {
        action: "user.create",
        actorId: viewer.id,
        detail: { email: input.email, role: input.role },
        entityId: id,
        entityType: "user",
        organizationId,
      });

      const [created] = await context.db
        .select(userSummary)
        .from(user)
        .leftJoin(organization, eq(user.organizationId, organization.id))
        .where(eq(user.id, id));

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建账号失败",
        });
      }

      return created;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(60).optional(),
        organizationId: z.string().min(1).nullish(),
        phone: z.string().trim().max(30).nullish(),
        role: roleValues.optional(),
        status: z.enum(userStatus).optional(),
        title: z.string().trim().max(60).nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [target] = await context.db
        .select({
          id: user.id,
          organizationId: user.organizationId,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, input.id));

      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "成员不存在" });
      }

      if (viewer.role !== "root") {
        assertOrganization(viewer, target.organizationId ?? "");

        if (target.role === "root") {
          throw new ORPCError("FORBIDDEN", {
            message: "无权修改超级管理员账号",
          });
        }

        if (input.role && input.role !== "member") {
          throw new ORPCError("FORBIDDEN", {
            message: "科室管理员只能把账号设为普通成员",
          });
        }

        if (
          input.organizationId &&
          input.organizationId !== scopedOrganizationId(viewer)
        ) {
          throw new ORPCError("FORBIDDEN", {
            message: "不能把成员移出本科室",
          });
        }
      } else if (typeof input.organizationId === "string") {
        const [targetOrganization] = await context.db
          .select({ id: organization.id })
          .from(organization)
          .where(eq(organization.id, input.organizationId));

        if (!targetOrganization) {
          throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
        }
      }

      const dropsRoot =
        target.role === "root" &&
        ((input.role !== undefined && input.role !== "root") ||
          input.status === "disabled");

      if (dropsRoot) {
        const [roots] = await context.db
          .select({ total: count() })
          .from(user)
          .where(eq(user.role, "root"));

        if ((roots?.total ?? 0) <= 1) {
          throw new ORPCError("BAD_REQUEST", {
            message: "系统至少需要保留一个超级管理员",
          });
        }
      }

      await context.db
        .update(user)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.organizationId === undefined
            ? {}
            : { organizationId: input.organizationId ?? null }),
          ...(input.phone === undefined
            ? {}
            : { phone: input.phone?.trim() || null }),
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.title === undefined
            ? {}
            : { title: input.title?.trim() || null }),
        })
        .where(eq(user.id, input.id));

      if (input.status === "disabled") {
        // 禁用立即生效：把已有会话踢掉，而不是等 cookie 过期。
        await context.db.delete(session).where(eq(session.userId, input.id));
      }

      await recordAudit(context.db, {
        action: "user.update",
        actorId: viewer.id,
        detail: {
          changed: Object.keys(input).filter((key) => key !== "id"),
        },
        entityId: input.id,
        entityType: "user",
        organizationId: target.organizationId,
      });

      const [updated] = await context.db
        .select(userSummary)
        .from(user)
        .leftJoin(organization, eq(user.organizationId, organization.id))
        .where(eq(user.id, input.id));

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "成员不存在" });
      }

      return updated;
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      if (input.id === viewer.id) {
        throw new ORPCError("BAD_REQUEST", { message: "不能删除自己的账号" });
      }

      const [target] = await context.db
        .select({
          organizationId: user.organizationId,
          role: user.role,
        })
        .from(user)
        .where(eq(user.id, input.id));

      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "成员不存在" });
      }

      if (viewer.role !== "root") {
        assertOrganization(viewer, target.organizationId ?? "");

        if (target.role !== "member") {
          throw new ORPCError("FORBIDDEN", {
            message: "科室管理员只能删除本科室的普通成员",
          });
        }
      }

      if (target.role === "root") {
        const [roots] = await context.db
          .select({ total: count() })
          .from(user)
          .where(eq(user.role, "root"));

        if ((roots?.total ?? 0) <= 1) {
          throw new ORPCError("BAD_REQUEST", {
            message: "系统至少需要保留一个超级管理员",
          });
        }
      }

      // schema 里 asset/post 的 ownerId 是级联删除：直接删账号会连带删掉
      // 这个人上传的临床照片与撰写过的文章。资料属于科室资产，不该随账号消失，
      // 所以有归属数据时只允许「禁用」。
      const [owned] = await context.db
        .select({ total: count() })
        .from(asset)
        .where(eq(asset.ownerId, input.id));

      if ((owned?.total ?? 0) > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `该成员名下还有 ${owned?.total ?? 0} 个素材，请先转移或改用「禁用」`,
        });
      }

      await context.db.delete(user).where(eq(user.id, input.id));

      await recordAudit(context.db, {
        action: "user.remove",
        actorId: viewer.id,
        entityId: input.id,
        entityType: "user",
        organizationId: target.organizationId,
      });

      return { id: input.id };
    }),
};
