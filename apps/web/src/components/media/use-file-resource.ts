import { useEffect, useState } from "react";

import { assetFileUrl } from "./types.ts";

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

const messageFor = (status: number) => {
  if (status === 401) {
    return "登录已过期，请重新登录";
  }

  if (status === 403) {
    return "没有访问该文件的权限";
  }

  if (status === 404) {
    return "文件不存在或已被删除";
  }

  if (status === 410) {
    return "文件已从存储中移除";
  }

  return `读取文件失败（${status}）`;
};

const fetchAsset = async <T>(
  assetId: string,
  signal: AbortSignal,
  read: (response: Response) => Promise<T>
): Promise<T> => {
  const response = await fetch(assetFileUrl(assetId), {
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(messageFor(response.status));
  }

  return await read(response);
};

const readArrayBuffer = async (response: Response) =>
  await response.arrayBuffer();

const readText = async (response: Response) => await response.text();

interface Stored<T> {
  key: string;
  state: ResourceState<T>;
}

/**
 * 按素材 id 缓存整段读取结果：asset 变化时旧数据不匹配，渲染期直接派生成 loading，
 * 不需要在 effect 里同步 setState，也就不会触发级联渲染。
 */
const useAssetResource = <T>(
  assetId: string,
  enabled: boolean,
  read: (response: Response) => Promise<T>
): ResourceState<T> => {
  const [stored, setStored] = useState<Stored<T> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchAsset(assetId, controller.signal, read);

        if (!controller.signal.aborted) {
          setStored({ key: assetId, state: { data, status: "ready" } });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setStored({
            key: assetId,
            state: {
              message: error instanceof Error ? error.message : "读取文件失败",
              status: "error",
            },
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [assetId, enabled, read]);

  if (!enabled) {
    return { status: "loading" };
  }

  return stored && stored.key === assetId
    ? stored.state
    : { status: "loading" };
};

/** docx / xlsx 需要整段二进制，下载一次解析。 */
export const useAssetArrayBuffer = (assetId: string, enabled: boolean) =>
  useAssetResource(assetId, enabled, readArrayBuffer);

/** 文本 / Markdown / 代码预览。 */
export const useAssetText = (assetId: string, enabled: boolean) =>
  useAssetResource(assetId, enabled, readText);

export interface OfficeConfig {
  editorUrl: string;
  config: Record<string, unknown>;
  token: string;
}

export type OfficeConfigState =
  | { status: "loading" }
  | { status: "ready"; data: OfficeConfig }
  | { status: "unavailable" }
  | { status: "error"; message: string };

type SettledOfficeConfig = Exclude<OfficeConfigState, { status: "loading" }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** 运行时判断 OnlyOffice 是否配置：configured=false 时不加载任何外部脚本。 */
export const useOfficeConfig = (assetId: string, enabled: boolean) => {
  const [stored, setStored] = useState<{
    key: string;
    state: SettledOfficeConfig;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/office/${assetId}/config`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(messageFor(response.status));
        }

        const payload: unknown = await response.json();

        if (!isRecord(payload) || payload.configured !== true) {
          setStored({ key: assetId, state: { status: "unavailable" } });

          return;
        }

        const { config, editorUrl, token } = payload;

        if (
          !isRecord(config) ||
          typeof editorUrl !== "string" ||
          editorUrl.length === 0 ||
          typeof token !== "string"
        ) {
          setStored({ key: assetId, state: { status: "unavailable" } });

          return;
        }

        setStored({
          key: assetId,
          state: { data: { config, editorUrl, token }, status: "ready" },
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          setStored({
            key: assetId,
            state: {
              message:
                error instanceof Error ? error.message : "无法获取在线编辑配置",
              status: "error",
            },
          });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [assetId, enabled]);

  if (!enabled) {
    return { status: "unavailable" } satisfies OfficeConfigState;
  }

  return stored && stored.key === assetId
    ? stored.state
    : ({ status: "loading" } satisfies OfficeConfigState);
};

export type PdfProbeState = "loading" | "ready" | "fallback" | "error";

/**
 * pptx 没有浏览器本地渲染方案：先探测 `/api/office/:id/pdf`。
 * 服务器没装 LibreOffice 时返回 501，此时降级为「下载查看」，不算致命错误。
 */
export const usePdfProbe = (assetId: string, enabled: boolean) => {
  const [stored, setStored] = useState<{
    key: string;
    state: Exclude<PdfProbeState, "loading">;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/office/${assetId}/pdf`, {
          credentials: "include",
          signal: controller.signal,
        });

        if (response.ok) {
          await response.body?.cancel();
          setStored({ key: assetId, state: "ready" });

          return;
        }

        setStored({
          key: assetId,
          state: response.status === 501 ? "fallback" : "error",
        });
      } catch {
        if (!controller.signal.aborted) {
          setStored({ key: assetId, state: "fallback" });
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [assetId, enabled]);

  if (!enabled) {
    return "fallback";
  }

  return stored && stored.key === assetId ? stored.state : "loading";
};
