import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { user } from "@medihub/db/schema/auth";
import { asset, post } from "@medihub/db/schema/content";
import { learningSession } from "@medihub/db/schema/learning";
import { organization } from "@medihub/db/schema/organization";
import { admission, patient } from "@medihub/db/schema/patients";
import {
  exportJob,
  exportKind,
  exportStatus,
  storageTarget,
} from "@medihub/db/schema/system";

import { isAdminRole, organizationIdOf } from "#src/access.ts";
import type { Viewer } from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";
import { recordAudit } from "#src/routers/audit.ts";
import type { ExportAssetRow, ExportRow } from "#src/services/export.ts";
import { runExportJob } from "#src/services/export.ts";

const assetColumns = [
  "文件名",
  "MIME 类型",
  "大小(字节)",
  "拍摄时间",
  "分期",
  "部位",
  "素材描述",
  "标签",
  "存储键",
] as const;

/** data.csv 的列随导出类型变化，第一列固定是记录类型，便于在 Excel 里筛选。 */
const EXPORT_COLUMNS: Record<(typeof exportKind)[number], string[]> = {
  admission: [
    "记录类型",
    "患者姓名",
    "病案号",
    "就诊类型",
    "住院号",
    "入院时间",
    "出院时间",
    "科室",
    "主诊医生",
    "诊断",
    "主诉",
    "治疗",
    "备注",
    "标签",
    ...assetColumns,
  ],
  patient: [
    "记录类型",
    "姓名",
    "性别",
    "出生日期",
    "病案号",
    "身份证号",
    "电话",
    "状态",
    "主诉",
    "标签",
    "创建时间",
    "就诊类型",
    "住院号",
    "入院时间",
    "出院时间",
    "诊断",
    ...assetColumns,
  ],
  post: [
    "记录类型",
    "标题",
    "slug",
    "摘要",
    "正文",
    "可见范围",
    "状态",
    "发布时间",
    "标签",
    "阅读量",
    "文件名",
    "MIME 类型",
    "大小(字节)",
    "存储键",
  ],
  selection: ["记录类型", ...assetColumns],
  session: [
    "记录类型",
    "标题",
    "类型",
    "时间",
    "地点",
    "讲者",
    "描述",
    "标签",
    ...assetColumns,
  ],
};

const iso = (value: Date | null | undefined) =>
  value ? value.toISOString() : "";

const assetRow = (
  row: typeof asset.$inferSelect,
  type = "素材"
): ExportRow => ({
  文件名: row.originalName,
  "MIME 类型": row.mimeType,
  分期: row.stage ?? "",
  存储键: row.storageKey,
  拍摄时间: iso(row.capturedAt),
  标签: row.tags.join("、"),
  素材描述: row.description ?? "",
  部位: row.bodyPart ?? "",
  "大小(字节)": String(row.byteSize),
  记录类型: type,
});

const toFileRow = (row: typeof asset.$inferSelect): ExportAssetRow => ({
  byteSize: row.byteSize,
  capturedAt: row.capturedAt,
  id: row.id,
  mimeType: row.mimeType,
  originalName: row.originalName,
  storageKey: row.storageKey,
  storageTargetId: row.storageTargetId,
});

const stamp = () =>
  new Date().toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "");

const resolveTarget = async (
  db: Database,
  organizationId: string,
  targetId?: string
) => {
  if (targetId) {
    const [row] = await db
      .select()
      .from(storageTarget)
      .where(
        and(eq(storageTarget.id, targetId), eq(storageTarget.enabled, true))
      );

    if (!row || (row.organizationId && row.organizationId !== organizationId)) {
      throw new ORPCError("NOT_FOUND", { message: "存储目标不存在" });
    }

    return row;
  }

  const [organizationDefault] = await db
    .select()
    .from(storageTarget)
    .where(
      and(
        eq(storageTarget.organizationId, organizationId),
        eq(storageTarget.enabled, true),
        eq(storageTarget.isDefault, true)
      )
    );

  if (organizationDefault) {
    return organizationDefault;
  }

  const [globalDefault] = await db
    .select()
    .from(storageTarget)
    .where(
      and(
        isNull(storageTarget.organizationId),
        eq(storageTarget.enabled, true),
        eq(storageTarget.isDefault, true)
      )
    );

  if (!globalDefault) {
    throw new ORPCError("BAD_REQUEST", {
      message: "尚未配置默认存储目标，请先在存储设置里添加一个",
    });
  }

  return globalDefault;
};

