import { CloudUploadIcon, Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Progress } from "@medihub/ui/components/progress";
import { cn } from "@medihub/ui/lib/utils";

import { uploadFiles } from "#src/lib/upload.ts";
import type { UploadedAsset, UploadTarget } from "#src/lib/upload.ts";

export type UploadButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link";

export type UploadButtonSize = "default" | "xs" | "sm" | "lg";

interface UploadQueueOptions {
  target: UploadTarget;
  onUploaded?: (assets: UploadedAsset[]) => void;
  onProgress?: (percent: number) => void;
}

interface UploadQueueState {
  active: boolean;
  percent: number;
  completed: number;
  total: number;
}

const useUploadQueue = ({
  target,
  onUploaded,
  onProgress,
}: UploadQueueOptions) => {
  const [state, setState] = useState<UploadQueueState>({
    active: false,
    completed: 0,
    percent: 0,
    total: 0,
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const start = async (files: File[]) => {
    if (files.length === 0 || abortRef.current) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ active: true, completed: 0, percent: 0, total: files.length });

    try {
      const uploaded = await uploadFiles(
        files,
        target,
        (file, percent) => {
          const index = files.indexOf(file);
          const done = index === -1 ? 0 : index;

          const overall = Math.round(
            ((done + percent / 100) / files.length) * 100
          );

          setState({
            active: true,
            completed: done,
            percent: overall,
            total: files.length,
          });
          onProgress?.(overall);
        },
        controller.signal
      );

      setState({
        active: false,
        completed: files.length,
        percent: 100,
        total: files.length,
      });
      toast.success(
        uploaded.length === 1
          ? `「${uploaded[0]?.originalName ?? "文件"}」上传成功`
          : `已上传 ${uploaded.length} 个文件`
      );
      onUploaded?.(uploaded);
    } catch (error) {
      const cancelled = error instanceof Error && error.name === "AbortError";

      setState({
        active: false,
        completed: 0,
        percent: 0,
        total: files.length,
      });

      if (cancelled) {
        toast.info("已取消上传");
      } else {
        toast.error(
          error instanceof Error ? error.message : "上传失败，请稍后重试"
        );
      }
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return { cancel, start, state };
};

const UploadProgress = ({
  state,
  onCancel,
  className,
}: {
  state: UploadQueueState;
  onCancel: () => void;
  className?: string;
}) => {
  if (!state.active) {
    return null;
  }

  return (
    <div
      className={cn("flex w-full min-w-40 items-center gap-2", className)}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Progress value={state.percent} className="flex-1" />
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {state.percent}%
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onCancel}
        aria-label="取消上传"
        title="取消上传"
      >
        <XIcon />
      </Button>
    </div>
  );
};

export interface UploadButtonProps {
  target: UploadTarget;
  onUploaded?: (assets: UploadedAsset[]) => void;
  accept?: string;
  /** 移动端唤起相机：environment=后置、user=前置；桌面浏览器会忽略。 */
  capture?: "environment" | "user";
  multiple?: boolean;
  label?: string;
  variant?: UploadButtonVariant;
  size?: UploadButtonSize;
  disabled?: boolean;
  className?: string;
}

/** 单按钮上传：进度条 + toast，选中文件后立刻传，传完把素材数组交给调用方刷新列表。 */
export const UploadButton = ({
  target,
  onUploaded,
  accept,
  capture,
  multiple = true,
  label = "上传",
  variant = "default",
  size = "default",
  disabled = false,
  className,
}: UploadButtonProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const { cancel, start, state } = useUploadQueue({ target, onUploaded });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        data-testid="upload-button-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];

          event.target.value = "";
          void start(files);
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={variant}
          size={size}
          disabled={disabled || state.active}
          onClick={() => inputRef.current?.click()}
        >
          {state.active ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UploadIcon />
          )}
          {state.active ? `上传中 ${state.percent}%` : label}
        </Button>
        <UploadProgress state={state} onCancel={cancel} />
      </div>
    </div>
  );
};

export interface UploadDropzoneProps {
  target: UploadTarget;
  onUploaded?: (assets: UploadedAsset[]) => void;
  accept?: string;
  /** 提示文案，例如「拖入影像、视频或文档，单个不超过 200MB」。 */
  hint?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

/** 拖拽上传区：点击也能选文件，拖入时高亮边框。 */
export const UploadDropzone = ({
  target,
  onUploaded,
  accept,
  hint = "拖拽文件到这里，或点击选择文件",
  multiple = true,
  disabled = false,
  className,
}: UploadDropzoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { cancel, start, state } = useUploadQueue({ target, onUploaded });

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    if (disabled || state.active) {
      return;
    }

    void start([...event.dataTransfer.files]);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => {
        if (!(disabled || state.active)) {
          inputRef.current?.click();
        }
      }}
      onKeyDown={(event) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          !(disabled || state.active)
        ) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();

        if (!(disabled || state.active)) {
          setDragging(true);
        }
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-ring flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2",
        dragging && "border-primary bg-primary/5",
        (disabled || state.active) && "pointer-events-none opacity-60",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        data-testid="upload-dropzone-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];

          event.target.value = "";
          void start(files);
        }}
      />
      <CloudUploadIcon className="text-muted-foreground size-7" />
      <p className="text-sm font-medium">
        {state.active ? `正在上传 ${state.percent}%` : hint}
      </p>
      <p className="text-muted-foreground text-xs">
        支持图片、视频、PDF 与 Office 文档
      </p>
      <UploadProgress state={state} onCancel={cancel} className="max-w-64" />
    </div>
  );
};
