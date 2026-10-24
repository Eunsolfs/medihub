import type { DateInput } from "#src/lib/format.ts";
import type { UploadTarget } from "#src/lib/upload.ts";

/**
 * media-kit 对素材的最小结构要求：结构上兼容 `api.assets.list().items[number]`，
 * 所有字段除 id / originalName 外都可缺省，方便统计接口的轻量对象也直接复用。
 */
export interface MediaAsset {
  id: string;
  originalName: string;
  kind?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  createdAt?: DateInput;
  capturedAt?: DateInput;
  stage?: string | null;
  visibility?: string | null;
  tags?: string[] | null;
  description?: string | null;
  bodyPart?: string | null;
  admissionId?: string | null;
  patientId?: string | null;
  collectionId?: string | null;
  sessionId?: string | null;
  postId?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  /** 资料库列表会带上归属患者/学习会议标题，供 caption 插槽使用。 */
  patientName?: string | null;
  sessionTitle?: string | null;
  timelineOrder?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

/** 缩略图只需要这几项，工作台「最近上传」的统计对象可以直接传。 */
export type ThumbAsset = Pick<MediaAsset, "id" | "originalName"> &
  Partial<
    Pick<MediaAsset, "kind" | "mimeType" | "capturedAt" | "createdAt" | "stage">
  >;

export interface AssetSelection {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export const assetFileUrl = (id: string) => `/api/files/${id}`;

export const assetDownloadUrl = (id: string) => `/api/files/${id}/download`;

export const extensionOf = (name: string) => {
  const index = name.lastIndexOf(".");

  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
};

export const extensionLabel = (name: string) => {
  const extension = extensionOf(name);

  return extension ? extension.toUpperCase() : "文件";
};

const extensionMime = {
  avif: "image/avif",
  bmp: "image/bmp",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  heic: "image/heic",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  md: "text/markdown",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  svg: "image/svg+xml",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
} as const;

type ExtensionWithMime = keyof typeof extensionMime;

const mimeForExtension = (extension: string) =>
  extension in extensionMime
    ? extensionMime[extension as ExtensionWithMime]
    : undefined;

/** mimeType 缺失时（例如统计接口）按扩展名兜底，避免所有缩略图都退化成问号图标。 */
export const mimeOf = (asset: ThumbAsset) =>
  asset.mimeType?.trim() ||
  mimeForExtension(extensionOf(asset.originalName)) ||
  "";

const hasExtension = (asset: ThumbAsset, extensions: string[]) =>
  extensions.includes(extensionOf(asset.originalName));

export const isImageAsset = (asset: ThumbAsset) =>
  asset.kind === "image" ||
  mimeOf(asset).startsWith("image/") ||
  hasExtension(asset, [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "avif",
    "heic",
    "svg",
  ]);

export const isVideoAsset = (asset: ThumbAsset) =>
  asset.kind === "video" ||
  mimeOf(asset).startsWith("video/") ||
  hasExtension(asset, ["mp4", "mov", "webm", "mkv", "avi", "m4v"]);

export const isAudioAsset = (asset: ThumbAsset) =>
  asset.kind === "audio" ||
  mimeOf(asset).startsWith("audio/") ||
  hasExtension(asset, ["mp3", "wav", "m4a", "aac", "ogg", "flac"]);

export const isArchiveAsset = (asset: ThumbAsset) =>
  asset.kind === "archive" ||
  hasExtension(asset, ["zip", "rar", "7z", "tar", "gz", "bz2"]);

export const isPdfAsset = (asset: ThumbAsset) =>
  mimeOf(asset) === "application/pdf" || hasExtension(asset, ["pdf"]);

export const isSpreadsheetAsset = (asset: ThumbAsset) => {
  const mime = mimeOf(asset);

  return (
    mime.includes("spreadsheet") ||
    mime.includes("ms-excel") ||
    mime === "text/csv" ||
    hasExtension(asset, ["xlsx", "xlsm", "xls", "csv", "ods"])
  );
};

export const isWordAsset = (asset: ThumbAsset) => {
  const mime = mimeOf(asset);

  return (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    hasExtension(asset, ["docx", "doc", "odt"])
  );
};

export const isPresentationAsset = (asset: ThumbAsset) => {
  const mime = mimeOf(asset);

  return (
    mime.includes("presentationml") ||
    mime.includes("ms-powerpoint") ||
    hasExtension(asset, ["pptx", "ppt", "odp"])
  );
};

/** OnlyOffice 能接管的文档类型；未配置服务端时只影响「在线编辑」按钮，不影响本地预览。 */
export const isOfficeAsset = (asset: ThumbAsset) =>
  isWordAsset(asset) || isSpreadsheetAsset(asset) || isPresentationAsset(asset);

export const isMarkdownAsset = (asset: ThumbAsset) => {
  const mime = mimeOf(asset);

  return mime.includes("markdown") || hasExtension(asset, ["md", "markdown"]);
};

export const isTextAsset = (asset: ThumbAsset) => {
  const mime = mimeOf(asset);

  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    hasExtension(asset, [
      "txt",
      "md",
      "markdown",
      "json",
      "csv",
      "log",
      "xml",
      "yml",
      "yaml",
      "html",
      "htm",
      "css",
      "js",
      "ts",
      "tsx",
      "sql",
    ])
  );
};

/** 从素材继承的归属信息：xlsx 另存新版本时沿用它的患者/就诊/分期/可见性。 */
export const uploadTargetFromAsset = (asset: MediaAsset): UploadTarget => {
  const capturedAt =
    asset.capturedAt instanceof Date || typeof asset.capturedAt === "string"
      ? asset.capturedAt
      : undefined;

  return {
    admissionId: asset.admissionId ?? undefined,
    capturedAt,
    collectionId: asset.collectionId ?? undefined,
    patientId: asset.patientId ?? undefined,
    postId: asset.postId ?? undefined,
    sessionId: asset.sessionId ?? undefined,
    stage: asset.stage ?? undefined,
    visibility: asset.visibility === "private" ? "private" : "org",
  };
};
