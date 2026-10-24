import { InboxIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@medihub/ui/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState = ({
  title,
  description,
  icon: Icon = InboxIcon,
  action,
  compact = false,
  className,
}: EmptyStateProps) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center",
      compact ? "py-8" : "py-14",
      className
    )}
  >
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground mb-3 grid size-11 place-items-center rounded-full"
    >
      <Icon className="size-5" />
    </span>
    <p className="text-sm font-medium">{title}</p>
    {description === undefined ? null : (
      <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
        {description}
      </p>
    )}
    {action === undefined ? null : <div className="mt-4">{action}</div>}
  </div>
);
