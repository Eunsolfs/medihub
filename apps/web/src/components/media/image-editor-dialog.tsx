import {
  Loader2Icon,
  RotateCcwIcon,
  RotateCwIcon,
  SaveIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Progress } from "@medihub/ui/components/progress";
import { cn } from "@medihub/ui/lib/utils";

import { formatBytes } from "#src/lib/format.ts";
import { replaceFile, uploadFile } from "#src/lib/upload.ts";
import type { UploadedAsset } from "#src/lib/upload.ts";

import type { MediaAsset } from "./types.ts";
import {
  assetFileUrl,
  bumpAssetVersion,
  isImageAsset,
  uploadTargetFromAsset,
} from "./types.ts";

export interface ImageEditorDialogProps {
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存为新素材后回调，页面据此刷新列表。 */
  onUploaded?: (asset: UploadedAsset) => void;
}

type AspectKey = "free" | "1:1" | "4:3" | "3:2";

interface CropRect {
  /** 相对旋转后整图的归一化坐标（0–1）。 */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EditorSnapshot {
  rotation: number;
  crop: CropRect;
  aspect: AspectKey;
}

interface DragState {
  mode: "move" | "nw" | "ne" | "sw" | "se";
  pointerId: number;
  startX: number;
  startY: number;
  bounds: { width: number; height: number };
  startCrop: CropRect;
}

const ASPECTS: { key: AspectKey; label: string; ratio: number | null }[] = [
  { key: "free", label: "自由", ratio: null },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "3:2", label: "3:2", ratio: 3 / 2 },
];

