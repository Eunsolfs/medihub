import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { user } from "@medihub/db/schema/auth";
import {
  asset,
  assetKind,
  assetVisibility,
  clinicalStage,
} from "@medihub/db/schema/content";

import { canDelete, organizationIdOf } from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";

const assetSummary = {
  admissionId: asset.admissionId,
  bodyPart: asset.bodyPart,
  byteSize: asset.byteSize,
  capturedAt: asset.capturedAt,
  collectionId: asset.collectionId,
  createdAt: asset.createdAt,
  description: asset.description,
  durationMs: asset.durationMs,
  height: asset.height,
  id: asset.id,
  kind: asset.kind,
  mimeType: asset.mimeType,
  originalName: asset.originalName,
  ownerId: asset.ownerId,
  ownerName: user.name,
  patientId: asset.patientId,
  postId: asset.postId,
  sessionId: asset.sessionId,
  stage: asset.stage,
  tags: asset.tags,
  timelineOrder: asset.timelineOrder,
  visibility: asset.visibility,
  width: asset.width,
};

const listInput = z.object({
  admissionId: z.string().min(1).optional(),
  collectionId: z.string().min(1).optional(),
  kind: z.enum(assetKind).optional(),
  page: z.int().positive().default(1),
  pageSize: z.int().positive().max(200).default(60),
  patientId: z.string().min(1).optional(),
  postId: z.string().min(1).optional(),
  q: z.string().trim().max(80).optional(),
  sessionId: z.string().min(1).optional(),
  sort: z.enum(["timeline", "recent", "name"]).default("recent"),
  stage: z.enum(clinicalStage).optional(),
});

const assetInput = z.object({
  bodyPart: z.string().trim().max(60).nullish(),
  capturedAt: z.coerce.date().nullish(),
  description: z.string().max(4000).nullish(),
  originalName: z.string().trim().min(1).max(200).optional(),
  stage: z.enum(clinicalStage).nullish(),
  tags: z.array(z.string().trim().min(1).max(20)).max(30).optional(),
  visibility: z.enum(assetVisibility).optional(),
});

