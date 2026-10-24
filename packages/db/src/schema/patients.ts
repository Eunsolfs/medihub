import { sql } from "drizzle-orm";
import { check, index, snakeCase, text } from "drizzle-orm/sqlite-core";

import { user } from "#src/schema/auth.ts";
import {
  now,
  primaryId,
  tagsColumn,
  timestamp,
  timestamps,
} from "#src/schema/common.ts";
import { organization } from "#src/schema/organization.ts";

export const patientGender = ["male", "female", "other", "unknown"] as const;
export const patientStatus = ["active", "follow_up", "archived"] as const;

export const patient = snakeCase.table(
  "patient",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text().notNull(),
    gender: text({ enum: patientGender }).notNull().default("unknown"),
    birthDate: timestamp(),
    /** 病案号 / 住院号，科室内唯一。 */
    medicalRecordNo: text(),
    /** 身份证号属于敏感信息，仅在详情页对有权限的角色展示。 */
    idCardNo: text(),
    phone: text(),
    /** 主诉 / 主要诊断，用于列表快速识别。 */
    summary: text(),
    notes: text(),
    tags: tagsColumn(),
    status: text({ enum: patientStatus }).notNull().default("active"),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("patient_organization_idx").on(table.organizationId),
    index("patient_organization_name_idx").on(table.organizationId, table.name),
    index("patient_medical_record_no_idx").on(
      table.organizationId,
      table.medicalRecordNo
    ),
    check(
      "patient_name_length",
      sql`length(trim(${table.name})) between 1 and 80`
    ),
  ]
);

export const admissionKind = [
  "inpatient",
  "outpatient",
  "surgery",
  "follow_up",
  "other",
] as const;

/**
 * 一次就诊 / 入院。照片、文档都挂在某次入院下，构成该次治疗的时间线。
 */
export const admission = snakeCase.table(
  "admission",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    patientId: text()
      .notNull()
      .references(() => patient.id, { onDelete: "cascade" }),
    kind: text({ enum: admissionKind }).notNull().default("inpatient"),
    /** 住院号 / 门诊号。 */
    admissionNo: text(),
    admittedAt: timestamp().notNull().default(now),
    dischargedAt: timestamp(),
    department: text(),
    attendingDoctor: text(),
    diagnosis: text(),
    chiefComplaint: text(),
    treatment: text(),
    notes: text(),
    tags: tagsColumn(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("admission_patient_idx").on(table.patientId, table.admittedAt),
    index("admission_organization_idx").on(
      table.organizationId,
      table.admittedAt
    ),
    check(
      "admission_discharge_order",
      sql`${table.dischargedAt} is null or ${table.dischargedAt} >= ${table.admittedAt}`
    ),
  ]
);

export type Patient = typeof patient.$inferSelect;

export type Admission = typeof admission.$inferSelect;

export type AdmissionKind = (typeof admissionKind)[number];

export type PatientGender = (typeof patientGender)[number];

export type PatientStatus = (typeof patientStatus)[number];
