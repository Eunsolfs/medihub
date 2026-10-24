import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PencilLineIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button, buttonVariants } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { cn } from "@medihub/ui/lib/utils";

import {
  formatBytes,
  formatDate,
  formatDateTime,
  stageLabel,
  visibilityLabel,
} from "#src/lib/format.ts";
import type { UploadedAsset } from "#src/lib/upload.ts";

import { DocxViewer } from "./docx-viewer.tsx";
import { ImagePreview } from "./image-preview.tsx";
import { OnlyOfficeEditor } from "./office-editor.tsx";
import { PptxViewer } from "./pptx-viewer.tsx";
import { PreviewFallback } from "./preview-fallback.tsx";
import { SpreadsheetViewer } from "./spreadsheet-viewer.tsx";
import { TextViewer } from "./text-viewer.tsx";
import type { MediaAsset } from "./types.ts";
import {
  assetDownloadUrl,
  assetFileUrl,
  isAudioAsset,
  isImageAsset,
  isMarkdownAsset,
  isOfficeAsset,
  isPdfAsset,
  isPresentationAsset,
  isSpreadsheetAsset,
  isTextAsset,
  isVideoAsset,
  isWordAsset,
} from "./types.ts";
import { useOfficeConfig } from "./use-file-resource.ts";

export interface AssetPreviewProps {
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入整组素材后启用上一张/下一张。 */
  items?: MediaAsset[];
  /** xlsx「保存为新版本」成功后回调，用于刷新列表。 */
  onUploaded?: (asset: UploadedAsset) => void;
  /** 切换上一张/下一张时同步给受控调用方（不传则组件内部切换）。 */
  onNavigate?: (asset: MediaAsset) => void;
}

const metaOf = (asset: MediaAsset) =>
  [
    formatDate(asset.capturedAt ?? asset.createdAt),
    asset.stage ? stageLabel(asset.stage) : "",
    typeof asset.byteSize === "number" ? formatBytes(asset.byteSize) : "",
    asset.visibility ? visibilityLabel(asset.visibility) : "",
  ]
    .filter(Boolean)
    .join(" · ");

interface NavigationState {
  /** 开始内部切换时父组件传入的 asset.id，父组件换素材后自动失效。 */
  fromId: string | null;
  asset: MediaAsset;
}

