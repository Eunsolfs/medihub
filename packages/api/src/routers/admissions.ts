import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import { admission, admissionKind, patient } from "@medihub/db/schema/patients";

import { canDelete, organizationIdOf } from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";

const admissionInput = z.object({
  admittedAt: z.coerce.date(),
  admissionNo: z.string().trim().max(40).nullish(),
  attendingDoctor: z.string().trim().max(60).nullish(),
  chiefComplaint: z.string().max(2000).nullish(),
  department: z.string().trim().max(60).nullish(),
  diagnosis: z.string().max(2000).nullish(),
  dischargedAt: z.coerce.date().nullish(),
  kind: z.enum(admissionKind).default("inpatient"),
  notes: z.string().max(4000).nullish(),
  patientId: z.string().min(1),
  tags: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  treatment: z.string().max(2000).nullish(),
  summary: z.string().max(20_000).nullish(),
});

const admissionId = z.object({ id: z.string().min(1) });

const emptyToNull = (value: string | null | undefined) => value?.trim() || null;

const requirePatient = async (
  context: { db: Database },
  organizationId: string,
  patientId: string
) => {
  const [row] = await context.db
    .select({ id: patient.id })
    .from(patient)
    .where(
      and(eq(patient.id, patientId), eq(patient.organizationId, organizationId))
    );

  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "患者不存在" });
  }

  return row;
};

export const admissionsRouter = {
  listByPatient: organizationProcedure
    .input(z.object({ patientId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      return await context.db
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
        .where(
          and(
            eq(admission.patientId, input.patientId),
            eq(admission.organizationId, organizationId)
          )
        )
        .orderBy(desc(admission.admittedAt));
    }),

  get: organizationProcedure
    .input(admissionId)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      const [row] = await context.db
        .select()
        .from(admission)
        .where(
          and(
            eq(admission.id, input.id),
            eq(admission.organizationId, organizationId)
          )
        );

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "就诊记录不存在" });
      }

      const [patientRow] = await context.db
        .select()
        .from(patient)
        .where(eq(patient.id, row.patientId));

      const assets = await context.db
        .select()
        .from(asset)
        .where(and(eq(asset.admissionId, row.id), eq(asset.visibility, "org")))
        .orderBy(asc(asset.timelineOrder), asc(asset.capturedAt));

      return { admission: row, assets, patient: patientRow ?? null };
    }),

  create: organizationProcedure
    .input(admissionInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      await requirePatient(context, organizationId, input.patientId);

      const [created] = await context.db
        .insert(admission)
        .values({
          admittedAt: input.admittedAt,
          admissionNo: emptyToNull(input.admissionNo),
          attendingDoctor: emptyToNull(input.attendingDoctor),
          chiefComplaint: emptyToNull(input.chiefComplaint),
          createdBy: viewer.id,
          department: emptyToNull(input.department),
          diagnosis: emptyToNull(input.diagnosis),
          dischargedAt: input.dischargedAt ?? null,
          kind: input.kind,
          notes: emptyToNull(input.notes),
          organizationId,
          patientId: input.patientId,
          tags: input.tags,
          treatment: emptyToNull(input.treatment),
          summary: emptyToNull(input.summary),
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "创建就诊记录失败" });
      }

      return created;
    }),

  update: organizationProcedure
    .input(
      admissionInput
        .omit({ patientId: true })
        .partial()
        .extend({ id: z.string().min(1) })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { id, ...values } = input;

      const [updated] = await context.db
        .update(admission)
        .set({
          ...(values.admittedAt === undefined
            ? {}
            : { admittedAt: values.admittedAt }),
          ...(values.admissionNo === undefined
            ? {}
            : { admissionNo: emptyToNull(values.admissionNo) }),
          ...(values.attendingDoctor === undefined
            ? {}
            : { attendingDoctor: emptyToNull(values.attendingDoctor) }),
          ...(values.chiefComplaint === undefined
            ? {}
            : { chiefComplaint: emptyToNull(values.chiefComplaint) }),
          ...(values.department === undefined
            ? {}
            : { department: emptyToNull(values.department) }),
          ...(values.diagnosis === undefined
            ? {}
            : { diagnosis: emptyToNull(values.diagnosis) }),
          ...(values.dischargedAt === undefined
            ? {}
            : { dischargedAt: values.dischargedAt ?? null }),
          ...(values.kind === undefined ? {} : { kind: values.kind }),
          ...(values.notes === undefined
            ? {}
            : { notes: emptyToNull(values.notes) }),
          ...(values.tags === undefined ? {} : { tags: values.tags }),
          ...(values.treatment === undefined
            ? {}
            : { treatment: emptyToNull(values.treatment) }),
          ...(values.summary === undefined
            ? {}
            : { summary: emptyToNull(values.summary) }),
        })
        .where(
          and(
            eq(admission.id, id),
            eq(admission.organizationId, organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "就诊记录不存在" });
      }

      return updated;
    }),

  remove: organizationProcedure
    .input(admissionId)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ createdBy: admission.createdBy })
        .from(admission)
        .where(
          and(
            eq(admission.id, input.id),
            eq(admission.organizationId, organizationId)
          )
        );

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "就诊记录不存在" });
      }

      if (!canDelete(viewer, existing.createdBy)) {
        throw new ORPCError("FORBIDDEN", {
          message: "只有管理员或创建者可以删除就诊记录",
        });
      }

      await context.db.delete(admission).where(eq(admission.id, input.id));

      return { id: input.id };
    }),
};
