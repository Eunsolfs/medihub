import type { LucideIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** 传入后整卡可点击，跳转到对应列表 */
  href?: string;
  className?: string;
}

export const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  href,
  className,
}: StatCardProps) => {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        {Icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg"
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint === undefined ? null : (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </>
  );

  const cardClassName = cn(
    "bg-card ring-foreground/10 grid gap-2 rounded-xl p-4 ring-1 transition-colors",
    href === undefined ? undefined : "hover:ring-foreground/20",
    className
  );

  if (href === undefined) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <a className={cardClassName} href={href}>
      {content}
    </a>
  );
};
