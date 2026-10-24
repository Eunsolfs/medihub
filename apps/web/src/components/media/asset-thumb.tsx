import type { LucideIcon } from "lucide-react";
import {
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@medihub/ui/lib/utils";

import {
  assetFileUrl,
  extensionLabel,
  isArchiveAsset,
  isAudioAsset,
  isImageAsset,
  isPdfAsset,
  isPresentationAsset,
  isSpreadsheetAsset,
  isVideoAsset,
  isWordAsset,
} from "./types.ts";
import type { ThumbAsset } from "./types.ts";

export interface AssetThumbProps {
  asset: ThumbAsset;
  className?: string;
  /** 传入后整块缩略图可点击（通常用于打开预览）。 */
  onOpen?: (asset: ThumbAsset) => void;
  /** 首屏关键图片可关掉懒加载。 */
  eager?: boolean;
}

interface ThumbTile {
  Icon: LucideIcon;
  tone: string;
}

const tileOf = (asset: ThumbAsset): ThumbTile => {
  if (isVideoAsset(asset)) {
    return { Icon: VideoIcon, tone: "text-sky-600 dark:text-sky-400" };
  }

  if (isAudioAsset(asset)) {
    return { Icon: MusicIcon, tone: "text-violet-600 dark:text-violet-400" };
  }

  if (isArchiveAsset(asset)) {
    return {
      Icon: FileArchiveIcon,
      tone: "text-amber-600 dark:text-amber-400",
    };
  }

  if (isSpreadsheetAsset(asset)) {
    return {
      Icon: FileSpreadsheetIcon,
      tone: "text-emerald-600 dark:text-emerald-400",
    };
  }

  if (isPresentationAsset(asset)) {
    return { Icon: FileTextIcon, tone: "text-orange-600 dark:text-orange-400" };
  }

  if (isWordAsset(asset)) {
    return { Icon: FileTextIcon, tone: "text-blue-600 dark:text-blue-400" };
  }

  if (isPdfAsset(asset)) {
    return { Icon: FileTextIcon, tone: "text-rose-600 dark:text-rose-400" };
  }

  if (isImageAsset(asset)) {
    return { Icon: ImageIcon, tone: "text-teal-600 dark:text-teal-400" };
  }

  return { Icon: FileIcon, tone: "text-muted-foreground" };
};

/**
 * 图片走 /api/files/:id 懒加载；视频、文档、压缩包等显示类型图标磁贴 + 扩展名。
 * 会话 cookie 由浏览器自动带上，所以直接 <img> 即可，不需要 fetch。
 */
export const AssetThumb = ({
  asset,
  className,
  onOpen,
  eager = false,
}: AssetThumbProps) => {
  const [brokenId, setBrokenId] = useState<string | null>(null);
  const image = isImageAsset(asset) && brokenId !== asset.id;
  const { Icon, tone } = tileOf(asset);

  const body = image ? (
    <img
      src={assetFileUrl(asset.id)}
      alt={asset.originalName}
      data-testid="asset-thumb-image"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="size-full object-cover"
      onError={() => {
        setBrokenId(asset.id);
      }}
    />
  ) : (
    <span className="from-muted to-muted/40 flex size-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br p-2 text-center">
      <Icon aria-hidden className={cn("size-7", tone)} />
      <span className="text-muted-foreground max-w-full truncate font-mono text-[10px] font-medium tracking-wide">
        {extensionLabel(asset.originalName)}
      </span>
    </span>
  );

  return (
    <div
      className={cn(
        "bg-muted relative aspect-[4/3] overflow-hidden rounded-lg",
        className
      )}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={() => {
            onOpen(asset);
          }}
          className="focus-visible:ring-ring absolute inset-0 block size-full cursor-zoom-in text-left outline-none focus-visible:ring-2"
          aria-label={`预览 ${asset.originalName}`}
        >
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
};
