import { decryptConfig } from "#src/crypto.ts";
import { LocalStorage } from "#src/local.ts";
import { S3Storage } from "#src/s3.ts";
import type {
  LocalStorageConfig,
  S3StorageConfig,
  StorageConfig,
  StorageDriver,
  StorageDriverKind,
} from "#src/types.ts";

export { decryptConfig, encryptConfig } from "#src/crypto.ts";

export { LocalStorage } from "#src/local.ts";

export { S3Storage } from "#src/s3.ts";

export type {
  ByteRange,
  LocalStorageConfig,
  S3StorageConfig,
  StorageConfig,
  StorageDriver,
  StorageDriverKind,
} from "#src/types.ts";

export interface StorageTargetLike {
  driver: StorageDriverKind;
  /** 加密后的配置。 */
  config: string;
}

/** 把一行 storage_target 解成可用的驱动实例。 */
export const createStorageDriver = (
  target: StorageTargetLike,
  secret: string
): StorageDriver => {
  const config = decryptConfig<StorageConfig>(target.config, secret);

  return target.driver === "s3"
    ? new S3Storage(config as S3StorageConfig)
    : new LocalStorage(config as LocalStorageConfig, target.driver);
};

const MIME_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/zip": "zip",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/**
 * 生成存储键：按科室与年月分目录，文件名用随机 id，
 * 原始文件名只留在数据库里，避免路径注入和中文名兼容问题。
 */
export const buildStorageKey = (
  organizationId: string,
  mimeType: string,
  originalName: string,
  now = new Date()
) => {
  const extension =
    MIME_EXTENSION[mimeType] ??
    originalName.split(".").pop()?.toLowerCase()?.slice(0, 8) ??
    "bin";

  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return `${organizationId}/${month}/${crypto.randomUUID()}.${extension}`;
};

/** 根据 MIME 与扩展名推断素材类型。 */
export const detectAssetKind = (
  mimeType: string,
  originalName: string
): "image" | "video" | "audio" | "document" | "archive" | "other" => {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("officedocument")
  ) {
    return "document";
  }

  const extension = originalName.split(".").pop()?.toLowerCase();

  if (extension && ["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
    return "archive";
  }

  return "other";
};
