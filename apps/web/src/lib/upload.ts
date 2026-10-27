/**
 * 媒体上传：`/api/files/upload` 走原始 body + x-file-name 头（不是 multipart），
 * 用 XHR 换取上传进度。所有调用方（上传按钮、拖拽区、表格另存新版本）都从这里走。
 */
import { withBusyTask } from "#src/lib/activity.ts";
import { scopeHeaders } from "#src/lib/org-scope-storage.ts";

export interface UploadTarget {
  patientId?: string;
  admissionId?: string;
  collectionId?: string;
  sessionId?: string;
  postId?: string;
  stage?: string;
  visibility?: "org" | "private";
  capturedAt?: Date | string;
  targetId?: string;
}

export interface UploadedAsset {
  id: string;
  kind: string;
  mimeType: string;
  originalName: string;
  byteSize: number;
  url: string;
  stage: string | null;
  visibility: string;
  capturedAt: string | null;
  admissionId: string | null;
  /** 覆盖原素材后回传的新尺寸；普通上传不填。 */
  width?: number | null;
  height?: number | null;
}

/** 覆盖原素材接口的返回：不产生新记录，id 保持不变。 */
export interface ReplacedAsset {
  id: string;
  url: string;
  byteSize: number;
  mimeType: string;
  originalName: string;
  kind: string;
}

export interface ReplaceFileOptions {
  /** 编辑导出后的像素尺寸，便于服务端同步宽高。 */
  width?: number;
  height?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

const UPLOAD_ENDPOINT = "/api/files/upload";

const targetQuery = (target: UploadTarget) => {
  const params = new URLSearchParams();

  const add = (key: string, value: string | undefined) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, value);
    }
  };

  add("patientId", target.patientId);
  add("admissionId", target.admissionId);
  add("collectionId", target.collectionId);
  add("sessionId", target.sessionId);
  add("postId", target.postId);
  add("stage", target.stage);
  add("visibility", target.visibility);
  add("targetId", target.targetId);

  if (target.capturedAt instanceof Date) {
    add("capturedAt", target.capturedAt.toISOString());
  } else {
    add("capturedAt", target.capturedAt);
  }

  const query = params.toString();

  return query ? `?${query}` : "";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** 服务端返回的字段逐个校验，格式不对时当作上传失败而不是把脏数据塞给页面。 */
const parseUploadedAsset = (value: unknown): UploadedAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const {
    admissionId,
    byteSize,
    capturedAt,
    id,
    kind,
    mimeType,
    originalName,
    stage,
    url,
    visibility,
  } = value;

  if (
    typeof id !== "string" ||
    typeof kind !== "string" ||
    typeof mimeType !== "string" ||
    typeof originalName !== "string" ||
    typeof url !== "string" ||
    typeof visibility !== "string" ||
    typeof byteSize !== "number"
  ) {
    return null;
  }

  return {
    admissionId: typeof admissionId === "string" ? admissionId : null,
    byteSize,
    capturedAt: typeof capturedAt === "string" ? capturedAt : null,
    id,
    kind,
    mimeType,
    originalName,
    stage: typeof stage === "string" ? stage : null,
    url,
    visibility,
  };
};

/** 非 JSON 响应时把正文压成一行，附在提示后方便定位是代理/网关还是服务端拒绝。 */
const responseSnippet = (body: string) =>
  body.replaceAll(/\s+/gu, " ").trim().slice(0, 120);

const messageWithStatus = (message: string, status: number, body: string) => {
  const snippet = responseSnippet(body);

  return snippet
    ? `${message}（HTTP ${status}）：${snippet}`
    : `${message}（HTTP ${status}）`;
};

const messageOf = (status: number, body: string) => {
  try {
    const parsed: unknown = JSON.parse(body);

    if (isRecord(parsed) && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // 非 JSON 响应：保留状态码与正文片段，避免把真实原因误读成权限问题。
  }

  if (status === 401) {
    return messageWithStatus("登录已过期，请重新登录后再操作", status, body);
  }

  if (status === 403) {
    return messageWithStatus("没有上传权限", status, body);
  }

  if (status === 413) {
    return messageWithStatus("文件超过服务器允许的上传大小", status, body);
  }

  if (status === 507) {
    return messageWithStatus("服务器存储空间不足", status, body);
  }

  if (status >= 500) {
    return messageWithStatus("服务器保存文件失败，请稍后重试", status, body);
  }

  return messageWithStatus("上传失败", status, body);
};

const abortError = () => {
  const error = new Error("已取消上传");
  error.name = "AbortError";

  return error;
};

const uploadFileImpl = async (
  file: File,
  target: UploadTarget,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<UploadedAsset> =>
  await new Promise<UploadedAsset>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());

      return;
    }

    const xhr = new XMLHttpRequest();

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
    };

    function handleAbort() {
      xhr.abort();
    }

    xhr.open("POST", `${UPLOAD_ENDPOINT}${targetQuery(target)}`);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream"
    );

    // root 切换科室后，上传也要落到当前科室；空作用域不发头，避免服务端收到空值。
    for (const [key, value] of Object.entries(scopeHeaders())) {
      if (value.trim()) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) {
        onProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100))
        );
      }
    });

    xhr.addEventListener("load", () => {
      cleanup();

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(messageOf(xhr.status, xhr.responseText)));

        return;
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("服务器返回格式异常，无法确认上传结果"));

        return;
      }

      const uploaded = parseUploadedAsset(parsed);

      if (!uploaded) {
        reject(new Error("服务器返回格式异常，无法确认上传结果"));

        return;
      }

      onProgress?.(100);
      resolve(uploaded);
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("网络异常，上传失败，请检查网络后重试"));
    });

    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new Error("上传超时，请稍后重试"));
    });

    xhr.addEventListener("abort", () => {
      cleanup();
      reject(abortError());
    });

    signal?.addEventListener("abort", handleAbort, { once: true });
    xhr.send(file);
  });

