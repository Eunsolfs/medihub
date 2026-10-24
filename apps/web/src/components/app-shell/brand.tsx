import { HeartPulseIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

interface BrandProps {
  compact?: boolean;
  className?: string;
}

export const Brand = ({ compact = false, className }: BrandProps) => (
  <a
    aria-label="医档通工作台"
    className={cn(
      "focus-visible:ring-ring/50 group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3",
      className
    )}
    href="/dashboard"
  >
    <span
      aria-hidden="true"
      className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-xl"
    >
      <HeartPulseIcon className="size-5" strokeWidth={2.1} />
    </span>
    {compact ? null : (
      <span className="grid gap-0.5 leading-none">
        <span className="text-base font-semibold tracking-tight">医档通</span>
        <span className="text-muted-foreground text-xs font-medium tracking-widest">
          MEDIHUB
        </span>
      </span>
    )}
  </a>
);
