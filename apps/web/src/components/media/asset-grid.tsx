import { DownloadIcon, EyeIcon, ImageOffIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { toast } from "sonner";

import { buttonVariants } from "@medihub/ui/components/button";
import { Checkbox } from "@medihub/ui/components/checkbox";
import { cn } from "@medihub/ui/lib/utils";

import { formatBytes, formatDate } from "#src/lib/format.ts";
import type { UploadedAsset } from "#src/lib/upload.ts";

import { AssetPreview } from "./asset-preview.tsx";
import { AssetThumb } from "./asset-thumb.tsx";
import { assetDownloadUrl } from "./types.ts";
import type { AssetSelection, MediaAsset } from "./types.ts";

export interface AssetGridProps {
  assets: MediaAsset[];
  empty?: ReactNode;
  /** 传入后由调用方接管点击行为；不传时点击缩略图由组件内部打开预览。 */
  onOpen?: (asset: MediaAsset) => void;
  selection?: AssetSelection;
  /** 有删除权限时传入；hover 操作条才会出现删除按钮。 */
  onDelete?: (asset: MediaAsset) => void;
  /** 内部预览里 xlsx「保存为新版本」成功后回调，用于刷新列表。 */
  onUploaded?: (asset: UploadedAsset) => void;
  /** 卡片/行底部附加一行自定义内容（如归属患者链接），点击不会触发预览。 */
  renderCaption?: (asset: MediaAsset) => ReactNode;
  className?: string;
  layout?: "grid" | "list";
}

const metaOf = (asset: MediaAsset) => {
  const parts: string[] = [];

  if (typeof asset.byteSize === "number") {
    parts.push(formatBytes(asset.byteSize));
  }

  const date = asset.capturedAt ?? asset.createdAt;

  if (date) {
    parts.push(formatDate(date));
  }

  return parts.join(" · ");
};

const AssetActions = ({
  asset,
  onDelete,
}: {
  asset: MediaAsset;
  onDelete?: (asset: MediaAsset) => void;
}) => (
  <div
    className="bg-background/90 flex items-center gap-0.5 rounded-md p-0.5 shadow-sm backdrop-blur"
    onPointerDown={(event) => {
      event.stopPropagation();
    }}
  >
    <a
      href={assetDownloadUrl(asset.id)}
      download={asset.originalName}
      title="下载"
      aria-label={`下载 ${asset.originalName}`}
      className={buttonVariants({ size: "icon-xs", variant: "ghost" })}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <DownloadIcon />
    </a>
    {onDelete ? (
      <button
        type="button"
        title="删除"
        aria-label={`删除 ${asset.originalName}`}
        className={buttonVariants({ size: "icon-xs", variant: "ghost" })}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(asset);
        }}
      >
        <Trash2Icon className="text-destructive" />
      </button>
    ) : null}
  </div>
);

