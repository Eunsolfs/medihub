import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { user } from "@medihub/db/schema/auth";
import {
  asset,
  assetKind,
  assetVisibility,
  clinicalStage,
} from "@medihub/db/schema/content";
import { learningSession } from "@medihub/db/schema/learning";
import { patient } from "@medihub/db/schema/patients";

import type { Viewer } from "#src/access.ts";
import {
  canAccessPatient,
  canDelete,
  canSeeAllPatients,
  organizationIdOf,
} from "#src/access.ts";
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
  patientName: patient.name,
  sessionTitle: learningSession.title,
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
  /** 资料库的分类视图：患者记录 / 会议资料 / 资料库目录 / 文章附件。 */
  source: z
    .enum(["all", "patients", "sessions", "collections", "posts"])
    .default("all"),
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

/**
 * 校验一组素材所属的患者是否归当前用户：挂在他人的患者档案下时按不存在处理。
 * 未挂患者的素材（资料库、会议、文章附件）沿用原有可见性规则。
 */
const assertAssetPatientAccess = async (
  context: { db: Database },
  rows: { patientId: string | null }[],
  viewer: Viewer
) => {
  if (canSeeAllPatients(viewer)) {
    return;
  }

  const patientIds = [
    ...new Set(
      rows.flatMap((row) =>
        typeof row.patientId === "string" ? [row.patientId] : []
      )
    ),
  ];

  if (patientIds.length === 0) {
    return;
  }

  const records = await context.db
    .select({
      createdBy: patient.createdBy,
      id: patient.id,
      organizationId: patient.organizationId,
    })
    .from(patient)
    .where(inArray(patient.id, patientIds));

  const byId = new Map(
    records.map(
      (record: {
        createdBy: string | null;
        id: string;
        organizationId: string;
      }) => [record.id, record]
    )
  );

  for (const row of rows) {
    if (!row.patientId) {
      continue;
    }

    const record = byId.get(row.patientId);

    if (!record || !canAccessPatient(viewer, record)) {
      throw new ORPCError("NOT_FOUND", { message: "素材不存在" });
    }
  }
};

export const assetsRouter = {
  list: organizationProcedure
    .input(listInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const filters: SQL[] = [
        eq(asset.organizationId, organizationId),
        isNull(asset.deletedAt),
      ];

      // 资料库按来源分类：患者记录 / 会议资料 / 资料库目录 / 文章附件。
      if (input.source === "patients") {
        filters.push(isNotNull(asset.patientId));
      } else if (input.source === "sessions") {
        filters.push(isNotNull(asset.sessionId));
      } else if (input.source === "collections") {
        filters.push(isNotNull(asset.collectionId));
      } else if (input.source === "posts") {
        filters.push(isNotNull(asset.postId));
      }

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

      // 个人空间的素材只有本人可见；科室素材对全科室可见，
      // 但挂在患者档案下的素材要服从「谁的患者归谁」。
      const visibilityFilter =
        viewer.role === "individual"
          ? eq(asset.ownerId, viewer.id)
          : or(eq(asset.visibility, "org"), eq(asset.ownerId, viewer.id));

      if (visibilityFilter) {
        filters.push(visibilityFilter);
      }

      if (!canSeeAllPatients(viewer)) {
        const patientScope = or(
          isNull(asset.patientId),
          eq(patient.createdBy, viewer.id)
        );

        if (patientScope) {
          filters.push(patientScope);
        }

        // 学习会议资料同样「谁创建的会议归谁」。
        const sessionScope = or(
          isNull(asset.sessionId),
          eq(learningSession.createdBy, viewer.id)
        );

        if (sessionScope) {
          filters.push(sessionScope);
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
          .leftJoin(patient, eq(asset.patientId, patient.id))
          .leftJoin(learningSession, eq(asset.sessionId, learningSession.id))
          .where(where)
          .orderBy(...orderBy)
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db
          .select({ total: count() })
          .from(asset)
          .leftJoin(patient, eq(asset.patientId, patient.id))
          .leftJoin(learningSession, eq(asset.sessionId, learningSession.id))
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
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

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

      await assertAssetPatientAccess(context, [row], viewer);

      return row;
    }),

  update: organizationProcedure
    .input(assetInput.partial().extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { id, ...values } = input;
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ patientId: asset.patientId })
        .from(asset)
        .where(and(eq(asset.id, id), eq(asset.organizationId, organizationId)));

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "素材不存在" });
      }

      await assertAssetPatientAccess(context, [existing], viewer);

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
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const rows = await context.db
        .select({ patientId: asset.patientId })
        .from(asset)
        .where(
          and(
            eq(asset.organizationId, organizationId),
            inArray(asset.id, input.ids)
          )
        );

      await assertAssetPatientAccess(context, rows, viewer);

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
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const rows = await context.db
        .select({ patientId: asset.patientId })
        .from(asset)
        .where(
          and(
            eq(asset.organizationId, organizationId),
            inArray(asset.id, input.ids)
          )
        );

      await assertAssetPatientAccess(context, rows, viewer);

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
        .select({
          id: asset.id,
          ownerId: asset.ownerId,
          patientId: asset.patientId,
        })
        .from(asset)
        .where(
          and(
            eq(asset.organizationId, organizationId),
            inArray(asset.id, input.ids)
          )
        );

      await assertAssetPatientAccess(context, rows, viewer);

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