const visibleJob = async (
  db: Database,
  viewer: Viewer,
  organizationId: string,
  id: string
) => {
  const [row] = await db
    .select({ ...getTableColumns(exportJob), requestedByName: user.name })
    .from(exportJob)
    .leftJoin(user, eq(exportJob.requestedBy, user.id))
    .where(
      and(eq(exportJob.id, id), eq(exportJob.organizationId, organizationId))
    );

  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "导出任务不存在" });
  }

  if (!isAdminRole(viewer.role) && row.requestedBy !== viewer.id) {
    throw new ORPCError("NOT_FOUND", { message: "导出任务不存在" });
  }

  return row;
};

export const exportsRouter = {
  create: organizationProcedure
    .input(
      z.object({
        admissionId: z.string().min(1).optional(),
        assetIds: z.array(z.string().min(1)).max(2000).optional(),
        fields: z.array(z.string().trim().min(1).max(40)).max(80).optional(),
        includeFiles: z.boolean().default(true),
        kind: z.enum(exportKind),
        patientId: z.string().min(1).optional(),
        postId: z.string().min(1).optional(),
        sessionId: z.string().min(1).optional(),
        targetId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const { storage } = context;

      if (!storage) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "服务端未配置存储访问器",
        });
      }

      const { db } = context;
      const columns = EXPORT_COLUMNS[input.kind];

      const selectedColumns =
        input.fields && input.fields.length > 0
          ? columns.filter(
              (column) =>
                column === "记录类型" || input.fields?.includes(column)
            )
          : columns;

      let rows: ExportRow[] = [];
      let assets: (typeof asset.$inferSelect)[] = [];
      let source = "";

      if (input.kind === "patient") {
        if (!input.patientId) {
          throw new ORPCError("BAD_REQUEST", { message: "缺少 patientId" });
        }

        const [patientRow] = await db
          .select()
          .from(patient)
          .where(
            and(
              eq(patient.id, input.patientId),
              eq(patient.organizationId, organizationId)
            )
          );

        if (!patientRow) {
          throw new ORPCError("NOT_FOUND", { message: "患者不存在" });
        }

        const admissions = await db
          .select()
          .from(admission)
          .where(eq(admission.patientId, patientRow.id))
          .orderBy(asc(admission.admittedAt));

        const admissionIds = admissions.map((row) => row.id);
        assets = await db
          .select()
          .from(asset)
          .where(
            and(
              eq(asset.organizationId, organizationId),
              isNull(asset.deletedAt),
              admissionIds.length > 0
                ? or(
                    eq(asset.patientId, patientRow.id),
                    inArray(asset.admissionId, admissionIds)
                  )
                : eq(asset.patientId, patientRow.id)
            )
          )
          .orderBy(asc(asset.capturedAt));

        source = `患者 ${patientRow.name}${patientRow.medicalRecordNo ? `（病案号 ${patientRow.medicalRecordNo}）` : ""}`;
        rows = [
          {
            主诉: patientRow.summary ?? "",
            出生日期: iso(patientRow.birthDate),
            创建时间: iso(patientRow.createdAt),
            姓名: patientRow.name,
            性别: patientRow.gender,
            身份证号: patientRow.idCardNo ?? "",
            电话: patientRow.phone ?? "",
            病案号: patientRow.medicalRecordNo ?? "",
            标签: patientRow.tags.join("、"),
            状态: patientRow.status,
            记录类型: "患者",
          },
          ...admissions.map((row): ExportRow => ({
            主诉: row.chiefComplaint ?? "",
            入院时间: iso(row.admittedAt),
            出院时间: iso(row.dischargedAt),
            住院号: row.admissionNo ?? "",
            就诊类型: row.kind,
            诊断: row.diagnosis ?? "",
            记录类型: "就诊",
          })),
          ...assets.map((row) => assetRow(row)),
        ];
      } else if (input.kind === "admission") {
        if (!input.admissionId) {
          throw new ORPCError("BAD_REQUEST", { message: "缺少 admissionId" });
        }

        const [admissionRow] = await db
          .select()
          .from(admission)
          .where(
            and(
              eq(admission.id, input.admissionId),
              eq(admission.organizationId, organizationId)
            )
          );

        if (!admissionRow) {
          throw new ORPCError("NOT_FOUND", { message: "就诊记录不存在" });
        }

        const [patientRow] = await db
          .select()
          .from(patient)
          .where(eq(patient.id, admissionRow.patientId));

        assets = await db
          .select()
          .from(asset)
          .where(
            and(
              eq(asset.organizationId, organizationId),
              isNull(asset.deletedAt),
              eq(asset.admissionId, admissionRow.id)
            )
          )
          .orderBy(asc(asset.capturedAt));

        source = `就诊 ${admissionRow.admissionNo ?? admissionRow.id}（患者 ${patientRow?.name ?? "未知"}）`;
        rows = [
          {
            主诉: admissionRow.chiefComplaint ?? "",
            入院时间: iso(admissionRow.admittedAt),
            出院时间: iso(admissionRow.dischargedAt),
            科室: admissionRow.department ?? "",
            住院号: admissionRow.admissionNo ?? "",
            备注: admissionRow.notes ?? "",
            就诊类型: admissionRow.kind,
            标签: admissionRow.tags.join("、"),
            患者姓名: patientRow?.name ?? "",
            病案号: patientRow?.medicalRecordNo ?? "",
            治疗: admissionRow.treatment ?? "",
            诊断: admissionRow.diagnosis ?? "",
            记录类型: "就诊",
            主诊医生: admissionRow.attendingDoctor ?? "",
          },
          ...assets.map((row) => assetRow(row)),
        ];
      } else if (input.kind === "session") {
        if (!input.sessionId) {
          throw new ORPCError("BAD_REQUEST", { message: "缺少 sessionId" });
        }

        const [sessionRow] = await db
          .select()
          .from(learningSession)
          .where(
            and(
              eq(learningSession.id, input.sessionId),
              eq(learningSession.organizationId, organizationId)
            )
          );

        if (!sessionRow) {
          throw new ORPCError("NOT_FOUND", { message: "学习会议不存在" });
        }

        assets = await db
          .select()
          .from(asset)
          .where(
            and(
              eq(asset.organizationId, organizationId),
              isNull(asset.deletedAt),
              eq(asset.sessionId, sessionRow.id)
            )
          )
          .orderBy(asc(asset.capturedAt));

        source = `学习会议 ${sessionRow.title}（${iso(sessionRow.heldAt)}）`;
        rows = [
          {
            地点: sessionRow.location ?? "",
            描述: sessionRow.description ?? "",
            时间: iso(sessionRow.heldAt),
            标题: sessionRow.title,
            标签: sessionRow.tags.join("、"),
            类型: sessionRow.kind,
            记录类型: "学习会议",
            讲者: sessionRow.speaker ?? "",
          },
          ...assets.map((row) => assetRow(row)),
        ];
      } else if (input.kind === "post") {
        if (!input.postId) {
          throw new ORPCError("BAD_REQUEST", { message: "缺少 postId" });
        }

        const [postRow] = await db
          .select()
          .from(post)
          .where(
            and(
              eq(post.id, input.postId),
              eq(post.organizationId, organizationId)
            )
          );

        if (!postRow) {
          throw new ORPCError("NOT_FOUND", { message: "帖子不存在" });
        }

        assets = await db
          .select()
          .from(asset)
          .where(
            and(
              eq(asset.organizationId, organizationId),
              isNull(asset.deletedAt),
              eq(asset.postId, postRow.id)
            )
          )
          .orderBy(asc(asset.capturedAt));

        source = `教学帖子 ${postRow.title}`;
        rows = [
          {
            slug: postRow.slug,
            发布时间: iso(postRow.publishedAt),
            可见范围: postRow.visibility,
            摘要: postRow.excerpt ?? "",
            标签: postRow.tags.join("、"),
            标题: postRow.title,
            正文: postRow.content,
            状态: postRow.status,
            记录类型: "帖子",
            阅读量: String(postRow.viewCount),
          },
          ...assets.map((row) => assetRow(row)),
        ];
      } else {
        if (!input.assetIds || input.assetIds.length === 0) {
          throw new ORPCError("BAD_REQUEST", {
            message: "按选择导出需要提供 assetIds",
          });
        }

        assets = await db
          .select()
          .from(asset)
          .where(
            and(
              eq(asset.organizationId, organizationId),
              isNull(asset.deletedAt),
              inArray(asset.id, input.assetIds)
            )
          )
          .orderBy(asc(asset.capturedAt));

        if (assets.length === 0) {
          throw new ORPCError("NOT_FOUND", { message: "没有可导出的素材" });
        }

        source = `选中的 ${assets.length} 个素材`;
        rows = assets.map((row) => assetRow(row));
      }

      const [organizationRow] = await db
        .select({
          code: organization.code,
          id: organization.id,
          name: organization.name,
        })
        .from(organization)
        .where(eq(organization.id, organizationId));

      if (!organizationRow) {
        throw new ORPCError("NOT_FOUND", { message: "科室不存在" });
      }

      // 先校验数据来源，再解析存储目标：来源不存在时应报 NOT_FOUND，
      // 而不是被「没配置存储」掩盖。
      const target = await resolveTarget(db, organizationId, input.targetId);

      const params = {
        admissionId: input.admissionId ?? null,
        assetIds: input.assetIds ?? null,
        fields: input.fields ?? null,
        includeFiles: input.includeFiles,
        kind: input.kind,
        patientId: input.patientId ?? null,
        postId: input.postId ?? null,
        sessionId: input.sessionId ?? null,
        targetId: target.id,
      };

      const [job] = await db
        .insert(exportJob)
        .values({
          kind: input.kind,
          organizationId,
          params,
          requestedBy: viewer.id,
          status: "running",
        })
        .returning();

      if (!job) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建导出任务失败",
        });
      }

      const fileName = `${input.kind}-${stamp()}.zip`;

      try {
        const result = await runExportJob({
          db,
          document: {
            assets: assets.map(toFileRow),
            columns: selectedColumns,
            kind: input.kind,
            params,
            rows,
            source,
          },
          fileName,
          includeFiles: input.includeFiles,
          jobId: job.id,
          organization: organizationRow,
          requester: {
            email: viewer.email,
            id: viewer.id,
            name: viewer.name,
          },
          storage,
          target,
        });

        const [ready] = await db
          .update(exportJob)
          .set({
            assetCount: result.assetCount,
            byteSize: result.byteSize,
            completedAt: new Date(),
            fileName: result.fileName,
            status: "ready",
            storageKey: result.storageKey,
            storageTargetId: target.id,
          })
          .where(eq(exportJob.id, job.id))
          .returning();

        await recordAudit(db, {
          action: "export.create",
          actorId: viewer.id,
          detail: {
            assetCount: result.assetCount,
            byteSize: result.byteSize,
            kind: input.kind,
          },
          entityId: job.id,
          entityType: "export_job",
          organizationId,
        });

        return ready ?? job;
      } catch (error) {
        const [failed] = await db
          .update(exportJob)
          .set({
            completedAt: new Date(),
            error: error instanceof Error ? error.message : "导出失败",
            status: "failed",
          })
          .where(eq(exportJob.id, job.id))
          .returning();

        return failed ?? job;
      }
    }),

  list: organizationProcedure
    .input(
      z.object({
        kind: z.enum(exportKind).optional(),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
        status: z.enum(exportStatus).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const filters: SQL[] = [eq(exportJob.organizationId, organizationId)];

      if (!isAdminRole(viewer.role)) {
        filters.push(eq(exportJob.requestedBy, viewer.id));
      }

      if (input.kind) {
        filters.push(eq(exportJob.kind, input.kind));
      }

      if (input.status) {
        filters.push(eq(exportJob.status, input.status));
      }

      const where = and(...filters);

      const [items, totals] = await Promise.all([
        context.db
          .select({ ...getTableColumns(exportJob), requestedByName: user.name })
          .from(exportJob)
          .leftJoin(user, eq(exportJob.requestedBy, user.id))
          .where(where)
          .orderBy(desc(exportJob.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(exportJob).where(where),
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

      return await visibleJob(context.db, viewer, organizationId, input.id);
    }),

  remove: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const job = await visibleJob(
        context.db,
        viewer,
        organizationId,
        input.id
      );

      if (job.storageKey && job.storageTargetId) {
        const [target] = await context.db
          .select()
          .from(storageTarget)
          .where(eq(storageTarget.id, job.storageTargetId));

        if (target) {
          // 文件删不掉不应阻塞清理任务记录，遗留对象由运维侧清理。
          await context.storage
            ?.driverFor(target)
            .delete(job.storageKey)
            .catch(() => {});
        }
      }

      await context.db.delete(exportJob).where(eq(exportJob.id, job.id));

      await recordAudit(context.db, {
        action: "export.remove",
        actorId: viewer.id,
        entityId: job.id,
        entityType: "export_job",
        organizationId,
      });

      return { id: job.id };
    }),
};
