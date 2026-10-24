/** 展示层的格式化工具：全站统一，避免各页面各写一套。 */

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const relativeFormatter = new Intl.RelativeTimeFormat("zh-CN", {
  numeric: "auto",
});

export type DateInput = Date | string | number | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDate = (value: DateInput) => {
  const date = toDate(value);

  return date ? dateFormatter.format(date) : "—";
};

export const formatDateTime = (value: DateInput) => {
  const date = toDate(value);

  return date ? dateTimeFormatter.format(date) : "—";
};

export const formatRelative = (value: DateInput) => {
  const date = toDate(value);

  if (!date) {
    return "—";
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) {
      return relativeFormatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return "刚刚";
};

export const formatBytes = (value: number | null | undefined) => {
  if (!value || value < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
};

/** 中文姓名首字，用于头像占位。 */
export const initials = (name: string | null | undefined) =>
  name?.trim().slice(0, 2) || "?";

export const stageLabels = {
  follow_up: "随访",
  imaging: "影像",
  intraop: "术中",
  other: "其它",
  pathology: "病理",
  postop: "术后",
  preop: "术前",
} as const;

export type StageKey = keyof typeof stageLabels;

export const stageLabel = (value: string | null | undefined) =>
  value && value in stageLabels ? stageLabels[value as StageKey] : "未分期";

export const visibilityLabels = {
  logged_in: "仅登录用户",
  org: "仅科室内部",
  private: "仅自己",
  public: "任何人",
  selected: "指定对象",
} as const;

export type VisibilityKey = keyof typeof visibilityLabels;

export const visibilityLabel = (value: string | null | undefined) =>
  value && value in visibilityLabels
    ? visibilityLabels[value as VisibilityKey]
    : "未设置";

export const roleLabels = {
  dept_admin: "科室管理员",
  individual: "个人用户",
  member: "科室成员",
  root: "超级管理员",
} as const;

export type RoleKey = keyof typeof roleLabels;

export const roleLabel = (value: string | null | undefined) =>
  value && value in roleLabels ? roleLabels[value as RoleKey] : "未设置";

export const patientStatusLabels = {
  active: "在诊",
  archived: "已归档",
  follow_up: "随访中",
} as const;

export const patientStatusLabel = (value: string | null | undefined) =>
  value && value in patientStatusLabels
    ? patientStatusLabels[value as keyof typeof patientStatusLabels]
    : "—";

export const admissionKindLabels = {
  follow_up: "随访",
  inpatient: "住院",
  other: "其它",
  outpatient: "门诊",
  surgery: "手术",
} as const;

export const admissionKindLabel = (value: string | null | undefined) =>
  value && value in admissionKindLabels
    ? admissionKindLabels[value as keyof typeof admissionKindLabels]
    : "—";
