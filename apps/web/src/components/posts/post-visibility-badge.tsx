import {
  GlobeIcon,
  LockIcon,
  LogInIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

import { visibilityLabelOf } from "./post-utils.ts";
import type { PostVisibility } from "./post-utils.ts";

interface VisibilityMeta {
  icon: LucideIcon;
  tone: string;
}

const VISIBILITY_META: Record<PostVisibility, VisibilityMeta> = {
  private: { icon: LockIcon, tone: "bg-muted text-muted-foreground" },
  org: { icon: UsersIcon, tone: "bg-info/10 text-info" },
  logged_in: { icon: LogInIcon, tone: "bg-primary/10 text-primary" },
  selected: { icon: UserCheckIcon, tone: "bg-warning/10 text-warning" },
  public: { icon: GlobeIcon, tone: "bg-success/10 text-success" },
};

const isPostVisibility = (value: string): value is PostVisibility =>
  Object.hasOwn(VISIBILITY_META, value);

interface PostVisibilityBadgeProps {
  className?: string;
  visibility: string | null | undefined;
}

/** 五档可见范围徽标（含后端新值 selected → 指定对象）。 */
export const PostVisibilityBadge = ({
  className,
  visibility,
}: PostVisibilityBadgeProps) => {
  const key: PostVisibility =
    visibility && isPostVisibility(visibility) ? visibility : "private";

  const meta = VISIBILITY_META[key];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
        meta.tone,
        className
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {visibilityLabelOf(visibility)}
    </span>
  );
};
