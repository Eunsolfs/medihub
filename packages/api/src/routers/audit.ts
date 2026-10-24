import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { user } from "@medihub/db/schema/auth";
import { organization } from "@medihub/db/schema/organization";
import { auditLog } from "@medihub/db/schema/system";

import { adminProcedure } from "#src/procedures.ts";

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  detail?: Record<string, unknown> | null;
  entityId?: string | null;
  entityType: string;
  /** null 表示与具体科室无关的全局操作。 */
  organizationId?: string | null;
}

/** 敏感操作留痕：供管理端审计，也用于事后追责。 */
export const recordAudit = async (db: Database, entry: AuditEntry) => {
  await db.insert(auditLog).values({
    action: entry.action,
    actorId: entry.actorId ?? null,
    detail: entry.detail ?? null,
    entityId: entry.entityId ?? null,
    entityType: entry.entityType,
    organizationId: entry.organizationId ?? null,
  });
};

const auditSummary = {
  action: auditLog.action,
  actorId: auditLog.actorId,
  actorName: user.name,
  createdAt: auditLog.createdAt,
  detail: auditLog.detail,
  entityId: auditLog.entityId,
  entityType: auditLog.entityType,
  id: auditLog.id,
  organizationId: auditLog.organizationId,
  organizationName: organization.name,
};

export const auditRouter = {
  list: adminProcedure
    .input(
      z.object({
        action: z.string().trim().max(60).optional(),
        actorId: z.string().min(1).optional(),
        entityId: z.string().min(1).optional(),
        entityType: z.string().trim().max(60).optional(),
        /** 起始时间（含）。 */
        from: z.coerce.date().optional(),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
        /** 结束时间（含）。 */
        to: z.coerce.date().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;
      const filters: SQL[] = [];

      if (viewer?.role !== "root") {
        // 科室管理员只看到本科室的审计流，全局操作为 root 专用。
        if (!viewer?.organizationId) {
          return {
            items: [],
            page: input.page,
            pageSize: input.pageSize,
            total: 0,
          };
        }

        filters.push(eq(auditLog.organizationId, viewer.organizationId));
      } else if (context.scopeOrganizationId) {
        // 全局管理员切换科室后只看该科室的审计流。
        filters.push(eq(auditLog.organizationId, context.scopeOrganizationId));
      }

      if (input.action) {
        filters.push(eq(auditLog.action, input.action));
      }

      if (input.entityType) {
        filters.push(eq(auditLog.entityType, input.entityType));
      }

      if (input.entityId) {
        filters.push(eq(auditLog.entityId, input.entityId));
      }

      if (input.actorId) {
        filters.push(eq(auditLog.actorId, input.actorId));
      }

      if (input.from) {
        filters.push(gte(auditLog.createdAt, input.from));
      }

      if (input.to) {
        filters.push(lte(auditLog.createdAt, input.to));
      }

      const where = filters.length > 0 ? and(...filters) : undefined;

      const [items, totals] = await Promise.all([
        context.db
          .select(auditSummary)
          .from(auditLog)
          .leftJoin(user, eq(auditLog.actorId, user.id))
          .leftJoin(organization, eq(auditLog.organizationId, organization.id))
          .where(where)
          .orderBy(desc(auditLog.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(auditLog).where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),
};
