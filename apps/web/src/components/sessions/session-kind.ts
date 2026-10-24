/** 学习会议的四种形态；`other` 兜底，避免后端新增枚举时页面空白。 */
export const LEARNING_KIND_OPTIONS = [
  { label: "讲课", value: "lecture" },
  { label: "会议", value: "meeting" },
  { label: "培训", value: "training" },
  { label: "病例讨论", value: "case_review" },
  { label: "其它", value: "other" },
] as const;

export type LearningKind = (typeof LEARNING_KIND_OPTIONS)[number]["value"];

export const isLearningKind = (value: string): value is LearningKind =>
  LEARNING_KIND_OPTIONS.some((option) => option.value === value);

const KIND_LABELS = {
  case_review: "病例讨论",
  lecture: "讲课",
  meeting: "会议",
  other: "其它",
  training: "培训",
} satisfies Record<string, string>;

type KindLabelKey = keyof typeof KIND_LABELS;

const isKindLabelKey = (value: string): value is KindLabelKey =>
  value in KIND_LABELS;

export const learningKindLabel = (kind: string | null | undefined) =>
  (kind && isKindLabelKey(kind) && KIND_LABELS[kind]) || "其它";

const KIND_TONES = {
  case_review: "bg-info/10 text-info",
  lecture: "bg-primary/10 text-primary",
  meeting: "bg-warning/10 text-warning",
  other: "bg-muted text-muted-foreground",
  training: "bg-success/10 text-success",
} satisfies Record<string, string>;

type KindToneKey = keyof typeof KIND_TONES;

const DEFAULT_KIND_TONE = "bg-muted text-muted-foreground";

const isKindToneKey = (value: string): value is KindToneKey =>
  value in KIND_TONES;

export const learningKindTone = (kind: string | null | undefined) =>
  (kind && isKindToneKey(kind) && KIND_TONES[kind]) || DEFAULT_KIND_TONE;

/** 供 `<input type="datetime-local">` 使用的本地时间串。 */
export const toDateTimeInput = (value: Date | string | null | undefined) => {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
};

export const parseTags = (value: string) =>
  value
    .split(/[,，、\s]+/u)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, 20);
