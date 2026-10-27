import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, inArray, like, or, sum } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import {
  admission,
  patient,
  patientGender,
  patientStatus,
} from "@medihub/db/schema/patients";
import { storageTarget } from "@medihub/db/schema/system";

import {
  canAccessPatient,
  canDelete,
  canSeeAllPatients,
  organizationIdOf,
  requireClinicalRights,
} from "#src/access.ts";
import type { Viewer } from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";
import { recordAudit } from "#src/routers/audit.ts";

const patientInput = z.object({
  birthDate: z.coerce.date().nullish(),
  gender: z.enum(patientGender).default("unknown"),
  idCardNo: z.string().trim().max(40).nullish(),
  medicalRecordNo: z.string().trim().max(40).nullish(),
  name: z.string().trim().min(1).max(80),
  notes: z.string().max(4000).nullish(),
  phone: z.string().trim().max(30).nullish(),
  status: z.enum(patientStatus).default("active"),
  summary: z.string().trim().max(200).nullish(),
  tags: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
});

const patientId = z.object({ id: z.string().min(1) });

const bulkIds = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

const loadBulkPatients = async (input: {
  db: Database;
  ids: string[];
  organizationId: string;
  viewer: Viewer;
}) => {
  const rows = await input.db
    .select({
      createdBy: patient.createdBy,
      id: patient.id,
      name: patient.name,
    })
    .from(patient)
    .where(
      and(
        inArray(patient.id, input.ids),
        eq(patient.organizationId, input.organizationId)
      )
    );

  if (rows.length !== input.ids.length) {
    throw new ORPCError("NOT_FOUND", {
      message: "有患者不存在或不属于当前科室，请刷新后重试",
    });
  }

  if (rows.some((row) => !canAccessPatient(input.viewer, row))) {
    throw new ORPCError("FORBIDDEN", { message: "部分患者没有操作权限" });
  }

  return rows;
};

const emptyToNull = (value: string | null | undefined) => value?.trim() || null;

const listInput = z.object({
  page: z.int().positive().default(1),
  pageSize: z.int().positive().max(100).default(20),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["recent", "name"]).default("recent"),
  status: z.enum(patientStatus).optional(),
  tag: z.string().trim().optional(),
});