/** 响应式素材网格：2 列手机 / 4 列平板 / 6 列桌面；支持多选与 hover 操作条。 */
export const AssetGrid = ({
  assets,
  empty,
  onOpen,
  selection,
  onDelete,
  onUploaded,
  renderCaption,
  className,
  layout = "grid",
}: AssetGridProps) => {
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  if (assets.length === 0) {
    return (
      <div
        className={cn(
          "border-border bg-muted/20 text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm",
          className
        )}
      >
        {empty ?? (
          <>
            <ImageOffIcon className="size-6" />
            <span>暂无素材</span>
          </>
        )}
      </div>
    );
  }

  const selectedIds = new Set(selection?.selectedIds);
  const selectedCount = selection ? selection.selectedIds.length : 0;

  const toggle = (id: string) => {
    if (!selection) {
      return;
    }

    const next = new Set(selection.selectedIds);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    selection.onChange([...next]);
  };

  const open = (asset: MediaAsset) => {
    if (onOpen) {
      onOpen(asset);

      return;
    }

    setPreview(asset);
  };

  const handleActivate = (asset: MediaAsset) => {
    if (asset.archivedAt) {
      toast.info("该素材已归档，请到「系统管理 → 归档」下载对应分片后离线查看");

      return;
    }

    if (suppressClick.current) {
      suppressClick.current = false;

      return;
    }

    open(asset);
  };

  const startPress = (asset: MediaAsset) => {
    if (!selection) {
      return;
    }

    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }

    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      toggle(asset.id);
    }, 500);
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const checkbox = (asset: MediaAsset) => {
    if (!selection) {
      return null;
    }

    return (
      <span
        className="bg-background/90 absolute top-1.5 left-1.5 z-10 flex size-7 items-center justify-center rounded-md shadow-sm backdrop-blur"
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <Checkbox
          checked={selectedIds.has(asset.id)}
          onCheckedChange={() => {
            toggle(asset.id);
          }}
          aria-label={`选择 ${asset.originalName}`}
        />
      </span>
    );
  };

  return (
    <div className={cn("space-y-2", className)} data-testid="asset-grid">
      {selection && selectedCount > 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>已选 {selectedCount} 项</span>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              selection.onChange([]);
            }}
          >
            清空选择
          </button>
        </div>
      ) : null}

      {layout === "list" ? (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-lg border">
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);

            return (
              <li
                key={asset.id}
                role="button"
                tabIndex={0}
                data-testid="asset-grid-card"
                aria-pressed={selection ? isSelected : undefined}
                className={cn(
                  "group bg-background hover:bg-muted/50 focus-visible:bg-muted/50 flex cursor-pointer items-center gap-3 p-2 transition-colors outline-none",
                  isSelected && "bg-primary/5"
                )}
                onClick={() => {
                  handleActivate(asset);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLLIElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleActivate(asset);
                  }
                }}
                onPointerDown={() => {
                  startPress(asset);
                }}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
              >
                {selection ? (
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => {
                      toggle(asset.id);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    aria-label={`选择 ${asset.originalName}`}
                  />
                ) : null}
                <AssetThumb
                  asset={asset}
                  className="aspect-square w-12 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{asset.originalName}</span>
                    {asset.archivedAt ? (
                      <span className="bg-muted text-muted-foreground shrink-0 rounded px-1 py-0.5 text-[10px]">
                        已归档
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {metaOf(asset) || "—"}
                  </p>
                  {renderCaption ? (
                    <span
                      className="block"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      {renderCaption(asset)}
                    </span>
                  ) : null}
                </div>
                <div
                  className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    title="预览"
                    aria-label={`预览 ${asset.originalName}`}
                    className={buttonVariants({
                      size: "icon-xs",
                      variant: "ghost",
                    })}
                    onClick={(event) => {
                      event.stopPropagation();
                      open(asset);
                    }}
                  >
                    <EyeIcon />
                  </button>
                  <a
                    href={assetDownloadUrl(asset.id)}
                    download={asset.originalName}
                    title="下载"
                    aria-label={`下载 ${asset.originalName}`}
                    className={buttonVariants({
                      size: "icon-xs",
                      variant: "ghost",
                    })}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <DownloadIcon />
                  </a>
                  {onDelete ? (
                    <button
                      type="button"
                      title="删除"
                      aria-label={`删除 ${asset.originalName}`}
                      className={buttonVariants({
                        size: "icon-xs",
                        variant: "ghost",
                      })}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(asset);
                      }}
                    >
                      <Trash2Icon className="text-destructive" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);

            return (
              <li
                key={asset.id}
                role="button"
                tabIndex={0}
                data-testid="asset-grid-card"
                aria-pressed={selection ? isSelected : undefined}
                className={cn(
                  "group border-border bg-background hover:border-primary/40 focus-visible:ring-ring relative cursor-pointer overflow-hidden rounded-xl border p-1.5 transition-all outline-none hover:shadow-sm focus-visible:ring-2",
                  isSelected && "ring-primary ring-2"
                )}
                onClick={() => {
                  handleActivate(asset);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLLIElement>) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleActivate(asset);
                  }
                }}
                onPointerDown={() => {
                  startPress(asset);
                }}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
              >
                {checkbox(asset)}
                {asset.archivedAt ? (
                  <span className="bg-background/90 text-muted-foreground absolute top-2.5 left-2.5 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium">
                    已归档
                  </span>
                ) : null}
                <AssetThumb asset={asset} />
                <div className="px-1 pt-1.5 pb-0.5">
                  <p
                    className="truncate text-sm font-medium"
                    title={asset.originalName}
                  >
                    {asset.originalName}
                  </p>
                  <p className="text-muted-foreground truncate text-[11px]">
                    {metaOf(asset) || "—"}
                  </p>
                  {renderCaption ? (
                    <span
                      className="block"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      {renderCaption(asset)}
                    </span>
                  ) : null}
                </div>
                <div className="absolute top-2.5 right-2.5 z-10 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <AssetActions asset={asset} onDelete={onDelete} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AssetPreview
        asset={preview}
        open={preview !== null}
        onOpenChange={(value) => {
          if (!value) {
            setPreview(null);
          }
        }}
        items={assets}
        onUploaded={onUploaded}
      />
    </div>
  );
};
