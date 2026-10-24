import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PreviewFallback } from "./preview-fallback.tsx";
import type { MediaAsset } from "./types.ts";
import { useAssetArrayBuffer } from "./use-file-resource.ts";
import { useIsMobile } from "./use-is-mobile.ts";

export interface DocxViewerProps {
  asset: MediaAsset;
  enabled: boolean;
}

/**
 * docx 本地渲染：docx-preview 把文档渲染成 DOM，容器限宽 + 允许滚动。
 * 解析失败时降级为「下载查看」，不当作致命错误。
 */
export const DocxViewer = ({ asset, enabled }: DocxViewerProps) => {
  const buffer = useAssetArrayBuffer(asset.id, enabled);
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    if (buffer.status !== "ready") {
      return;
    }

    const container = containerRef.current;
    let cancelled = false;

    if (!container) {
      return;
    }

    container.innerHTML = "";
    setRendering(true);
    setRenderError(null);

    void (async () => {
      try {
        // 动态导入让 docx-preview 只在真正打开 docx 时才进入主包。
        const { renderAsync } = await import("docx-preview");

        if (cancelled) {
          return;
        }

        await renderAsync(buffer.data, container, undefined, {
          breakPages: true,
          ignoreWidth: false,
          inWrapper: true,
          useBase64URL: true,
        });
      } catch {
        if (!cancelled) {
          setRenderError("无法解析该 Word 文档");
        }
      } finally {
        if (!cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buffer]);

  if (buffer.status === "loading" || (buffer.status === "ready" && rendering)) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        正在渲染文档…
      </div>
    );
  }

  if (buffer.status === "error") {
    return <PreviewFallback asset={asset} message={buffer.message} />;
  }

  if (renderError) {
    return (
      <PreviewFallback
        asset={asset}
        message={
          isMobile ? "暂不支持在线预览，可下载后在手机上查看" : renderError
        }
        hint={
          isMobile
            ? undefined
            : "下载后用本地 Word 打开；也可以让管理员开启 OnlyOffice 在线编辑。"
        }
      />
    );
  }

  return (
    <div className="bg-muted/30 h-full overflow-auto p-3 sm:p-6">
      <div
        ref={containerRef}
        className="mx-auto max-w-[900px] [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0 [&_section.docx]:mb-4 [&_section.docx]:shadow-md"
      />
    </div>
  );
};
