import { GlobeIcon, LockIcon, LogInIcon, UsersIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@medihub/ui/lib/utils";

import {
  roleLabel,
  visibilityLabel,
  visibilityLabels,
} from "#src/lib/format.ts";
import type { VisibilityKey } from "#src/lib/format.ts";

const TONE_CLASSES = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
} as const;

type BadgeTone = keyof typeof TONE_CLASSES;

interface ToneBadgeProps {
  tone?: BadgeTone;
  className?: string;
  icon?: LucideIcon;
  children: ReactNode;
}

const ToneBadge = ({
  tone = "neutral",
  className,
  icon: Icon,
  children,
}: ToneBadgeProps) => (
  <span
    className={cn(
      "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
      TONE_CLASSES[tone],
      className
    )}
  >
    {Icon === undefined ? null : <Icon aria-hidden="true" className="size-3" />}
    {children}
  </span>
);

const roleTone = (role: string | undefined): BadgeTone => {
  if (role === "root") {
    return "primary";
  }

  if (role === "dept_admin") {
    return "info";
  }

  return "neutral";
};

interface RoleBadgeProps {
  role: string | undefined;
  className?: string;
}

export const RoleBadge = ({ role, className }: RoleBadgeProps) => (
  <ToneBadge className={className} tone={roleTone(role)}>
    {roleLabel(role)}
  </ToneBadge>
);

const VISIBILITY_META = {
  public: { tone: "success", icon: GlobeIcon },
  org: { tone: "info", icon: UsersIcon },
  logged_in: { tone: "primary", icon: LogInIcon },
  private: { tone: "neutral", icon: LockIcon },
} as const satisfies Record<
  VisibilityKey,
  { tone: BadgeTone; icon: LucideIcon }
>;

const isVisibilityKey = (value: string): value is VisibilityKey =>
  value in visibilityLabels;

interface VisibilityBadgeProps {
  visibility: string | undefined;
  className?: string;
}

/** 教学与分享的可见范围：任何人 / 仅登录用户 / 仅科室内部 / 仅自己。 */
export const VisibilityBadge = ({
  visibility,
  className,
}: VisibilityBadgeProps) => {
  if (visibility === undefined || !isVisibilityKey(visibility)) {
    return (
      <ToneBadge className={className} tone="neutral">
        {visibilityLabel(visibility)}
      </ToneBadge>
    );
  }

  const meta = VISIBILITY_META[visibility];

  return (
    <ToneBadge className={className} icon={meta.icon} tone={meta.tone}>
      {visibilityLabel(visibility)}
    </ToneBadge>
  );
};
