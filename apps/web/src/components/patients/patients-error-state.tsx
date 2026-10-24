import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

interface PatientsErrorStateProps {
  /** 已经站在边界上解析好的错误文案。 */
  message: string;
  title?: string;
  onRetry?: () => void;
}

/** 页面级错误态：渲染在路由 errorComponent 里，也可以单独复用。 */
export const PatientsErrorState = ({
  message,
  title = "数据加载失败",
  onRetry,
}: PatientsErrorStateProps) => (
  <div
    className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center"
    role="alert"
  >
    <span
      aria-hidden="true"
      className="bg-destructive/10 text-destructive mb-3 grid size-11 place-items-center rounded-full"
    >
      <TriangleAlertIcon className="size-5" />
    </span>
    <p className="text-sm font-medium">{title}</p>
    <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
      {message || "请检查网络后重试。"}
    </p>
    {onRetry ? (
      <Button className="mt-4" onClick={onRetry} size="sm" variant="outline">
        <RefreshCwIcon />
        重新加载
      </Button>
    ) : null}
  </div>
);
