import { GraduationCapIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

import { AssetThumb } from "#src/components/media/index.ts";

import { assetLikeOf } from "./post-utils.ts";

interface PostCoverProps {
  assetId: string | null | undefined;
  className?: string;
  name?: string;
}

/** 帖子封面：有素材时用媒体工具箱的缩略图，没有就用渐变占位。 */
export const PostCover = ({ assetId, className, name }: PostCoverProps) =>
  assetId ? (
    <AssetThumb
      asset={assetLikeOf(assetId, { name })}
      className={cn("size-full object-cover", className)}
    />
  ) : (
    <div
      aria-hidden="true"
      className={cn(
        "from-primary/15 via-muted to-accent grid size-full place-items-center bg-gradient-to-br",
        className
      )}
    >
      <GraduationCapIcon
        className="text-muted-foreground/50 size-9"
        strokeWidth={1.5}
      />
    </div>
  );
