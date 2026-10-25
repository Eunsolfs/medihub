import { CameraIcon, Loader2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

import { uploadFile } from "#src/lib/upload.ts";
import type { UploadedAsset, UploadTarget } from "#src/lib/upload.ts";

interface CameraUploadButtonProps {
  target: UploadTarget;
  onUploaded: (assets: UploadedAsset[]) => void;
  /** 移动端唤起相机：environment=后置（默认）、user=前置。 */
  capture?: "environment" | "user";
  accept?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * 拍照 / 录像直接上传：安卓（含 PWA）点一下唤起相机，桌面浏览器退化为选择文件。
 * 与「上传素材」共用同一个 target，成功后交给调用方刷新时间线。
 */
export const CameraUploadButton = ({
  target,
  onUploaded,
  capture = "environment",
  accept = "image/*,video/*",
  label = "拍照上传",
  className,
  disabled = false,
}: CameraUploadButtonProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: readonly File[]) => {
    if (files.length === 0) {
      return;
    }

    setUploading(true);

    try {
      const uploaded: UploadedAsset[] = [];

      for (const file of files) {
        uploaded.push(await uploadFile(file, target));
      }

      toast.success(
        uploaded.length > 1 ? `已上传 ${uploaded.length} 个文件` : "照片已上传"
      );
      onUploaded(uploaded);
    } catch (error) {
      // 403 / 413 / 网络异常都由 uploadFile 抛出带后端 message 的 Error。
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "上传失败，请稍后重试"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        data-testid="camera-upload-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];

          event.target.value = "";
          void handleFiles(files);
        }}
      />
      <Button
        disabled={disabled || uploading}
        onClick={() => {
          inputRef.current?.click();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {uploading ? <Loader2Icon className="animate-spin" /> : <CameraIcon />}
        {uploading ? "上传中…" : label}
      </Button>
    </div>
  );
};
