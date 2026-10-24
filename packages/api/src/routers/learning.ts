import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { asset } from "@medihub/db/schema/content";
import {
  learningSession,
  learningSessionKind,
} from "@medihub/db/schema/learning";

import {
  canEditOwned,
  canSeeAllContent,
  organizationIdOf,
} from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";

const sessionInput = z.object({
  description: z.string().max(8000).nullish(),
  heldAt: z.coerce.date(),
  kind: z.enum(learningSessionKind).default("lecture"),
  location: z.string().trim().max(120).nullish(),
  speaker: z.string().trim().max(60).nullish(),
  tags: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  title: z.string().trim().min(1).max(200),
});

export const learningRouter = {
  list: organizationProcedure
    .input(
      z.object({
        kind: z.enum(learningSessionKind).optional(),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
        q: z.string().trim().max(80).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const filters: SQL[] = [
        eq(learningSession.organizationId, organizationId),
      ];

      // 「谁创建的会议归谁」：普通成员只看自己的，管理员看全科室。
      if (!canSeeAllContent(viewer)) {
        filters.push(eq(learningSession.createdBy, viewer.id));
      }

      if (input.kind) {
        filters.push(eq(learningSession.kind, input.kind));
      }

      if (input.q) {
        const keyword = `%${input.q}%`;

        const search = or(
          like(learningSession.title, keyword),
          like(learningSession.description, keyword),
          like(learningSession.speaker, keyword)
        );

        if (search) {
          filters.push(search);
        }
      }

      const where = and(...filters);

      const [items, totals] = await Promise.all([
        context.db
          .select({
            assetCount: context.db.$count(
              asset,
              eq(asset.sessionId, learningSession.id)
            ),
            heldAt: learningSession.heldAt,
            id: learningSession.id,
            kind: learningSession.kind,
            location: learningSession.location,
            speaker: learningSession.speaker,
            tags: learningSession.tags,
            title: learningSession.title,
          })
          .from(learningSession)
          .where(where)
          .orderBy(desc(learningSession.heldAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db
          .select({ total: count() })
          .from(learningSession)
          .where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),

  get: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      const [row] = await context.db
        .select()
        .from(learningSession)
        .where(
          and(
            eq(learningSession.id, input.id),
            eq(learningSession.organizationId, organizationId)
          )
        );

      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      if (!row || !canEditOwned(viewer, row.createdBy)) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      return row;
    }),

  create: organizationProcedure
    .input(sessionInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      const [created] = await context.db
        .insert(learningSession)
        .values({
          createdBy: context.viewer?.id ?? null,
          description: input.description?.trim() || null,
          heldAt: input.heldAt,
          kind: input.kind,
          location: input.location?.trim() || null,
          organizationId,
          speaker: input.speaker?.trim() || null,
          tags: input.tags,
          title: input.title,
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "创建学习会议失败" });
      }

      return created;
    }),

  update: organizationProcedure
    .input(sessionInput.partial().extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;
      const { id, ...values } = input;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ createdBy: learningSession.createdBy })
        .from(learningSession)
        .where(
          and(
            eq(learningSession.id, id),
            eq(learningSession.organizationId, organizationId)
          )
        );

      if (!existing || !canEditOwned(viewer, existing.createdBy)) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      const [updated] = await context.db
        .update(learningSession)
        .set({
          ...(values.description === undefined
            ? {}
            : { description: values.description?.trim() || null }),
          ...(values.heldAt === undefined ? {} : { heldAt: values.heldAt }),
          ...(values.kind === undefined ? {} : { kind: values.kind }),
          ...(values.location === undefined
            ? {}
            : { location: values.location?.trim() || null }),
          ...(values.speaker === undefined
            ? {}
            : { speaker: values.speaker?.trim() || null }),
          ...(values.tags === undefined ? {} : { tags: values.tags }),
          ...(values.title === undefined ? {} : { title: values.title }),
        })
        .where(
          and(
            eq(learningSession.id, id),
            eq(learningSession.organizationId, organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      return updated;
    }),

  remove: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ createdBy: learningSession.createdBy })
        .from(learningSession)
        .where(
          and(
            eq(learningSession.id, input.id),
            eq(learningSession.organizationId, organizationId)
          )
        );

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      if (!canEditOwned(viewer, existing.createdBy)) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      await context.db
        .delete(learningSession)
        .where(eq(learningSession.id, input.id));

      return { id: input.id };
    }),
};