const parseReplacedAsset = (value: unknown): ReplacedAsset | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { id, url, byteSize, mimeType, originalName, kind } = value;

  if (
    typeof id !== "string" ||
    typeof url !== "string" ||
    typeof byteSize !== "number" ||
    typeof mimeType !== "string" ||
    typeof originalName !== "string" ||
    typeof kind !== "string"
  ) {
    return null;
  }

  return { byteSize, id, kind, mimeType, originalName, url };
};

/**
 * 覆盖已有图片素材：POST 原始 body 到 `/api/files/:id/replace`。
 * 归属（患者/就诊/分期）沿用原素材，不产生新记录。
 */
const replaceFileImpl = async (
  file: File,
  assetId: string,
  options: ReplaceFileOptions = {}
): Promise<ReplacedAsset> =>
  await new Promise<ReplacedAsset>((resolve, reject) => {
    const { height, onProgress, signal, width } = options;

    if (signal?.aborted) {
      reject(abortError());

      return;
    }

    const xhr = new XMLHttpRequest();

    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
    };

    function handleAbort() {
      xhr.abort();
    }

    xhr.open("POST", `/api/files/${encodeURIComponent(assetId)}/replace`);
    // 同源请求的 XHR 默认就会带上会话 cookie（withCredentials 只影响跨域），
    // 这里不设置 withCredentials，避免开发环境经 Vite 代理时产生额外的 CORS 语义。
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream"
    );

    if (typeof width === "number" && width > 0) {
      xhr.setRequestHeader("x-asset-width", String(Math.round(width)));
    }

    if (typeof height === "number" && height > 0) {
      xhr.setRequestHeader("x-asset-height", String(Math.round(height)));
    }

    // root 切换科室后，覆盖请求也要落到当前科室；空作用域不发头。
    for (const [key, value] of Object.entries(scopeHeaders())) {
      if (value.trim()) {
        xhr.setRequestHeader(key, value);
      }
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) {
        onProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100))
        );
      }
    });

    xhr.addEventListener("load", () => {
      cleanup();

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(messageOf(xhr.status, xhr.responseText)));

        return;
      }

      let parsed: unknown;

      try {
        parsed = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("服务器返回格式异常，无法确认覆盖结果"));

        return;
      }

      const replaced = parseReplacedAsset(parsed);

      if (!replaced) {
        reject(new Error("服务器返回格式异常，无法确认覆盖结果"));

        return;
      }

      onProgress?.(100);
      resolve(replaced);
    });

    xhr.addEventListener("error", () => {
      cleanup();
      reject(new Error("网络异常，覆盖失败，请检查网络后重试"));
    });

    xhr.addEventListener("timeout", () => {
      cleanup();
      reject(new Error("覆盖超时，请稍后重试"));
    });

    xhr.addEventListener("abort", () => {
      cleanup();
      reject(abortError());
    });

    signal?.addEventListener("abort", handleAbort, { once: true });
    xhr.send(file);
  });

export const uploadFiles = async (
  files: FileList | File[],
  target: UploadTarget,
  onProgress?: (file: File, percent: number) => void,
  signal?: AbortSignal
): Promise<UploadedAsset[]> => {
  const list = [...files];
  const uploaded: UploadedAsset[] = [];

  for (const file of list) {
    uploaded.push(
      await uploadFile(
        file,
        target,
        (percent) => onProgress?.(file, percent),
        signal
      )
    );
  }

  return uploaded;
};

export const uploadFile = async (...args: Parameters<typeof uploadFileImpl>) =>
  await withBusyTask(async () => await uploadFileImpl(...args));

export const replaceFile = async (
  ...args: Parameters<typeof replaceFileImpl>
) => await withBusyTask(async () => await replaceFileImpl(...args));
