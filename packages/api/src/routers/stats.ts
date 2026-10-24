import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";

import { asset, post } from "@medihub/db/schema/content";
import { learningSession } from "@medihub/db/schema/learning";
import { admission, patient } from "@medihub/db/schema/patients";

import {
  canSeeAllContent,
  canSeeAllPatients,
  organizationIdOf,
} from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";

export const statsRouter = {
  /** 工作台概览：数量、存储占用、最近活动。 */
  overview: organizationProcedure.handler(async ({ context }) => {
    const organizationId = organizationIdOf(context);
    const { viewer } = context;
    const viewerId = viewer?.id ?? "";
    const isIndividual = viewer?.role === "individual";
    // 科室成员只看得到自己建档患者名下的素材，统计口径与之保持一致。
    const ownPatientsOnly = viewer !== undefined && !canSeeAllPatients(viewer);

    const assetWhere = and(
      eq(asset.organizationId, organizationId),
      isNull(asset.deletedAt),
      isIndividual
        ? eq(asset.ownerId, viewerId)
        : or(eq(asset.visibility, "org"), eq(asset.ownerId, viewerId)),
      ownPatientsOnly
        ? or(isNull(asset.patientId), eq(patient.createdBy, viewerId))
        : undefined
    );

    const [patientTotal, admissionTotal, assetTotal, postTotal, sessionTotal] =
      await Promise.all([
        context.db
          .select({ total: count() })
          .from(patient)
          .where(
            and(
              eq(patient.organizationId, organizationId),
              ownPatientsOnly ? eq(patient.createdBy, viewerId) : undefined
            )
          ),
        context.db
          .select({ total: count() })
          .from(admission)
          .where(eq(admission.organizationId, organizationId)),
        context.db
          .select({
            images: sql<number>`sum(case when ${asset.kind} = 'image' then 1 else 0 end)`,
            total: count(),
            videos: sql<number>`sum(case when ${asset.kind} = 'video' then 1 else 0 end)`,
          })
          .from(asset)
          .leftJoin(patient, eq(asset.patientId, patient.id))
          .where(assetWhere),
        context.db
          .select({ total: count() })
          .from(post)
          .where(
            and(
              eq(post.organizationId, organizationId),
              canSeeAllContent(viewer) ? undefined : eq(post.authorId, viewerId)
            )
          ),
        context.db
          .select({ total: count() })
          .from(learningSession)
          .where(
            and(
              eq(learningSession.organizationId, organizationId),
              canSeeAllContent(viewer)
                ? undefined
                : eq(learningSession.createdBy, viewerId)
            )
          ),
      ]);

    const [usage] = await context.db
      .select({ bytes: sql<number>`coalesce(sum(${asset.byteSize}), 0)` })
      .from(asset)
      .leftJoin(patient, eq(asset.patientId, patient.id))
      .where(assetWhere);

    const [recentAssets, recentPatients] = await Promise.all([
      context.db
        .select({
          createdAt: asset.createdAt,
          id: asset.id,
          kind: asset.kind,
          originalName: asset.originalName,
        })
        .from(asset)
        .leftJoin(patient, eq(asset.patientId, patient.id))
        .where(assetWhere)
        .orderBy(desc(asset.createdAt))
        .limit(8),
      context.db
        .select({
          createdAt: patient.createdAt,
          id: patient.id,
          name: patient.name,
          status: patient.status,
          summary: patient.summary,
        })
        .from(patient)
        .where(eq(patient.organizationId, organizationId))
        .orderBy(desc(patient.createdAt))
        .limit(6),
    ]);

    return {
      activity: { recentAssets, recentPatients },
      counts: {
        admissions: admissionTotal[0]?.total ?? 0,
        assets: assetTotal[0]?.total ?? 0,
        images: Number(assetTotal[0]?.images ?? 0),
        patients: patientTotal[0]?.total ?? 0,
        posts: postTotal[0]?.total ?? 0,
        sessions: sessionTotal[0]?.total ?? 0,
        storageBytes: Number(usage?.bytes ?? 0),
        videos: Number(assetTotal[0]?.videos ?? 0),
      },
    };
  }),
};