export const patientsRouter = {
  list: organizationProcedure
    .input(listInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const filters: SQL[] = [eq(patient.organizationId, organizationId)];

      if (input.q) {
        const keyword = `%${input.q}%`;

        const search = or(
          like(patient.name, keyword),
          like(patient.medicalRecordNo, keyword),
          like(patient.phone, keyword),
          like(patient.summary, keyword)
        );

        if (search) {
          filters.push(search);
        }
      }

      if (input.status) {
        filters.push(eq(patient.status, input.status));
      }

      if (input.tag) {
        filters.push(like(patient.tags, `%"${input.tag}"%`));
      }

      if (!canSeeAllPatients(viewer)) {
        filters.push(eq(patient.createdBy, viewer.id));
      }

      const where = and(...filters);

      const [items, totals] = await Promise.all([
        context.db
          .select({
            admissionCount: context.db.$count(
              admission,
              eq(admission.patientId, patient.id)
            ),
            birthDate: patient.birthDate,
            createdAt: patient.createdAt,
            gender: patient.gender,
            id: patient.id,
            medicalRecordNo: patient.medicalRecordNo,
            name: patient.name,
            phone: patient.phone,
            status: patient.status,
            summary: patient.summary,
            tags: patient.tags,
            updatedAt: patient.updatedAt,
          })
          .from(patient)
          .where(where)
          .orderBy(
            input.sort === "name" ? asc(patient.name) : desc(patient.createdAt)
          )
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(patient).where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),

  /** 下拉选择用的轻量列表。 */
  options: organizationProcedure.handler(async ({ context }) => {
    const organizationId = organizationIdOf(context);
    const { viewer } = context;

    if (!viewer) {
      throw new ORPCError("UNAUTHORIZED");
    }

    requireClinicalRights(viewer);

    return await context.db
      .select({
        id: patient.id,
        medicalRecordNo: patient.medicalRecordNo,
        name: patient.name,
      })
      .from(patient)
      .where(
        and(
          eq(patient.organizationId, organizationId),
          canSeeAllPatients(viewer)
            ? undefined
            : eq(patient.createdBy, viewer.id)
        )
      )
      .orderBy(desc(patient.createdAt))
      .limit(200);
  }),

  get: organizationProcedure
    .input(patientId)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const [row] = await context.db
        .select()
        .from(patient)
        .where(
          and(
            eq(patient.id, input.id),
            eq(patient.organizationId, organizationId)
          )
        );

      if (!row || !canAccessPatient(viewer, row)) {
        throw new ORPCError("NOT_FOUND", { message: "患者不存在" });
      }

      const admissions = await context.db
        .select({
          admittedAt: admission.admittedAt,
          admissionNo: admission.admissionNo,
          assetCount: context.db.$count(
            asset,
            eq(asset.admissionId, admission.id)
          ),
          department: admission.department,
          diagnosis: admission.diagnosis,
          dischargedAt: admission.dischargedAt,
          id: admission.id,
          kind: admission.kind,
          tags: admission.tags,
        })
        .from(admission)
        .where(eq(admission.patientId, row.id))
        .orderBy(desc(admission.admittedAt));

      return { admissions, patient: row };
    }),

  create: organizationProcedure
    .input(patientInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const [created] = await context.db
        .insert(patient)
        .values({
          birthDate: input.birthDate ?? null,
          createdBy: viewer.id,
          gender: input.gender,
          idCardNo: emptyToNull(input.idCardNo),
          medicalRecordNo: emptyToNull(input.medicalRecordNo),
          name: input.name,
          notes: emptyToNull(input.notes),
          organizationId,
          phone: emptyToNull(input.phone),
          status: input.status,
          summary: emptyToNull(input.summary),
          tags: input.tags,
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "创建患者失败" });
      }

      return created;
    }),

  update: organizationProcedure
    .input(patientInput.partial().extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;
      const { id, ...values } = input;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const [existing] = await context.db
        .select({
          createdBy: patient.createdBy,
          organizationId: patient.organizationId,
        })
        .from(patient)
        .where(
          and(eq(patient.id, id), eq(patient.organizationId, organizationId))
        );

      if (!existing || !canAccessPatient(viewer, existing)) {
        throw new ORPCError("NOT_FOUND", { message: "患者不存在" });
      }

      const [updated] = await context.db
        .update(patient)
        .set({
          ...(values.birthDate === undefined
            ? {}
            : { birthDate: values.birthDate ?? null }),
          ...(values.gender === undefined ? {} : { gender: values.gender }),
          ...(values.idCardNo === undefined
            ? {}
            : { idCardNo: emptyToNull(values.idCardNo) }),
          ...(values.medicalRecordNo === undefined
            ? {}
            : { medicalRecordNo: emptyToNull(values.medicalRecordNo) }),
          ...(values.name === undefined ? {} : { name: values.name }),
          ...(values.notes === undefined
            ? {}
            : { notes: emptyToNull(values.notes) }),
          ...(values.phone === undefined
            ? {}
            : { phone: emptyToNull(values.phone) }),
          ...(values.status === undefined ? {} : { status: values.status }),
          ...(values.summary === undefined
            ? {}
            : { summary: emptyToNull(values.summary) }),
          ...(values.tags === undefined ? {} : { tags: values.tags }),
        })
        .where(
          and(eq(patient.id, id), eq(patient.organizationId, organizationId))
        )
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "患者不存在" });
      }

      return updated;
    }),

  /** 批量删除前的统计：就诊数 / 媒体数 / 占用体积。 */
  batchSummary: organizationProcedure
    .input(bulkIds)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const rows = await loadBulkPatients({
        db: context.db,
        ids: input.ids,
        organizationId,
        viewer,
      });

      const [admissions, assets] = await Promise.all([
        context.db
          .select({ patientId: admission.patientId, total: count() })
          .from(admission)
          .where(inArray(admission.patientId, input.ids))
          .groupBy(admission.patientId),
        context.db
          .select({
            bytes: sum(asset.byteSize),
            patientId: asset.patientId,
            total: count(),
          })
          .from(asset)
          .where(inArray(asset.patientId, input.ids))
          .groupBy(asset.patientId),
      ]);

      const admissionMap = new Map(
        admissions.map((row) => [row.patientId, Number(row.total)])
      );

      const assetMap = new Map(
        assets.map((row) => [
          row.patientId,
          { bytes: Number(row.bytes ?? 0), total: Number(row.total) },
        ])
      );

      const items = rows.map((row) => {
        const assetStats = assetMap.get(row.id) ?? { bytes: 0, total: 0 };

        return {
          admissionCount: admissionMap.get(row.id) ?? 0,
          assetBytes: assetStats.bytes,
          assetCount: assetStats.total,
          id: row.id,
          name: row.name,
        };
      });

      return {
        items,
        totals: {
          admissionCount: items.reduce(
            (total, item) => total + item.admissionCount,
            0
          ),
          assetBytes: items.reduce((total, item) => total + item.assetBytes, 0),
          assetCount: items.reduce((total, item) => total + item.assetCount, 0),
          patientCount: items.length,
        },
      };
    }),

  /** 批量修改状态（活跃 / 随访 / 归档）。 */
  bulkStatus: organizationProcedure
    .input(bulkIds.extend({ status: z.enum(patientStatus) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const rows = await loadBulkPatients({
        db: context.db,
        ids: input.ids,
        organizationId,
        viewer,
      });

      await context.db
        .update(patient)
        .set({ status: input.status })
        .where(
          and(
            eq(patient.organizationId, organizationId),
            inArray(patient.id, input.ids)
          )
        );

      await recordAudit(context.db, {
        action: "patient.bulk_status",
        actorId: viewer.id,
        detail: { count: rows.length, status: input.status },
        entityId: null,
        entityType: "patient",
        organizationId,
      });

      return { status: input.status, updated: rows.length };
    }),

  /**
   * 批量删除患者档案；`deleteFiles` 决定是否连存储里的媒体文件一起删。
   * 数据库行（患者/就诊/媒体记录）总会删除，级联由外键完成。
   */
  bulkDelete: organizationProcedure
    .input(bulkIds.extend({ deleteFiles: z.boolean().default(false) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const rows = await loadBulkPatients({
        db: context.db,
        ids: input.ids,
        organizationId,
        viewer,
      });

      const forbidden = rows.filter((row) => !canDelete(viewer, row.createdBy));

      if (forbidden.length > 0) {
        throw new ORPCError("FORBIDDEN", {
          message: "只有管理员或创建者可以删除患者档案",
        });
      }

      const assets = await context.db
        .select({
          archivedAt: asset.archivedAt,
          byteSize: asset.byteSize,
          storageKey: asset.storageKey,
          storageTargetId: asset.storageTargetId,
        })
        .from(asset)
        .where(inArray(asset.patientId, input.ids));

      let filesDeleted = 0;
      let filesFailed = 0;
      let bytesDeleted = 0;

      const { storage } = context;

      if (input.deleteFiles && assets.length > 0 && !storage) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "服务端未配置存储访问器",
        });
      }

      // 先删数据库行：即使后面文件删除失败，也只是留下孤儿文件，不会出现
      // 「记录还在、文件已被删」的坏状态。
      await context.db
        .delete(patient)
        .where(
          and(
            eq(patient.organizationId, organizationId),
            inArray(patient.id, input.ids)
          )
        );

      if (input.deleteFiles && assets.length > 0 && storage) {
        const targets = await context.db
          .select()
          .from(storageTarget)
          .where(
            inArray(storageTarget.id, [
              ...new Set(assets.map((row) => row.storageTargetId)),
            ])
          );

        const targetMap = new Map(targets.map((target) => [target.id, target]));

        for (const row of assets) {
          if (row.archivedAt) {
            // 已归档的源文件可能早已移出服务器。
            continue;
          }

          const target = targetMap.get(row.storageTargetId);

          if (!target) {
            filesFailed += 1;

            continue;
          }

          try {
            await storage
              .driverFor({ config: target.config, driver: target.driver })
              .delete(row.storageKey);
            filesDeleted += 1;
            bytesDeleted += row.byteSize;
          } catch {
            filesFailed += 1;
          }
        }
      }

      await recordAudit(context.db, {
        action: "patient.bulk_delete",
        actorId: viewer.id,
        detail: {
          count: rows.length,
          deleteFiles: input.deleteFiles,
          filesDeleted,
          filesFailed,
        },
        entityId: null,
        entityType: "patient",
        organizationId,
      });

      return {
        deleted: rows.length,
        files: {
          bytes: bytesDeleted,
          deleted: filesDeleted,
          failed: filesFailed,
        },
      };
    }),

  remove: organizationProcedure
    .input(patientId)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requireClinicalRights(viewer);

      const [existing] = await context.db
        .select({ createdBy: patient.createdBy })
        .from(patient)
        .where(
          and(
            eq(patient.id, input.id),
            eq(patient.organizationId, organizationId)
          )
        );

      if (!existing || !canAccessPatient(viewer, existing)) {
        throw new ORPCError("NOT_FOUND", { message: "患者不存在" });
      }

      if (!canDelete(viewer, existing.createdBy)) {
        throw new ORPCError("FORBIDDEN", {
          message: "只有管理员或创建者可以删除患者档案",
        });
      }

      await context.db.delete(patient).where(eq(patient.id, input.id));

      return { id: input.id };
    }),
};
