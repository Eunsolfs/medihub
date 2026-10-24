import {
  CheckCircle2Icon,
  ClockIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

import { exportStatusLabel } from "#src/components/exports/exports-api.ts";
import type { ExportStatus } from "#src/components/exports/exports-api.ts";

interface StatusMeta {
  className: string;
  icon: LucideIcon;
  spin?: boolean;
}

const PENDING_META: StatusMeta = {
  className: "bg-muted text-muted-foreground",
  icon: ClockIcon,
};

const STATUS_META: Record<ExportStatus, StatusMeta> = {
  failed: {
    className: "bg-destructive/10 text-destructive",
    icon: XCircleIcon,
  },
  pending: PENDING_META,
  ready: { className: "bg-success/10 text-success", icon: CheckCircle2Icon },
  running: { className: "bg-info/10 text-info", icon: Loader2Icon, spin: true },
};

interface ExportStatusBadgeProps {
  status: ExportStatus;
  className?: string;
}

/** 导出任务状态：排队中 / 打包中 / 已完成 / 失败。 */
export const ExportStatusBadge = ({
  status,
  className,
}: ExportStatusBadgeProps) => {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
        meta.className,
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3", meta.spin && "animate-spin")}
      />
      {exportStatusLabel(status)}
    </span>
  );
};
