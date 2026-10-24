import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, like, ne, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { user } from "@medihub/db/schema/auth";
import { organization } from "@medihub/db/schema/organization";
import { patient } from "@medihub/db/schema/patients";

import { rootProcedure } from "#src/procedures.ts";
import { recordAudit } from "#src/routers/audit.ts";

const organizationKind = z.enum(["department", "personal"] as const);

const codePattern = /^[a-z0-9][a-z0-9-]*$/;

const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(codePattern, "短码只能包含小写字母、数字和连字符");

/** 列表与详情共用的字段：成员数 / 患者数是管理端判断能否删除的依据。 */
const organizationSummary = (db: Database) => ({
  code: organization.code,
  createdAt: organization.createdAt,
  description: organization.description,
  id: organization.id,
  kind: organization.kind,
  memberCount: db.$count(user, eq(user.organizationId, organization.id)),
  name: organization.name,
  patientCount: db.$count(patient, eq(patient.organizationId, organization.id)),
  updatedAt: organization.updatedAt,
});

export const orgsRouter = {
  list: rootProcedure
    .input(
      z.object({
        kind: organizationKind.optional(),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
        q: z.string().trim().max(80).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const filters: SQL[] = [];

      if (input.kind) {
        filters.push(eq(organization.kind, input.kind));
      }

      if (input.q) {
        const keyword = `%${input.q}%`;

        const search = or(
          like(organization.name, keyword),
          like(organization.code, keyword)
        );

        if (search) {
          filters.push(search);
        }
      }

      const where = filters.length > 0 ? and(...filters) : undefined;

      const [items, totals] = await Promise.all([
        context.db
          .select(organizationSummary(context.db))
          .from(organization)
          .where(where)
          .orderBy(asc(organization.name))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(organization).where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),

  get: rootProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select(organizationSummary(context.db))
        .from(organization)
        .where(eq(organization.id, input.id));

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
      }

      return row;
    }),

  create: rootProcedure
    .input(
      z.object({
        code: codeSchema,
        description: z.string().trim().max(400).nullish(),
        kind: organizationKind.default("department"),
        name: z.string().trim().min(1).max(80),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.code, input.code));

      if (existing) {
        throw new ORPCError("BAD_REQUEST", { message: "该科室短码已被使用" });
      }

      const [created] = await context.db
        .insert(organization)
        .values({
          code: input.code,
          description: input.description?.trim() || null,
          kind: input.kind,
          name: input.name,
        })
        .returning({ id: organization.id });

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建科室失败",
        });
      }

      await recordAudit(context.db, {
        action: "org.create",
        actorId: viewer.id,
        detail: { code: input.code, kind: input.kind },
        entityId: created.id,
        entityType: "organization",
      });

      const [row] = await context.db
        .select(organizationSummary(context.db))
        .from(organization)
        .where(eq(organization.id, created.id));

      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建科室失败",
        });
      }

      return row;
    }),

  update: rootProcedure
    .input(
      z.object({
        code: codeSchema.optional(),
        description: z.string().trim().max(400).nullish(),
        id: z.string().min(1),
        kind: organizationKind.optional(),
        name: z.string().trim().min(1).max(80).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, input.id));

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
      }

      if (input.code) {
        const [duplicate] = await context.db
          .select({ id: organization.id })
          .from(organization)
          .where(
            and(
              eq(organization.code, input.code),
              ne(organization.id, input.id)
            )
          );

        if (duplicate) {
          throw new ORPCError("BAD_REQUEST", { message: "该科室短码已被使用" });
        }
      }

      await context.db
        .update(organization)
        .set({
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.description === undefined
            ? {}
            : { description: input.description?.trim() || null }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          ...(input.name === undefined ? {} : { name: input.name }),
        })
        .where(eq(organization.id, input.id));

      await recordAudit(context.db, {
        action: "org.update",
        actorId: viewer.id,
        entityId: input.id,
        entityType: "organization",
        organizationId: input.id,
      });

      const [row] = await context.db
        .select(organizationSummary(context.db))
        .from(organization)
        .where(eq(organization.id, input.id));

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
      }

      return row;
    }),

  remove: rootProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [target] = await context.db
        .select(organizationSummary(context.db))
        .from(organization)
        .where(eq(organization.id, input.id));

      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
      }

      if (target.memberCount > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `该科室还有 ${target.memberCount} 个成员，请先移除成员`,
        });
      }

      if (target.patientCount > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `该科室还有 ${target.patientCount} 个患者，请先清理患者档案`,
        });
      }

      await context.db
        .delete(organization)
        .where(eq(organization.id, input.id));

      await recordAudit(context.db, {
        action: "org.remove",
        actorId: viewer.id,
        detail: { code: target.code, name: target.name },
        entityId: input.id,
        entityType: "organization",
      });

      return { id: input.id };
    }),
};
