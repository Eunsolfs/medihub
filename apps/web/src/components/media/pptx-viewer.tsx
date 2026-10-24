import { Loader2Icon } from "lucide-react";

import { PreviewFallback } from "./preview-fallback.tsx";
import type { MediaAsset } from "./types.ts";
import { usePdfProbe } from "./use-file-resource.ts";

export interface PptxViewerProps {
  asset: MediaAsset;
  enabled: boolean;
}

/**
 * pptx 没有浏览器本地渲染方案：先探测 /api/office/:id/pdf，
 * 200 则用 PDF iframe；501（未装 LibreOffice）降级为下载提示。
 */
export const PptxViewer = ({ asset, enabled }: PptxViewerProps) => {
  const probe = usePdfProbe(asset.id, enabled);

  if (probe === "loading") {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        正在转换演示文稿…
      </div>
    );
  }

  if (probe === "ready") {
    return (
      <iframe
        src={`/api/office/${asset.id}/pdf`}
        title={asset.originalName}
        className="bg-background size-full border-0"
      />
    );
  }

  if (probe === "error") {
    return (
      <PreviewFallback
        asset={asset}
        message="无法在线预览该演示文稿"
        hint="可下载后用本地 PowerPoint 打开；若服务器已安装 LibreOffice，请检查 SOFFICE_PATH 配置。"
      />
    );
  }

  return (
    <PreviewFallback
      asset={asset}
      message="服务器没有安装 LibreOffice，无法在线预览 PPT"
      hint="下载后用本地 PowerPoint 打开。管理员可在 .env 中设置 SOFFICE_PATH 开启在线预览。"
    />
  );
};
