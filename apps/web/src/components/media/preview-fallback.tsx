import { FileIcon } from "lucide-react";

import { buttonVariants } from "@medihub/ui/components/button";

import { formatBytes } from "#src/lib/format.ts";

import { assetDownloadUrl } from "./types.ts";
import type { MediaAsset } from "./types.ts";

export interface PreviewFallbackProps {
  asset: MediaAsset;
  message: string;
  hint?: string;
}

const sizeOf = (asset: MediaAsset) =>
  typeof asset.byteSize === "number" ? formatBytes(asset.byteSize) : "";

/** 无法预览时的统一降级面板：说明原因 + 下载原文件。 */
export const PreviewFallback = ({
  asset,
  message,
  hint,
}: PreviewFallbackProps) => {
  const size = sizeOf(asset);

  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="bg-muted flex size-14 items-center justify-center rounded-full">
        <FileIcon className="text-muted-foreground size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{message}</p>
        <p className="text-muted-foreground text-xs">
          {asset.originalName}
          {size ? ` · ${size}` : ""}
        </p>
        {hint ? (
          <p className="text-muted-foreground max-w-md text-xs">{hint}</p>
        ) : null}
      </div>
      <a
        href={assetDownloadUrl(asset.id)}
        download={asset.originalName}
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        下载文件
      </a>
    </div>
  );
};
