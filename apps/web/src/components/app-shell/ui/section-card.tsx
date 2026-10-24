import type { ReactNode } from "react";

import { cn } from "@medihub/ui/lib/utils";

interface SectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** 标题行右侧：查看全部、切换视图等 */
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** 页面分区块：标题 + 说明 + 操作 + 内容，工作台与详情页统一使用。 */
export const SectionCard = ({
  title,
  description,
  action,
  footer,
  children,
  className,
  contentClassName,
}: SectionCardProps) => (
  <section
    className={cn(
      "bg-card text-card-foreground ring-foreground/10 overflow-hidden rounded-xl ring-1",
      className
    )}
  >
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <h2 className="font-heading text-base leading-snug font-medium">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
    <div className={cn("p-4", contentClassName)}>{children}</div>
    {footer === undefined ? null : (
      <div className="bg-muted/40 border-t px-4 py-3">{footer}</div>
    )}
  </section>
);
