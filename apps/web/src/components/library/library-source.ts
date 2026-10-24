/** 资料库按来源分类：每个分类只展示自己来源的素材。 */
export const LIBRARY_SOURCES = [
  { label: "全部素材", value: "all" },
  { label: "患者记录", value: "patients" },
  { label: "会议资料", value: "sessions" },
  { label: "资料库目录", value: "collections" },
  { label: "教学附件", value: "posts" },
] as const;

export type LibrarySource = (typeof LIBRARY_SOURCES)[number]["value"];

export const isLibrarySource = (value: string): value is LibrarySource =>
  LIBRARY_SOURCES.some((source) => source.value === value);

/** 「资料库目录」是文件夹浏览的主场景，其余分类都是平铺列表。 */
export const DEFAULT_LIBRARY_SOURCE: LibrarySource = "collections";

export const LIBRARY_KIND_FILTERS = [
  { label: "全部", value: "all" },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "文档", value: "document" },
  { label: "压缩包", value: "archive" },
  { label: "其它", value: "other" },
] as const;

export type LibraryKindFilter = (typeof LIBRARY_KIND_FILTERS)[number]["value"];

export const LIBRARY_SORT_OPTIONS = [
  { label: "最近上传", value: "recent" },
  { label: "拍摄时间", value: "timeline" },
  { label: "文件名", value: "name" },
] as const;

export type LibrarySort = (typeof LIBRARY_SORT_OPTIONS)[number]["value"];

/** 只有患者来源的素材才有诊疗分期。 */
export const LIBRARY_STAGE_OPTIONS = [
  { label: "全部分期", value: "all" },
  { label: "术前", value: "preop" },
  { label: "术中", value: "intraop" },
  { label: "术后", value: "postop" },
  { label: "随访", value: "follow_up" },
  { label: "影像", value: "imaging" },
  { label: "病理", value: "pathology" },
  { label: "其它", value: "other" },
] as const;

export type LibraryStageFilter =
  (typeof LIBRARY_STAGE_OPTIONS)[number]["value"];

export type LibraryViewMode = "grid" | "list";

export const sourceLabel = (source: LibrarySource) =>
  LIBRARY_SOURCES.find((item) => item.value === source)?.label ?? "全部素材";
