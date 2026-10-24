import type { AppRouterClient } from "@medihub/api";

/**
 * 导出任务类型直接取自后端路由的返回类型，避免前后端各写一份字段表。
 * 修改 `packages/api` 里的 exports 路由后，这里会自动跟上。
 */
export type ExportJob = Awaited<
  ReturnType<AppRouterClient["exports"]["list"]>
>["items"][number];

export type ExportKind = ExportJob["kind"];

export type ExportStatus = ExportJob["status"];

export const exportDownloadUrl = (id: string) => `/api/exports/${id}/download`;

const KIND_LABELS: Record<ExportKind, string> = {
  admission: "按就诊导出",
  patient: "按患者导出",
  post: "按文章导出",
  selection: "手动选择素材",
  session: "按会议导出",
};

export const exportKindLabel = (kind: ExportKind) => KIND_LABELS[kind];

const STATUS_LABELS: Record<ExportStatus, string> = {
  failed: "失败",
  pending: "排队中",
  ready: "已完成",
  running: "打包中",
};

export const exportStatusLabel = (status: ExportStatus) =>
  STATUS_LABELS[status];

/** 只有 pending / running 需要前端轮询；ready 与 failed 是终态。 */
export const isActiveExport = (status: ExportStatus) =>
  status === "pending" || status === "running";
