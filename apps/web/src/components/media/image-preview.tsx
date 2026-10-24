import {
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";

import { assetFileUrl } from "./types.ts";
import type { MediaAsset } from "./types.ts";

export interface ImagePreviewProps {
  asset: MediaAsset;
  onPrev?: () => void;
  onNext?: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

/** 图片预览：缩放、旋转、上一张/下一张；双击在 1x 与 2x 间切换。 */
export const ImagePreview = ({ asset, onPrev, onNext }: ImagePreviewProps) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [broken, setBroken] = useState(false);

  const zoom = (delta: number) => {
    setScale((current) =>
      Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, Math.round((current + delta) * 100) / 100)
      )
    );
  };

  return (
    <div className="relative flex size-full min-h-0 items-center justify-center overflow-auto bg-black/90 p-4">
      {broken ? (
        <div className="text-center text-sm text-white/70">
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
        <img
          src={assetFileUrl(asset.id)}
          alt={asset.originalName}
          data-testid="asset-preview-image"
          onError={() => {
            setBroken(true);
          }}
          onDoubleClick={() => {
            setScale((current) => (current === 1 ? 2 : 1));
          }}
          className="max-h-full max-w-full origin-center object-contain transition-transform duration-150"
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
        />
      )}

      <div className="bg-background/90 absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg p-1 shadow-lg backdrop-blur">
        {onPrev ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
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
          size="icon-sm"
          onClick={() => {
            zoom(-0.25);
          }}
          aria-label="缩小"
          title="缩小"
        >
          <ZoomOutIcon />
        </Button>
        <span className="text-muted-foreground w-12 text-center text-xs tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            zoom(0.25);
          }}
          aria-label="放大"
          title="放大"
        >
          <ZoomInIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
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
          size="sm"
          onClick={() => {
            setScale(1);
            setRotation(0);
          }}
        >
          重置
        </Button>
        {onNext ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onNext}
            aria-label="下一张"
            title="下一张"
          >
            <ChevronRightIcon />
          </Button>
        ) : null}
      </div>
    </div>
  );
};
