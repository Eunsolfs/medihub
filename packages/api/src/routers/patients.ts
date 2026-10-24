import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import { asset } from "@medihub/db/schema/content";
import {
  admission,
  patient,
  patientGender,
  patientStatus,
} from "@medihub/db/schema/patients";

import {
  canAccessPatient,
  canDelete,
  canSeeAllPatients,
  organizationIdOf,
  requireClinicalRights,
} from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";

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
