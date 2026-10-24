import { useMutation } from "@tanstack/react-query";
import {
  CalendarDaysIcon,
  GripVerticalIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@medihub/ui/components/badge";
import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { api } from "#src/lib/api.ts";
import { formatDate, stageLabel } from "#src/lib/format.ts";

import { AssetMetaDialog } from "./asset-meta-dialog.tsx";
import { AssetPreview } from "./asset-preview.tsx";
import { AssetThumb } from "./asset-thumb.tsx";
import type { MediaAsset } from "./types.ts";
import { useIsMobile } from "./use-is-mobile.ts";

export interface AssetTimelineProps {
  admissionId?: string;
  /** 直接传 api.assets.list({ admissionId, sort: "timeline" }).items。 */
  assets: MediaAsset[];
  /** 拖拽排序 / 元数据保存 / 删除成功后调用，用于 invalidate 查询。 */
  onChanged?: () => void;
}

interface DayGroup {
  key: string;
  label: string;
  items: MediaAsset[];
}

interface LocalOrder {
  /** 生成这份顺序时的父级素材 id 列表，父级刷新后自动失效。 */
  sourceIds: string;
  assets: MediaAsset[];
}

const pad = (value: number) => String(value).padStart(2, "0");

const dateOf = (asset: MediaAsset) => {
  const value = asset.capturedAt ?? asset.createdAt;

  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", { weekday: "long" });

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

const groupByDay = (assets: MediaAsset[]): DayGroup[] => {
  const groups = new Map<string, DayGroup>();

  for (const asset of assets) {
    const date = dateOf(asset);
    const key = date ? dayKey(date) : "unknown";
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(asset);
      continue;
    }

    groups.set(key, {
      items: [asset],
      key,
      label: date
        ? `${formatDate(date)} · ${weekdayFormatter.format(date)}`
        : "日期未知",
    });
  }

  return [...groups.values()];
};

const stageCounts = (items: MediaAsset[]) => {
  const counts = new Map<string, number>();

  for (const asset of items) {
    const label = stageLabel(asset.stage);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()];
};

/** 素材时间线：按拍摄日期分组，支持 HTML5 拖拽排序与元数据编辑。 */
export const AssetTimeline = ({
  admissionId,
  assets,
  onChanged,
}: AssetTimelineProps) => {
  const [localOrder, setLocalOrder] = useState<LocalOrder | null>(null);
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [metaAsset, setMetaAsset] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const sourceIds = useMemo(
    () => assets.map((asset) => asset.id).join("|"),
    [assets]
  );

  const order =
    localOrder && localOrder.sourceIds === sourceIds
      ? localOrder.assets
      : assets;

  const reorder = useMutation(api.assets.reorder.mutationOptions());
  const remove = useMutation(api.assets.remove.mutationOptions());

  const groups = useMemo(() => groupByDay(order), [order]);

  const handleDrop = (targetId: string) => {
    const fromId = dragId;

    setDragId(null);
    setOverId(null);

    if (!fromId || fromId === targetId) {
      return;
    }

    const fromIndex = order.findIndex((asset) => asset.id === fromId);
    const toIndex = order.findIndex((asset) => asset.id === targetId);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    const next = [...order];
    const [moved] = next.splice(fromIndex, 1);

    if (!moved) {
      return;
    }

    next.splice(toIndex, 0, moved);
    setLocalOrder({ assets: next, sourceIds });

    reorder.mutate(
      { ids: next.map((asset) => asset.id) },
      {
        onError: (error) => {
          setLocalOrder(null);
          toast.error(error.message || "排序保存失败，已恢复原顺序");
        },
        onSuccess: () => {
          onChanged?.();
        },
      }
    );
  };

  const confirmRemove = () => {
    if (!deleteTarget) {
      return;
    }

    setDeletingId(deleteTarget.id);
    remove.mutate(
      { ids: [deleteTarget.id] },
      {
        onError: (error) => {
          setDeletingId(null);
          toast.error(error.message || "删除失败，请稍后重试");
        },
        onSuccess: () => {
          setDeletingId(null);
          setDeleteTarget(null);
          toast.success("素材已删除");
          onChanged?.();
        },
      }
    );
  };

  if (assets.length === 0) {
    return (
      <div className="border-border bg-muted/20 text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm">
        <CalendarDaysIcon className="size-6" />
        <span>该就诊暂无素材，上传后会按日期出现在这里</span>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      data-testid="asset-timeline"
      aria-label={
        admissionId ? `就诊 ${admissionId} 的素材时间线` : "素材时间线"
      }
    >
      {groups.map((group) => (
        <section key={group.key}>
          <header className="border-border mb-2 flex flex-wrap items-center gap-2 border-b pb-1.5">
            <h3 className="text-sm font-semibold">{group.label}</h3>
            <span className="text-muted-foreground text-xs">
              {group.items.length} 个素材
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {stageCounts(group.items).map(([label, count]) => (
                <Badge key={label} variant="secondary">
                  {label} {count}
                </Badge>
              ))}
            </div>
          </header>

          <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.items.map((asset) => {
              const date = dateOf(asset);

              return (
                <li
                  key={asset.id}
                  draggable={!isMobile}
                  data-testid="asset-timeline-card"
                  onDragStart={(event) => {
                    setDragId(asset.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", asset.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setOverId(asset.id);
                  }}
                  onDragLeave={() => {
                    setOverId((current) =>
                      current === asset.id ? null : current
                    );
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(asset.id);
                  }}
                  className={cn(
                    "group border-border bg-background hover:border-primary/40 relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border transition-all hover:shadow-sm",
                    dragId === asset.id && "opacity-50",
                    overId === asset.id &&
                      dragId !== asset.id &&
                      "border-primary ring-primary/30 ring-2"
                  )}
                  onClick={() => {
                    setPreview(asset);
                  }}
                >
                  <div className="relative w-full">
                    <AssetThumb
                      asset={asset}
                      className="aspect-square w-full rounded-none"
                    />
                    {isMobile ? null : (
                      <GripVerticalIcon
                        className="text-muted-foreground/70 absolute top-2 left-2 size-4 cursor-grab drop-shadow"
                        data-testid="asset-timeline-drag-handle"
                      />
                    )}
                  </div>

                  <div className="min-w-0 p-2">
                    <p
                      className="truncate text-xs font-medium"
                      title={asset.originalName}
                    >
                      {asset.originalName}
                    </p>
                    <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1 text-[11px]">
                      <span className="shrink-0 tabular-nums">
                        {date ? timeFormatter.format(date) : "—"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">
                        {stageLabel(asset.stage)}
                        {asset.bodyPart ? ` · ${asset.bodyPart}` : ""}
                      </span>
                    </div>
                  </div>

                  <div
                    className="bg-background/90 absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-md p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      title="编辑素材信息"
                      aria-label={`编辑 ${asset.originalName}`}
                      onClick={() => {
                        setMetaAsset(asset);
                      }}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      title="删除素材"
                      aria-label={`删除 ${asset.originalName}`}
                      disabled={deletingId === asset.id}
                      onClick={() => {
                        setDeleteTarget(asset);
                      }}
                    >
                      {deletingId === asset.id ? (
                        <Loader2Icon className="animate-spin" />
                      ) : (
                        <Trash2Icon className="text-destructive" />
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <AssetPreview
        asset={preview}
        open={preview !== null}
        onOpenChange={(value) => {
          if (!value) {
            setPreview(null);
          }
        }}
        items={order}
        onUploaded={() => onChanged?.()}
      />

      <AssetMetaDialog
        asset={metaAsset}
        open={metaAsset !== null}
        onOpenChange={(value) => {
          if (!value) {
            setMetaAsset(null);
          }
        }}
        onSaved={() => onChanged?.()}
      />

      <ConfirmDialog
        description={`将从时间线中移除「${deleteTarget?.originalName ?? ""}」，文件会保留一段时间以便恢复。`}
        isPending={remove.isPending}
        onConfirm={confirmRemove}
        onOpenChange={(value) => {
          if (!value) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title={`删除「${deleteTarget?.originalName ?? ""}」？`}
        tone="destructive"
      />
    </div>
  );
};
