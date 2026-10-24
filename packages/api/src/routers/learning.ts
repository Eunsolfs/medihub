import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, inArray, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { asset, shareVisibility } from "@medihub/db/schema/content";
import {
  learningSession,
  learningSessionKind,
} from "@medihub/db/schema/learning";

import {
  canEditOwned,
  canSeeAllContent,
  organizationIdOf,
  postViewGate,
} from "#src/access.ts";
import {
  assertShareScope,
  audienceMatches,
  deleteAudience,
  loadAudience,
  replaceAudience,
} from "#src/audience.ts";
import type { AudienceTargets } from "#src/audience.ts";
import { organizationProcedure } from "#src/procedures.ts";

const sessionInput = z.object({
  description: z.string().max(8000).nullish(),
  heldAt: z.coerce.date(),
  kind: z.enum(learningSessionKind).default("lecture"),
  location: z.string().trim().max(120).nullish(),
  speaker: z.string().trim().max(60).nullish(),
  tags: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  title: z.string().trim().min(1).max(200),
  visibility: z.enum(shareVisibility).default("org"),
  audienceOrganizations: z.array(z.string().min(1)).max(50).default([]),
  audienceUsers: z.array(z.string().min(1)).max(200).default([]),
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

      // 会议内容对本科室登录用户可见（只读）；编辑权另算。
      if (!canSeeAllContent(viewer)) {
        const audienceMatch = audienceMatches(
          context.db,
          "session",
          learningSession.id,
          viewer
        );

        const readable = or(
          eq(learningSession.createdBy, viewer.id),
          inArray(learningSession.visibility, ["org", "logged_in", "public"]),
          and(eq(learningSession.visibility, "selected"), audienceMatch)
        );

        if (readable) {
          filters.push(readable);
        }
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
            createdBy: learningSession.createdBy,
            heldAt: learningSession.heldAt,
            id: learningSession.id,
            kind: learningSession.kind,
            location: learningSession.location,
            speaker: learningSession.speaker,
            tags: learningSession.tags,
            title: learningSession.title,
            visibility: learningSession.visibility,
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
        items: items.map((row) => ({
          ...row,
          canEdit: canEditOwned(viewer, row.createdBy),
        })),
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),

  get: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [row] = await context.db
        .select()
        .from(learningSession)
        .where(
          and(
            eq(learningSession.id, input.id),
            eq(learningSession.organizationId, organizationId)
          )
        );

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      const audience = await loadAudience(context.db, "session", row.id);

      const gate = postViewGate(
        {
          authorId: row.createdBy ?? "",
          organizationId: row.organizationId,
          visibility: row.visibility,
        },
        viewer,
        audience
      );

      if (!gate.allowed) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      return {
        ...row,
        audience,
        canEdit: canEditOwned(viewer, row.createdBy),
      };
    }),

  create: organizationProcedure
    .input(sessionInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const targets: AudienceTargets = {
        organizations: input.audienceOrganizations,
        users: input.audienceUsers,
      };

      await assertShareScope(context.db, viewer, input.visibility, targets);

      const [created] = await context.db
        .insert(learningSession)
        .values({
          createdBy: viewer.id,
          description: input.description?.trim() || null,
          heldAt: input.heldAt,
          kind: input.kind,
          location: input.location?.trim() || null,
          organizationId,
          speaker: input.speaker?.trim() || null,
          tags: input.tags,
          title: input.title,
          visibility: input.visibility,
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "创建学习会议失败" });
      }

      if (input.visibility === "selected") {
        await replaceAudience(context.db, "session", created.id, targets);
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

      const targets: AudienceTargets = {
        organizations: values.audienceOrganizations ?? [],
        users: values.audienceUsers ?? [],
      };

      if (values.visibility !== undefined) {
        await assertShareScope(context.db, viewer, values.visibility, targets);
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
          ...(values.visibility === undefined
            ? {}
            : { visibility: values.visibility }),
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

      if (values.visibility !== undefined) {
        await replaceAudience(
          context.db,
          "session",
          id,
          values.visibility === "selected"
            ? targets
            : { organizations: [], users: [] }
        );
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

      if (!existing || !canEditOwned(viewer, existing.createdBy)) {
        throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
      }

      await deleteAudience(context.db, "session", input.id);
      await context.db
        .delete(learningSession)
        .where(eq(learningSession.id, input.id));

      return { id: input.id };
    }),
};
