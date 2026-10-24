import type { ReactNode } from "react";

import { cn } from "@medihub/ui/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** 右侧操作区，移动端自动换行到标题下方 */
  actions?: ReactNode;
  /** 标题下方的元信息行：统计、更新时间、角色标签等 */
  meta?: ReactNode;
  className?: string;
}

export const PageHeader = ({
  title,
  description,
  actions,
  meta,
  className,
}: PageHeaderProps) => (
  <header
    className={cn(
      "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
      className
    )}
  >
    <div className="min-w-0 space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h1>
      {description === undefined ? null : (
        <p className="text-muted-foreground max-w-3xl text-sm text-pretty">
          {description}
        </p>
      )}
      {meta === undefined ? null : (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {meta}
        </div>
      )}
    </div>
    {actions === undefined ? null : (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    )}
  </header>
);