export const assetsRouter = {
  list: organizationProcedure
    .input(listInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      const filters: SQL[] = [
        eq(asset.organizationId, organizationId),
        isNull(asset.deletedAt),
      ];

      if (input.patientId) {
        filters.push(eq(asset.patientId, input.patientId));
      }

      if (input.admissionId) {
        filters.push(eq(asset.admissionId, input.admissionId));
      }

      if (input.collectionId) {
        filters.push(eq(asset.collectionId, input.collectionId));
      }

      if (input.sessionId) {
        filters.push(eq(asset.sessionId, input.sessionId));
      }

      if (input.postId) {
        filters.push(eq(asset.postId, input.postId));
      }

      if (input.kind) {
        filters.push(eq(asset.kind, input.kind));
      }

      if (input.stage) {
        filters.push(eq(asset.stage, input.stage));
      }

      if (input.q) {
        const keyword = `%${input.q}%`;

        const search = or(
          like(asset.originalName, keyword),
          like(asset.description, keyword),
          like(asset.tags, keyword),
          like(asset.bodyPart, keyword)
        );

        if (search) {
          filters.push(search);
        }
      }

      // 个人空间的素材只有本人可见；科室素材对全科室可见。
      const viewerId = context.viewer?.id ?? "";

      if (context.viewer?.role === "individual") {
        filters.push(eq(asset.ownerId, viewerId));
      } else {
        const visibleToMember = or(
          eq(asset.visibility, "org"),
          eq(asset.ownerId, viewerId)
        );

        if (visibleToMember) {
          filters.push(visibleToMember);
        }
      }

      const where = and(...filters);

      const orderBy =
        input.sort === "timeline"
          ? [
              asc(asset.capturedAt),
              asc(asset.timelineOrder),
              asc(asset.createdAt),
            ]
          : input.sort === "name"
            ? [asc(asset.originalName)]
            : [desc(asset.createdAt)];

      const [items, totals] = await Promise.all([
        context.db
          .select(assetSummary)
          .from(asset)
          .leftJoin(user, eq(asset.ownerId, user.id))
          .where(where)
          .orderBy(...orderBy)
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(asset).where(where),
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
        .select({
          ...assetSummary,
          checksum: asset.checksum,
          storageKey: asset.storageKey,
        })
        .from(asset)
        .leftJoin(user, eq(asset.ownerId, user.id))
        .where(
          and(eq(asset.id, input.id), eq(asset.organizationId, organizationId))
        );

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "素材不存在" });
      }

      return row;
    }),

  update: organizationProcedure
    .input(assetInput.partial().extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { id, ...values } = input;

      const [updated] = await context.db
        .update(asset)
        .set({
          ...(values.bodyPart === undefined
            ? {}
            : { bodyPart: values.bodyPart?.trim() || null }),
          ...(values.capturedAt === undefined
            ? {}
            : { capturedAt: values.capturedAt ?? null }),
          ...(values.description === undefined
            ? {}
            : { description: values.description?.trim() || null }),
          ...(values.originalName === undefined
            ? {}
            : { originalName: values.originalName }),
          ...(values.stage === undefined
            ? {}
            : { stage: values.stage ?? null }),
          ...(values.tags === undefined ? {} : { tags: values.tags }),
          ...(values.visibility === undefined
            ? {}
            : { visibility: values.visibility }),
        })
        .where(and(eq(asset.id, id), eq(asset.organizationId, organizationId)))
        .returning({ id: asset.id });

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "素材不存在" });
      }

      return updated;
    }),

  /** 拖拽排序：按传入顺序重写 timelineOrder。 */
  reorder: organizationProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }))
    .handler(({ context, input }) => {
      const organizationId = organizationIdOf(context);

      // node:sqlite 是同步驱动，事务回调同步执行完即提交。
      context.db.transaction((tx) => {
        for (const [index, id] of input.ids.entries()) {
          tx.update(asset)
            .set({ timelineOrder: index })
            .where(
              and(eq(asset.id, id), eq(asset.organizationId, organizationId))
            )
            .run();
        }
      });

      return { updated: input.ids.length };
    }),

  move: organizationProcedure
    .input(
      z.object({
        admissionId: z.string().min(1).nullish(),
        collectionId: z.string().min(1).nullish(),
        ids: z.array(z.string().min(1)).min(1).max(500),
        patientId: z.string().min(1).nullish(),
        sessionId: z.string().min(1).nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      await context.db
        .update(asset)
        .set({
          ...(input.admissionId === undefined
            ? {}
            : { admissionId: input.admissionId ?? null }),
          ...(input.collectionId === undefined
            ? {}
            : { collectionId: input.collectionId ?? null }),
          ...(input.patientId === undefined
            ? {}
            : { patientId: input.patientId ?? null }),
          ...(input.sessionId === undefined
            ? {}
            : { sessionId: input.sessionId ?? null }),
        })
        .where(
          and(
            eq(asset.organizationId, organizationId),
            inArray(asset.id, input.ids)
          )
        );

      return { moved: input.ids.length };
    }),

  /** 软删除：文件仍留在存储中，便于误删恢复。 */
  remove: organizationProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const rows = await context.db
        .select({ id: asset.id, ownerId: asset.ownerId })
        .from(asset)
        .where(
          and(
            eq(asset.organizationId, organizationId),
            inArray(asset.id, input.ids)
          )
        );

      const deletable = rows
        .filter((row) => canDelete(viewer, row.ownerId))
        .map((row) => row.id);

      if (deletable.length === 0) {
        throw new ORPCError("FORBIDDEN", {
          message: "没有可删除的素材",
        });
      }

      await context.db
        .update(asset)
        .set({ deletedAt: new Date() })
        .where(inArray(asset.id, deletable));

      return {
        deleted: deletable.length,
        skipped: rows.length - deletable.length,
      };
    }),
};