/** 全屏素材预览：按 MIME 分发到图片 / 音视频 / PDF / docx / xlsx / pptx / 文本 / 下载降级。 */
export const AssetPreview = ({
  asset,
  open,
  onOpenChange,
  items,
  onUploaded,
  onNavigate,
}: AssetPreviewProps) => {
  const [navigation, setNavigation] = useState<NavigationState | null>(null);
  const [editing, setEditing] = useState(false);

  const current =
    navigation && navigation.fromId === (asset?.id ?? null)
      ? navigation.asset
      : asset;

  const officeEnabled = Boolean(current && isOfficeAsset(current));
  const office = useOfficeConfig(current?.id ?? "", officeEnabled && open);

  const list = useMemo(() => {
    if (items && items.length > 0) {
      return items;
    }

    return current ? [current] : [];
  }, [current, items]);

  const index = current ? list.findIndex((item) => item.id === current.id) : -1;
  const previous = index > 0 ? list[index - 1] : undefined;

  const next =
    index >= 0 && index < list.length - 1 ? list[index + 1] : undefined;

  const navigate = (target: MediaAsset | undefined) => {
    if (!target) {
      return;
    }

    setEditing(false);
    setNavigation({ asset: target, fromId: asset?.id ?? null });
    onNavigate?.(target);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setEditing(false);
    }

    onOpenChange(value);
  };

  const body = () => {
    if (!current) {
      return null;
    }

    if (editing && office.status === "ready") {
      return (
        <OnlyOfficeEditor
          data={office.data}
          title={current.originalName}
          onExit={() => {
            setEditing(false);
          }}
        />
      );
    }

    if (isImageAsset(current)) {
      return (
        <ImagePreview
          key={current.id}
          asset={current}
          onPrev={
            previous
              ? () => {
                  navigate(previous);
                }
              : undefined
          }
          onNext={
            next
              ? () => {
                  navigate(next);
                }
              : undefined
          }
        />
      );
    }

    if (isVideoAsset(current)) {
      return (
        <div className="flex size-full items-center justify-center bg-black p-2">
          <video
            key={current.id}
            src={assetFileUrl(current.id)}
            controls
            playsInline
            preload="metadata"
            className="max-h-full max-w-full"
          >
            当前浏览器不支持播放该视频。
          </video>
        </div>
      );
    }

    if (isAudioAsset(current)) {
      return (
        <div className="bg-muted/30 flex size-full flex-col items-center justify-center gap-4 p-8">
          <p className="max-w-md text-center text-sm font-medium">
            {current.originalName}
          </p>
          <audio
            src={assetFileUrl(current.id)}
            controls
            className="w-full max-w-lg"
          >
            当前浏览器不支持播放该音频。
          </audio>
        </div>
      );
    }

    if (isPdfAsset(current)) {
      return (
        <iframe
          key={current.id}
          src={assetFileUrl(current.id)}
          title={current.originalName}
          className="bg-background size-full border-0"
        />
      );
    }

    if (isSpreadsheetAsset(current)) {
      return (
        <SpreadsheetViewer
          key={current.id}
          asset={current}
          enabled={open}
          onUploaded={onUploaded}
        />
      );
    }

    if (isWordAsset(current)) {
      return <DocxViewer key={current.id} asset={current} enabled={open} />;
    }

    if (isPresentationAsset(current)) {
      return <PptxViewer key={current.id} asset={current} enabled={open} />;
    }

    if (isTextAsset(current)) {
      return (
        <TextViewer
          key={current.id}
          asset={current}
          enabled={open}
          markdown={isMarkdownAsset(current)}
        />
      );
    }

    return (
      <PreviewFallback
        asset={current}
        message="该文件类型暂不支持在线预览"
        hint="下载后使用本地软件打开。"
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[min(96vw,1200px)] max-w-[min(96vw,1200px)] flex-col">
        <div
          className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
          data-testid="asset-preview"
        >
          <div className="border-border flex flex-wrap items-center gap-2 border-b px-3 py-2 pr-8">
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle>
                <span className="block truncate">
                  {current?.originalName ?? "素材预览"}
                </span>
              </DialogTitle>
              <DialogDescription>
                <span className="text-muted-foreground block truncate text-xs">
                  {current ? metaOf(current) : ""}
                  {current?.capturedAt
                    ? ` · ${formatDateTime(current.capturedAt)}`
                    : ""}
                </span>
              </DialogDescription>
            </DialogHeader>

            {list.length > 1 ? (
              <div className="hidden items-center gap-1 sm:flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!previous}
                  onClick={() => {
                    navigate(previous);
                  }}
                  aria-label="上一张"
                  title="上一张"
                >
                  <ChevronLeftIcon />
                </Button>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {index + 1}/{list.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!next}
                  onClick={() => {
                    navigate(next);
                  }}
                  aria-label="下一张"
                  title="下一张"
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            ) : null}

            {office.status === "ready" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(true);
                }}
                title="在 OnlyOffice 中编辑"
              >
                <PencilLineIcon />
                <span className="hidden sm:inline">在线编辑</span>
              </Button>
            ) : null}

            {current ? (
              <a
                href={assetDownloadUrl(current.id)}
                download={current.originalName}
                className={buttonVariants({ size: "sm", variant: "outline" })}
                title="下载原文件"
              >
                <DownloadIcon />
                <span className="hidden sm:inline">下载</span>
              </a>
            ) : null}

            {current &&
            (isWordAsset(current) ||
              isPresentationAsset(current) ||
              isSpreadsheetAsset(current)) ? (
              <a
                href={`/api/office/${current.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ size: "sm", variant: "ghost" }),
                  "hidden md:inline-flex"
                )}
                title="在新标签页打开 PDF 预览"
              >
                <ExternalLinkIcon />
              </a>
            ) : null}
          </div>

          <div className="bg-muted/20 min-h-0 flex-1 overflow-hidden">
            {body()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
