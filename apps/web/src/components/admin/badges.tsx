import type { ReactNode } from "react";

import { cn } from "@medihub/ui/lib/utils";

const TONE_CLASSES = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
} as const;

export type PillTone = keyof typeof TONE_CLASSES;

interface PillProps {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}

/** 管理端小标签：角色、状态、驱动与操作类型共用一套取色。 */
export const Pill = ({ tone = "neutral", className, children }: PillProps) => (
  <span
    className={cn(
      "inline-flex h-5 w-fit shrink-0 items-center rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
      TONE_CLASSES[tone],
      className
    )}
  >
    {children}
  </span>
);
