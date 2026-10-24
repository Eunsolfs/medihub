import type {
  AdmissionKind,
  AssetKind,
  ClinicalStage,
  PatientGender,
  PatientStatus,
} from "#src/components/patients/types.ts";
import {
  admissionKindLabels,
  patientStatusLabels,
  stageLabels,
} from "#src/lib/format.ts";
import type { DateInput } from "#src/lib/format.ts";

export interface SelectOption<TValue extends string> {
  label: string;
  value: TValue;
}

export const genderLabels: Record<PatientGender, string> = {
  female: "女",
  male: "男",
  other: "其它",
  unknown: "未填写",
};

export const genderLabel = (value: PatientGender | null | undefined) =>
  value ? genderLabels[value] : "未填写";

export const genderOptions: readonly SelectOption<PatientGender>[] = [
  { label: "男", value: "male" },
  { label: "女", value: "female" },
  { label: "其它", value: "other" },
  { label: "未填写", value: "unknown" },
];

export const patientStatusOptions: readonly SelectOption<PatientStatus>[] = [
  { label: patientStatusLabels.active, value: "active" },
  { label: patientStatusLabels.follow_up, value: "follow_up" },
  { label: patientStatusLabels.archived, value: "archived" },
];

export const admissionKindOptions: readonly SelectOption<AdmissionKind>[] = [
  { label: admissionKindLabels.inpatient, value: "inpatient" },
  { label: admissionKindLabels.outpatient, value: "outpatient" },
  { label: admissionKindLabels.surgery, value: "surgery" },
  { label: admissionKindLabels.follow_up, value: "follow_up" },
  { label: admissionKindLabels.other, value: "other" },
];

/** 临床分期按诊疗流程排序，而不是按字母序。 */
export const stageOptions: readonly SelectOption<ClinicalStage>[] = [
  { label: stageLabels.preop, value: "preop" },
  { label: stageLabels.intraop, value: "intraop" },
  { label: stageLabels.postop, value: "postop" },
  { label: stageLabels.follow_up, value: "follow_up" },
  { label: stageLabels.imaging, value: "imaging" },
  { label: stageLabels.pathology, value: "pathology" },
  { label: stageLabels.other, value: "other" },
];

export const assetKindLabels: Record<AssetKind, string> = {
  archive: "压缩包",
  audio: "音频",
  document: "文档",
  image: "图片",
  other: "其它",
  video: "视频",
};

export const assetKindOptions: readonly SelectOption<AssetKind>[] = [
  { label: assetKindLabels.image, value: "image" },
  { label: assetKindLabels.video, value: "video" },
  { label: assetKindLabels.document, value: "document" },
  { label: assetKindLabels.audio, value: "audio" },
  { label: assetKindLabels.archive, value: "archive" },
  { label: assetKindLabels.other, value: "other" },
];

export const pageSize = 20;

/** 表单提交前的统一清洗：空白字符串视为未填写。 */
export const trimmedOrNull = (value: string) => value.trim() || null;

/** 由出生日期推算周岁；返回 null 表示日期缺失或明显异常。 */
export const ageFromBirthDate = (value: DateInput) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const birthDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();

  const beforeBirthday =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() < birthDate.getDate());

  if (beforeBirthday) {
    age -= 1;
  }

  return age >= 0 && age <= 130 ? age : null;
};

/** 患者的一行摘要：男 · 42 岁 / 未填写出生日期。 */
export const describePatient = (
  gender: PatientGender | null | undefined,
  birthDate: DateInput
) => {
  const age = ageFromBirthDate(birthDate);

  return age === null
    ? genderLabel(gender)
    : `${genderLabel(gender)} · ${age} 岁`;
};

/** 身份证号只保留后四位；未填写时显示占位符。 */
export const maskIdCard = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "未填写";
  }

  if (trimmed.length <= 4) {
    return `••••${trimmed}`;
  }

  return `${"•".repeat(12)}${trimmed.slice(-4)}`;
};
