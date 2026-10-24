/** 学习会议的可见范围：与教学帖共用一套 shareVisibility 口径。 */
export const SESSION_VISIBILITY_OPTIONS = [
  { label: "仅自己", value: "private" },
  { label: "本科室", value: "org" },
  { label: "全系统登录用户", value: "logged_in" },
  { label: "指定对象", value: "selected" },
  { label: "任何人", value: "public" },
] as const;

export type SessionVisibility =
  (typeof SESSION_VISIBILITY_OPTIONS)[number]["value"];

export const isSessionVisibility = (
  value: string
): value is SessionVisibility =>
  SESSION_VISIBILITY_OPTIONS.some((option) => option.value === value);

const MEMBER_VISIBILITIES: readonly SessionVisibility[] = [
  "private",
  "org",
  "public",
];

const ADMIN_VISIBILITIES: readonly SessionVisibility[] = [
  "private",
  "org",
  "logged_in",
  "selected",
  "public",
];

/**
 * 可见范围的可选档位（与后端 assertShareScope 一致）：
 * 成员只能自己/本科室/任何人；科室管理员追加「全系统登录用户」与「指定对象」。
 */
export const visibilityOptionsFor = (role: string | undefined) => {
  const allowed =
    role === "dept_admin" || role === "root"
      ? ADMIN_VISIBILITIES
      : MEMBER_VISIBILITIES;

  return SESSION_VISIBILITY_OPTIONS.filter((option) =>
    allowed.includes(option.value)
  );
};

const VISIBILITY_LABELS: Record<string, string> = {
  logged_in: "全系统登录用户",
  org: "本科室",
  private: "仅自己",
  public: "任何人",
  selected: "指定对象",
};

export const sessionVisibilityLabel = (value: string | null | undefined) =>
  (value && VISIBILITY_LABELS[value]) || "未设置";
