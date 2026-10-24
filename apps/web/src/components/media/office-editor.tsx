import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@medihub/ui/components/button";

import type { OfficeConfig } from "./use-file-resource.ts";

interface DocsApiEditor {
  destroyEditor?: () => void;
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (
        id: string,
        config: Record<string, unknown>
      ) => DocsApiEditor;
    };
  }
}

let pendingScript: Promise<void> | null = null;

/** 只在 configured=true 后调用：动态插入 OnlyOffice 的 api.js，未配置时页面不会加载任何外部脚本。 */
const loadDocsApi = async (editorUrl: string) => {
  if (window.DocsAPI) {
    return;
  }

  if (pendingScript) {
    await pendingScript;

    return;
  }

  pendingScript = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-medihub-onlyoffice]"
    );

    // 上一次加载失败留下的脚本不会再次触发 load，移除后重新插入才能重试。
    existing?.remove();

    const script = document.createElement("script");
    const source = `${editorUrl.replace(/\/+$/, "")}/web-apps/apps/api/documents/api.js`;

    const onLoad = () => {
      if (window.DocsAPI) {
        resolve();
      } else {
        reject(new Error("OnlyOffice 脚本已加载，但编辑器接口不可用"));
      }
    };

    const onError = () => {
      reject(new Error("OnlyOffice 编辑器脚本加载失败，请检查服务地址"));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    script.src = source;
    script.async = true;
    script.dataset.medihubOnlyoffice = "true";
    document.head.append(script);
  }).catch((error: unknown) => {
    // 允许用户重试：下次点击「在线编辑」重新加载脚本。
    pendingScript = null;
    throw error;
  });

  await pendingScript;
};

export interface OnlyOfficeEditorProps {
  data: OfficeConfig;
  title: string;
  onExit: () => void;
}

/** OnlyOffice 编辑器容器：脚本加载 → new DocsAPI.DocEditor(containerId, { ...config, token })。 */
export const OnlyOfficeEditor = ({
  data,
  title,
  onExit,
}: OnlyOfficeEditorProps) => {
  const rawId = useId();
  const containerId = `onlyoffice-${rawId.replaceAll(/[^a-zA-Z0-9_-]/g, "")}`;
  const editorRef = useRef<DocsApiEditor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        await loadDocsApi(data.editorUrl);

        if (disposed) {
          return;
        }

        const { DocsAPI } = window;

        if (!DocsAPI) {
          throw new Error("OnlyOffice 编辑器接口不可用");
        }

        editorRef.current = new DocsAPI.DocEditor(containerId, {
          ...data.config,
          token: data.token,
        });
        setLoading(false);
      } catch (loadError) {
        if (!disposed) {
          setLoading(false);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "OnlyOffice 编辑器加载失败"
          );
        }
      }
    })();

    return () => {
      disposed = true;
      editorRef.current?.destroyEditor?.();
      editorRef.current = null;
    };
  }, [containerId, data]);

  return (
    <div className="bg-background flex size-full min-h-0 flex-col">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeftIcon />
          返回预览
        </Button>
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          仅支持已配置 OnlyOffice 的部署
        </span>
      </div>

      {error ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm">
          <p className="text-foreground font-medium">无法打开在线编辑器</p>
          <p>{error}</p>
          <p className="text-xs">可先下载文件，用本地 Office 打开。</p>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {loading ? (
            <div className="bg-background text-muted-foreground absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-sm">
              <Loader2Icon className="size-5 animate-spin" />
              正在加载编辑器…
            </div>
          ) : null}
          <div id={containerId} className="size-full" />
        </div>
      )}
    </div>
  );
};
