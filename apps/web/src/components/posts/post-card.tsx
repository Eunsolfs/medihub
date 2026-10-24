import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  CopyIcon,
  EyeIcon,
  FilmIcon,
  MoreHorizontalIcon,
  PencilIcon,
  QrCodeIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";

import { Button } from "@medihub/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@medihub/ui/components/dropdown-menu";
import { cn } from "@medihub/ui/lib/utils";

import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import { formatRelative } from "#src/lib/format.ts";

import { PostCover } from "./post-cover.tsx";
import { PostPasswordBadge } from "./post-password-badge.tsx";
import { statusLabelOf } from "./post-utils.ts";
import type { PostSummary } from "./post-utils.ts";
import { PostVisibilityBadge } from "./post-visibility-badge.tsx";

interface PostCardProps {
  canManage: boolean;
  isBusy?: boolean;
  item: PostSummary;
  onCopyLink: (item: PostSummary) => void;
  onDelete: (item: PostSummary) => void;
  onShare: (item: PostSummary) => void;
  onTogglePublish: (item: PostSummary) => void;
}

export const PostCard = ({
  canManage,
  isBusy = false,
  item,
  onCopyLink,
  onDelete,
  onShare,
  onTogglePublish,
}: PostCardProps) => {
  const navigate = useNavigate();
  const published = item.status === "published";

  return (
    <article className="group bg-card ring-foreground/10 relative flex flex-col overflow-hidden rounded-xl ring-1 transition-shadow hover:shadow-md">
      <Link
        aria-label={`打开文章 ${item.title}`}
        className="bg-muted relative block aspect-[16/9] overflow-hidden"
        params={{ slug: item.slug }}
        to="/p/$slug"
      >
        <PostCover
          assetId={item.coverAssetId}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          name={item.title}
        />
        <div className="bg-background/80 absolute inset-x-2 top-2 flex w-fit items-center gap-1 rounded-full p-1 backdrop-blur-sm">
          <span
            className={cn(
              "inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium",
              published
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            {published ? <CheckCircle2Icon className="size-3" /> : null}
            {statusLabelOf(item.status)}
          </span>
          <PostVisibilityBadge visibility={item.visibility} />
          {item.visibility === "public" && item.hasPassword ? (
            <PostPasswordBadge />
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          className="outline-none focus-visible:underline"
          params={{ slug: item.slug }}
          to="/p/$slug"
        >
          <h3 className="line-clamp-2 text-base leading-snug font-semibold text-balance">
            {item.title}
          </h3>
        </Link>

        <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm text-pretty">
          {item.excerpt ?? "还没有写摘要"}
        </p>

        <TagList
          className="mt-0.5"
          emptyText="无标签"
          max={3}
          tags={item.tags}
        />

        <div className="text-muted-foreground mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs">
          <span className="text-foreground/80 font-medium">
            {item.authorName ?? "未知作者"}
          </span>
          <span aria-hidden="true">·</span>
          <span>更新于 {formatRelative(item.updatedAt)}</span>
        </div>

        <div className="border-border/70 flex items-center justify-between border-t pt-2">
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <EyeIcon className="size-3.5" />
              {item.viewCount}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <FilmIcon className="size-3.5" />
              {item.mediaCount}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={`文章操作 ${item.title}`}
                  disabled={isBusy}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                onClick={() => {
                  void navigate({
                    params: { postId: item.id },
                    to: "/posts/$postId",
                  });
                }}
              >
                {canManage ? <PencilIcon /> : <EyeIcon />}
                {canManage ? "编辑" : "查看详情"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onCopyLink(item);
                }}
              >
                <CopyIcon />
                复制链接
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onShare(item);
                }}
              >
                <QrCodeIcon />
                二维码
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      onTogglePublish(item);
                    }}
                  >
                    {published ? <Undo2Icon /> : <SendIcon />}
                    {published ? "取消发布" : "发布"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      onDelete(item);
                    }}
                    variant="destructive"
                  >
                    <Trash2Icon />
                    删除
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
};