const MIN_CROP = 0.04;
const FULL_CROP: CropRect = { h: 1, w: 1, x: 0, y: 0 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const rotatedSize = (width: number, height: number, rotation: number) =>
  rotation % 180 === 0 ? { height, width } : { height: width, width: height };

/** 在给定整图尺寸下，居中取最大比例框；比例按像素计算。 */
const centeredCrop = (
  ratio: number | null,
  size: { width: number; height: number }
): CropRect => {
  if (!ratio || size.width <= 0 || size.height <= 0) {
    return { ...FULL_CROP };
  }

  const k = (ratio * size.height) / size.width;
  let width = 1;
  let height = 1;

  if (k <= 1) {
    width = k;
  } else {
    height = 1 / k;
  }

  return { h: height, w: width, x: (1 - width) / 2, y: (1 - height) / 2 };
};

const ratioK = (
  ratio: number | null,
  size: { width: number; height: number }
) => (ratio && size.width > 0 ? (ratio * size.height) / size.width : null);

export const ImageEditorDialog = ({
  asset,
  open,
  onOpenChange,
  onUploaded,
}: ImageEditorDialogProps) => {
  const content = asset ? (
    <EditorBody
      asset={asset}
      key={asset.id}
      onOpenChange={onOpenChange}
      onUploaded={onUploaded}
    />
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[100dvh] w-screen max-w-none sm:h-[min(92vh,900px)] sm:w-[min(96vw,1400px)] sm:max-w-[min(96vw,1400px)]"
        showCloseButton={false}
        variant="flush"
      >
        <div
          className="bg-background flex size-full min-h-0 flex-col overflow-hidden"
          data-testid="image-editor"
        >
          <div className="border-border flex min-h-12 shrink-0 items-center gap-2 border-b px-2 py-1.5 sm:px-3">
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle>
                <span className="block truncate">编辑图片</span>
              </DialogTitle>
              <DialogDescription>
                <span className="text-muted-foreground block truncate text-xs">
                  {asset?.originalName ?? ""}
                </span>
              </DialogDescription>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 sm:size-8"
              onClick={() => onOpenChange(false)}
              aria-label="关闭图片编辑器"
            >
              <XIcon />
            </Button>
          </div>

          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface EditorBodyProps {
  asset: MediaAsset;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (asset: UploadedAsset) => void;
}

const EditorBody = ({ asset, onOpenChange, onUploaded }: EditorBodyProps) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<CropRect>({ ...FULL_CROP });
  const [aspect, setAspect] = useState<AspectKey>("free");
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [busy, setBusy] = useState<"create" | "replace" | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [savePercent, setSavePercent] = useState(0);
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const [dragging, setDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const workingCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // 归档素材的原文件可能已移出服务器，覆盖会 404；非图片素材本就没有覆盖语义。
  const isArchived =
    asset.archivedAt !== null &&
    asset.archivedAt !== undefined &&
    asset.archivedAt !== "";

  const isImage = isImageAsset(asset);
  const canReplace = isImage && !isArchived;

  useEffect(() => {
    const element = new Image();

    const handleLoad = () => {
      setImage(element);
    };

    const handleError = () => {
      setLoadError(true);
    };

    element.addEventListener("load", handleLoad);
    element.addEventListener("error", handleError);
    // 同源直链，浏览器自动带会话 cookie；避免 blob URL 在 StrictMode 下被提前 revoke。
    element.src = assetFileUrl(asset.id);

    return () => {
      element.removeEventListener("load", handleLoad);
      element.removeEventListener("error", handleError);
    };
  }, [asset.id]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;

      if (entry) {
        setViewport({
          height: entry.contentRect.height,
          width: entry.contentRect.width,
        });
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const size = useMemo(
    () =>
      image
        ? rotatedSize(image.naturalWidth, image.naturalHeight, rotation)
        : { height: 0, width: 0 },
    [image, rotation]
  );

  const display = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) {
      return { height: 0, width: 0 };
    }

    const availableWidth = Math.max(1, viewport.width - 24);
    const availableHeight = Math.max(1, viewport.height - 24);

    const scale = Math.min(
      availableWidth / size.width,
      availableHeight / size.height
    );

    return {
      height: Math.max(1, Math.round(size.height * scale)),
      width: Math.max(1, Math.round(size.width * scale)),
    };
  }, [size, viewport]);

  // 把旋转后的完整图片画到工作画布；裁剪只读取这块画布的区域。
  useEffect(() => {
    const canvas = workingCanvasRef.current;

    if (!(canvas && image)) {
      return;
    }

    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, size.width, size.height);
    context.save();
    context.translate(size.width / 2, size.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    context.restore();
  }, [image, rotation, size]);

  // 侧栏实时预览：直接从工作画布取裁剪区域缩小绘制。
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const source = workingCanvasRef.current;

    if (!(canvas && source && image) || size.width <= 0) {
      return;
    }

    const sourceX = Math.round(crop.x * size.width);
    const sourceY = Math.round(crop.y * size.height);
    const sourceWidth = Math.max(1, Math.round(crop.w * size.width));
    const sourceHeight = Math.max(1, Math.round(crop.h * size.height));
    const scale = Math.min(240 / sourceWidth, 180 / sourceHeight, 1);

    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
  }, [crop, image, size]);

  const snapshot = (): EditorSnapshot => ({ aspect, crop, rotation });

  const pushHistory = () => {
    setHistory((current) => [...current.slice(-19), snapshot()]);
  };

  const handleRotate = (delta: number) => {
    pushHistory();

    const nextRotation = (rotation + delta + 360) % 360;

    const nextSize = rotatedSize(
      image?.naturalWidth ?? 0,
      image?.naturalHeight ?? 0,
      nextRotation
    );

    const active = ASPECTS.find((item) => item.key === aspect);

    setRotation(nextRotation);
    setCrop(centeredCrop(active?.ratio ?? null, nextSize));
  };

  const handleAspect = (key: AspectKey) => {
    if (key === aspect) {
      return;
    }

    pushHistory();
    setAspect(key);

    const active = ASPECTS.find((item) => item.key === key);

    setCrop(centeredCrop(active?.ratio ?? null, size));
  };

  const undo = () => {
    setHistory((current) => {
      const previous = current.at(-1);

      if (!previous) {
        return current;
      }

      setRotation(previous.rotation);
      setCrop(previous.crop);
      setAspect(previous.aspect);

      return current.slice(0, -1);
    });
  };

  const reset = () => {
    setHistory([]);
    setRotation(0);
    setCrop({ ...FULL_CROP });
    setAspect("free");
  };

  const startDrag = (
    event: PointerEvent<HTMLElement>,
    mode: DragState["mode"]
  ) => {
    const bounds = stageRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    dragRef.current = {
      bounds: { height: bounds.height, width: bounds.width },
      mode,
      pointerId: event.pointerId,
      startCrop: crop,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = (event.clientX - drag.startX) / drag.bounds.width;
    const dy = (event.clientY - drag.startY) / drag.bounds.height;

    if (drag.mode === "move") {
      setCrop({
        ...drag.startCrop,
        x: clamp(drag.startCrop.x + dx, 0, 1 - drag.startCrop.w),
        y: clamp(drag.startCrop.y + dy, 0, 1 - drag.startCrop.h),
      });

      return;
    }

    const active = ASPECTS.find((item) => item.key === aspect);
    const k = ratioK(active?.ratio ?? null, size);
    const east = drag.mode.includes("e");
    const south = drag.mode.includes("s");

    let width = Math.max(MIN_CROP, drag.startCrop.w + (east ? dx : -dx));

    let height = Math.max(MIN_CROP, drag.startCrop.h + (south ? dy : -dy));

    if (k) {
      if (width / drag.startCrop.w >= height / drag.startCrop.h) {
        height = width / k;
      } else {
        width = height * k;
      }

      const maxWidth = east
        ? 1 - drag.startCrop.x
        : drag.startCrop.x + drag.startCrop.w;

      const maxHeight = south
        ? 1 - drag.startCrop.y
        : drag.startCrop.y + drag.startCrop.h;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / k;
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = height * k;
      }
    }

    width = Math.min(
      width,
      east ? 1 - drag.startCrop.x : drag.startCrop.x + drag.startCrop.w
    );
    height = Math.min(
      height,
      south ? 1 - drag.startCrop.y : drag.startCrop.y + drag.startCrop.h
    );

    const x = east
      ? drag.startCrop.x
      : drag.startCrop.x + drag.startCrop.w - width;

    const y = south
      ? drag.startCrop.y
      : drag.startCrop.y + drag.startCrop.h - height;

    setCrop({
      h: height,
      w: width,
      x: clamp(x, 0, 1 - width),
      y: clamp(y, 0, 1 - height),
    });
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current) {
      return;
    }

    dragRef.current = null;
    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  interface ExportMeta {
    mime: string;
    extension: string;
    baseName: string;
    width: number;
    height: number;
  }

  const exportBlob = (onBlob: (blob: Blob, meta: ExportMeta) => void) => {
    if (!image || size.width <= 0 || busy) {
      return;
    }

    const source = workingCanvasRef.current;

    if (!source) {
      return;
    }

    const sourceX = Math.round(crop.x * size.width);
    const sourceY = Math.round(crop.y * size.height);
    const sourceWidth = Math.max(1, Math.round(crop.w * size.width));
    const sourceHeight = Math.max(1, Math.round(crop.h * size.height));
    const output = document.createElement("canvas");

    output.width = sourceWidth;
    output.height = sourceHeight;

    const context = output.getContext("2d");

    if (!context) {
      toast.error("生成图片失败，请重试");

      return;
    }

    context.drawImage(
      source,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    const mime = asset.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
    const extension = mime === "image/jpeg" ? "jpg" : "png";
    const baseName = asset.originalName.replace(/\.[^.]+$/u, "") || "图片";

    const meta: ExportMeta = {
      baseName,
      extension,
      height: sourceHeight,
      mime,
      width: sourceWidth,
    };

    output.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("生成图片失败，请重试");

          return;
        }

        onBlob(blob, meta);
      },
      mime,
      0.92
    );
  };

  const persistNewAsset = async (blob: Blob, meta: ExportMeta) => {
    setBusy("create");
    setSavePercent(0);

    try {
      const file = new File(
        [blob],
        `${meta.baseName}-已编辑.${meta.extension}`,
        {
          type: meta.mime,
        }
      );

      const uploaded = await uploadFile(
        file,
        uploadTargetFromAsset(asset),
        (percent) => {
          setSavePercent(percent);
        }
      );

      toast.success("已保存为新素材");
      onUploaded?.(uploaded);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "保存新素材失败，请重试"
      );
    } finally {
      setBusy(null);
      setSavePercent(0);
    }
  };

  const persistReplace = async (blob: Blob, meta: ExportMeta) => {
    setBusy("replace");
    setSavePercent(0);

    try {
      const file = new File([blob], asset.originalName, { type: meta.mime });

      const replaced = await replaceFile(file, asset.id, {
        height: meta.height,
        onProgress: (percent) => {
          setSavePercent(percent);
        },
        width: meta.width,
      });

      bumpAssetVersion(asset.id);
      toast.success("已覆盖原素材");

      const capturedAt =
        asset.capturedAt instanceof Date
          ? asset.capturedAt.toISOString()
          : typeof asset.capturedAt === "string"
            ? asset.capturedAt
            : null;

      onUploaded?.({
        admissionId: asset.admissionId ?? null,
        byteSize: replaced.byteSize,
        capturedAt,
        height: meta.height,
        id: replaced.id,
        kind: replaced.kind,
        mimeType: replaced.mimeType,
        originalName: replaced.originalName,
        stage: asset.stage ?? null,
        url: replaced.url,
        visibility: asset.visibility === "private" ? "private" : "org",
        width: meta.width,
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "覆盖原素材失败，请重试"
      );
    } finally {
      setBusy(null);
      setSavePercent(0);
    }
  };

  const handleCreate = () => {
    exportBlob((blob, meta) => {
      void persistNewAsset(blob, meta);
    });
  };

  const handleReplace = () => {
    if (!canReplace) {
      return;
    }

    setConfirmReplace(false);
    exportBlob((blob, meta) => {
      void persistReplace(blob, meta);
    });
  };

  const activeAspect = ASPECTS.find((item) => item.key === aspect);

  if (loadError) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
        图片加载失败，无法编辑。
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
      <div
        ref={containerRef}
        className="relative flex min-h-[38dvh] flex-1 items-center justify-center overflow-hidden bg-black/95 p-3 sm:min-h-0"
      >
        {image ? (
          <div
            ref={stageRef}
            className={cn(
              "relative touch-none select-none",
              dragging ? "cursor-grabbing" : "cursor-default"
            )}
            style={{ height: display.height, width: display.width }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <canvas
              ref={workingCanvasRef}
              className="block size-full"
              style={{ height: display.height, width: display.width }}
            />
            <div className="absolute inset-0">
              <div
                aria-hidden="true"
                className="absolute bg-black/55"
                style={{
                  height: `${crop.y * 100}%`,
                  left: 0,
                  top: 0,
                  width: "100%",
                }}
              />
              <div
                aria-hidden="true"
                className="absolute bg-black/55"
                style={{
                  bottom: 0,
                  height: `${(1 - crop.y - crop.h) * 100}%`,
                  left: 0,
                  width: "100%",
                }}
              />
              <div
                aria-hidden="true"
                className="absolute bg-black/55"
                style={{
                  height: `${crop.h * 100}%`,
                  left: 0,
                  top: `${crop.y * 100}%`,
                  width: `${crop.x * 100}%`,
                }}
              />
              <div
                aria-hidden="true"
                className="absolute bg-black/55"
                style={{
                  height: `${crop.h * 100}%`,
                  left: `${(crop.x + crop.w) * 100}%`,
                  top: `${crop.y * 100}%`,
                  right: 0,
                }}
              />
              <div
                className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                data-crop={`${crop.w.toFixed(3)}x${crop.h.toFixed(3)}`}
                data-testid="image-crop-box"
                style={{
                  height: `${crop.h * 100}%`,
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                }}
                onPointerDown={(event) => startDrag(event, "move")}
              >
                {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                  <span
                    key={corner}
                    role="presentation"
                    className={cn(
                      "absolute size-4 rounded-sm border border-black/40 bg-white sm:size-3",
                      corner === "nw" && "-top-2 -left-2 cursor-nwse-resize",
                      corner === "ne" && "-top-2 -right-2 cursor-nesw-resize",
                      corner === "sw" && "-bottom-2 -left-2 cursor-nesw-resize",
                      corner === "se" && "-right-2 -bottom-2 cursor-nwse-resize"
                    )}
                    onPointerDown={(event) => startDrag(event, corner)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            正在准备画布…
          </div>
        )}
      </div>

      <aside className="border-border bg-background flex max-h-[46dvh] shrink-0 flex-col gap-3 overflow-y-auto border-t p-3 sm:max-h-none sm:w-72 sm:border-t-0 sm:border-l">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 sm:h-8"
            onClick={undo}
            disabled={history.length === 0}
          >
            <Undo2Icon />
            撤销
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 sm:h-8"
            onClick={reset}
          >
            <RotateCcwIcon />
            重置
          </Button>
        </div>

        <div className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">旋转</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 sm:h-8"
              onClick={() => handleRotate(-90)}
            >
              <RotateCcwIcon />
              左转 90°
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 sm:h-8"
              onClick={() => handleRotate(90)}
            >
              <RotateCwIcon />
              右转 90°
            </Button>
          </div>
        </div>

        <div className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">裁剪比例</span>
          <div className="grid grid-cols-4 gap-1.5">
            {ASPECTS.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant={item.key === aspect ? "secondary" : "outline"}
                className="h-11 sm:h-8"
                onClick={() => handleAspect(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="hidden gap-1.5 sm:grid">
          <span className="text-muted-foreground text-xs">实时预览</span>
          <div className="bg-muted/40 border-border flex h-36 items-center justify-center overflow-hidden rounded-lg border">
            <canvas ref={previewCanvasRef} className="max-h-full max-w-full" />
          </div>
          <p className="text-muted-foreground text-xs">
            {activeAspect?.ratio
              ? `当前比例 ${activeAspect.label}`
              : "自由裁剪：拖动选框与四角调整区域"}
          </p>
        </div>

        <div className="mt-auto grid gap-2" data-testid="image-save-area">
          {busy ? (
            <div className="grid gap-1">
              <Progress value={savePercent} />
              <span className="text-muted-foreground text-xs">
                {busy === "replace" ? "正在覆盖" : "正在保存"} {savePercent}%
              </span>
            </div>
          ) : null}

          {confirmReplace && canReplace ? (
            <div className="border-destructive/40 bg-destructive/5 grid gap-2 rounded-lg border p-2">
              <p className="text-xs">覆盖后原图不可恢复，确认覆盖？</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:h-8"
                  onClick={() => setConfirmReplace(false)}
                  disabled={busy !== null}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 sm:h-8"
                  onClick={handleReplace}
                  disabled={busy !== null}
                >
                  确认覆盖
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-2",
                canReplace ? "grid-cols-2" : "grid-cols-1"
              )}
              data-testid="image-save-actions"
            >
              <Button
                type="button"
                className="h-11 sm:h-8"
                onClick={handleCreate}
                disabled={busy !== null || !image}
              >
                {busy === "create" ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SaveIcon />
                )}
                保存为新素材
              </Button>
              {isImage ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 sm:h-8"
                  onClick={() => setConfirmReplace(true)}
                  disabled={busy !== null || !image || !canReplace}
                >
                  覆盖原素材
                </Button>
              ) : null}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            className="h-11 sm:h-8"
            onClick={() => onOpenChange(false)}
            disabled={busy !== null}
          >
            取消
          </Button>
          {isArchived ? (
            <p className="text-destructive/90 text-xs">
              该素材已归档，原文件可能已移出服务器，无法覆盖；可以保存为新素材。
            </p>
          ) : isImage ? (
            <p className="text-muted-foreground text-xs">
              「保存为新素材」保留原图；「覆盖原素材」直接替换当前素材。
              {asset.byteSize ? ` 原图 ${formatBytes(asset.byteSize)}。` : ""}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              只有图片素材支持覆盖原素材；当前文件可以另存为新素材。
            </p>
          )}
        </div>
      </aside>
    </div>
  );
};
