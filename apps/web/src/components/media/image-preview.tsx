import {
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { PointerEvent } from "react";

import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

import type { MediaAsset } from "./types.ts";
import { assetFileUrl } from "./types.ts";

export interface ImagePreviewProps {
  asset: MediaAsset;
  onPrev?: () => void;
  onNext?: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

const clampScale = (value: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100));

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/**
 * 图片预览：object-contain 撑满可用区域，缩放 / 旋转 / 放大后拖拽平移 / 上下张。
 * 缩放在 1x 以下时自动把平移量归零，避免图片跑出可视区。
 */
export const ImagePreview = ({ asset, onPrev, onNext }: ImagePreviewProps) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const applyScale = (next: number) => {
    const clamped = clampScale(next);

    setScale(clamped);

    if (clamped <= 1) {
      setOffset({ x: 0, y: 0 });
    }
  };

  const zoom = (delta: number) => {
    applyScale(scale + delta);
  };

  const reset = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (event: PointerEvent<HTMLImageElement>) => {
    if (scale <= 1) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      originX: offset.x,
      originY: offset.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setPanning(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  };

  const endPan = (event: PointerEvent<HTMLImageElement>) => {
    if (!dragRef.current) {
      return;
    }

    dragRef.current = null;
    setPanning(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="relative flex size-full min-h-0 items-center justify-center overflow-hidden bg-black/95 select-none">
      {broken ? (
        <div className="p-6 text-center text-sm text-white/70">
          <p>图片加载失败，可能已从存储中移除。</p>
          <a
            href={`${assetFileUrl(asset.id)}/download`}
            className="text-primary mt-2 inline-block underline"
            download
          >
            下载原图
          </a>
        </div>
      ) : (
        <>
          {loaded ? null : (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="size-2/3 max-h-[70%] max-w-4xl animate-pulse rounded-lg bg-white/10" />
            </div>
          )}
          <img
            src={assetFileUrl(asset.id)}
            alt={asset.originalName}
            data-testid="asset-preview-image"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setBroken(true);
            }}
            onDoubleClick={() => {
              applyScale(scale === 1 ? 2 : 1);
              setOffset({ x: 0, y: 0 });
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            className={cn(
              "max-h-full max-w-full origin-center object-contain transition-transform duration-150",
              scale > 1 ? "cursor-grab" : "cursor-zoom-in",
              panning && "cursor-grabbing transition-none"
            )}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
            }}
          />
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 flex justify-center p-2 pb-3 sm:bottom-3 sm:p-0">
        <div
          className="bg-background/90 flex items-center gap-0.5 rounded-lg p-1 shadow-lg backdrop-blur"
          data-testid="image-toolbar"
        >
          {onPrev ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              onClick={onPrev}
              aria-label="上一张"
              title="上一张"
            >
              <ChevronLeftIcon />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-8"
            onClick={() => {
              zoom(-SCALE_STEP);
            }}
            aria-label="缩小"
            title="缩小"
          >
            <ZoomOutIcon />
          </Button>
          <span
            className="w-11 shrink-0 text-center text-xs tabular-nums sm:w-12"
            data-testid="image-zoom-percent"
          >
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-8"
            onClick={() => {
              zoom(SCALE_STEP);
            }}
            aria-label="放大"
            title="放大"
          >
            <ZoomInIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-8"
            onClick={() => {
              setRotation((current) => (current + 90) % 360);
            }}
            aria-label="旋转 90 度"
            title="旋转 90 度"
          >
            <RotateCwIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 sm:size-8"
            onClick={reset}
            aria-label="重置缩放与旋转"
            title="重置"
          >
            <RotateCcwIcon />
          </Button>
          {onNext ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 sm:size-8"
              onClick={onNext}
              aria-label="下一张"
              title="下一张"
            >
              <ChevronRightIcon />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
