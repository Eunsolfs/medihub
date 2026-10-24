import { KeyRoundIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

interface PostPasswordBadgeProps {
  className?: string;
  /** 编辑器里可用「已设置密码」区分状态。 */
  label?: string;
}

/** 「任何人可读 + 已设访问密码」的帖子徽标，列表卡片与编辑器共用。 */
export const PostPasswordBadge = ({
  className,
  label = "密码",
}: PostPasswordBadgeProps) => (
  <span
    className={cn(
      "bg-warning/10 text-warning inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-4xl px-2 text-xs font-medium whitespace-nowrap",
      className
    )}
  >
    <KeyRoundIcon aria-hidden="true" className="size-3" />
    {label}
  </span>
);
