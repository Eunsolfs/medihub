import { Loader2Icon } from "lucide-react";

import { Markdown } from "./markdown.tsx";
import { PreviewFallback } from "./preview-fallback.tsx";
import type { MediaAsset } from "./types.ts";
import { useAssetText } from "./use-file-resource.ts";

export interface TextViewerProps {
  asset: MediaAsset;
  enabled: boolean;
  markdown: boolean;
}

/** 文本 / Markdown / 代码：拉取纯文本后渲染；Markdown 走统一消毒渲染。 */
export const TextViewer = ({ asset, enabled, markdown }: TextViewerProps) => {
  const text = useAssetText(asset.id, enabled);

  if (text.status === "loading") {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        正在读取文本…
      </div>
    );
  }

  if (text.status === "error") {
    return <PreviewFallback asset={asset} message={text.message} />;
  }

  if (markdown) {
    return (
      <div className="bg-background h-full overflow-auto p-4 sm:p-6">
        <Markdown content={text.data} className="mx-auto max-w-3xl" />
      </div>
    );
  }

  return (
    <pre className="bg-background h-full overflow-auto p-4 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap">
      {text.data}
    </pre>
  );
};
