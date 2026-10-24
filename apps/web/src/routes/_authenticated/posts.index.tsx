import {
  keepPreviousData,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import { GraduationCapIcon, PlusIcon } from "lucide-react";
import { Suspense, useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { isAdminRole } from "#src/components/app-shell/roles.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { PostCard } from "#src/components/posts/post-card.tsx";
import {
  defaultPostFilters,
  PostFilters,
} from "#src/components/posts/post-filters.tsx";
import type { PostFiltersState } from "#src/components/posts/post-filters.tsx";
import {
  copyText,
  publicPostUrl,
  sessionRoleOf,
} from "#src/components/posts/post-utils.ts";
import type { PostSummary } from "#src/components/posts/post-utils.ts";
import { SharePostDialog } from "#src/components/posts/share-dialog.tsx";
import { api } from "#src/lib/api.ts";
import type { VisibilityKey } from "#src/lib/format.ts";

const PAGE_SIZE = 9;

const errorMessageOf = (error: unknown): string =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : "操作失败，请稍后重试";

const statusFilterOf = (value: string): "draft" | "published" | undefined => {
  if (value === "draft" || value === "published") {
    return value;
  }

  return undefined;
};

const visibilityFilterOf = (value: string): VisibilityKey | undefined => {
  if (
    value === "private" ||
    value === "org" ||
    value === "logged_in" ||
    value === "public"
  ) {
    return value;
  }

  return undefined;
};

const hasActiveFilters = (filters: PostFiltersState): boolean =>
  filters.mine ||
  filters.q.trim().length > 0 ||
  filters.status !== "all" ||
  filters.visibility !== "all";

interface PostsResultsProps {
  canManageAll: boolean;
  filters: PostFiltersState;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  page: number;
  query: string;
  viewerName: string | undefined;
}

const PostsResults = ({
  canManageAll,
  filters,
  onClearFilters,
  onPageChange,
  page,
  query,
  viewerName,
}: PostsResultsProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sharing, setSharing] = useState<PostSummary | null>(null);
  const [deleting, setDeleting] = useState<PostSummary | null>(null);

  const listQuery = useSuspenseQuery(
    api.posts.list.queryOptions({
      input: {
        mine: filters.mine,
        page,
        pageSize: PAGE_SIZE,
        q: query.length > 0 ? query : undefined,
        status: statusFilterOf(filters.status),
        visibility: visibilityFilterOf(filters.visibility),
      },
      placeholderData: keepPreviousData,
    })
  );

  const publishMutation = useMutation(
    api.posts.publish.mutationOptions({
      onError: (error) => {
        toast.error(errorMessageOf(error));
      },
      onSuccess: (updated) => {
        void queryClient.invalidateQueries({ queryKey: api.posts.list.key() });
        toast.success(
          updated.status === "published"
            ? `《${updated.title}》已发布`
            : `《${updated.title}》已取消发布`
        );
      },
    })
  );

  const removeMutation = useMutation(
    api.posts.remove.mutationOptions({
      onError: (error) => {
        toast.error(errorMessageOf(error));
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: api.posts.list.key() });
        setDeleting(null);
        toast.success("文章已删除");
      },
    })
  );

  const canManage = (item: PostSummary): boolean =>
    canManageAll ||
    (viewerName !== undefined && item.authorName === viewerName);

  const handleCopyLink = async (item: PostSummary) => {
    try {
      await copyText(publicPostUrl(item.slug));
      toast.success("分享链接已复制");
    } catch (error) {
      toast.error(errorMessageOf(error));
    }
  };

  const handleTogglePublish = (item: PostSummary) => {
    publishMutation.mutate({
      id: item.id,
      published: item.status !== "published",
    });
  };

  const { items } = listQuery.data;

  if (items.length === 0) {
    return (
      <EmptyState
        action={
          hasActiveFilters(filters) ? (
            <Button onClick={onClearFilters} variant="outline">
              清除筛选
            </Button>
          ) : (
            <Button
              onClick={() => {
                void navigate({ to: "/posts/new" });
              }}
            >
              <PlusIcon />
              写第一篇教学文章
            </Button>
          )
        }
        description={
          hasActiveFilters(filters)
            ? "换个关键词，或放宽状态与可见范围试试。"
            : "把科室的手术经验、病例复盘和操作规范沉淀成可分享的文章，支持视频与二维码分享。"
        }
        icon={GraduationCapIcon}
        title={
          hasActiveFilters(filters) ? "没有符合条件的文章" : "还没有教学文章"
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <PostCard
            canManage={canManage(item)}
            isBusy={publishMutation.isPending || removeMutation.isPending}
            item={item}
            key={item.id}
            onCopyLink={(target) => {
              void handleCopyLink(target);
            }}
            onDelete={setDeleting}
            onShare={setSharing}
            onTogglePublish={handleTogglePublish}
          />
        ))}
      </div>

      {listQuery.data.total > PAGE_SIZE ? (
        <PaginationBar
          className="pt-2"
          onPageChange={onPageChange}
          page={page}
          pageSize={PAGE_SIZE}
          total={listQuery.data.total}
        />
      ) : null}

      <SharePostDialog
        onOpenChange={(open) => {
          if (!open) {
            setSharing(null);
          }
        }}
        open={sharing !== null}
        slug={sharing?.slug ?? ""}
        title={sharing?.title ?? ""}
      />

      <ConfirmDialog
        confirmLabel="删除文章"
        description={
          deleting
            ? `《${deleting.title}》删除后分享链接会失效，正文和附件都无法恢复。`
            : undefined
        }
        isPending={removeMutation.isPending}
        onConfirm={() => {
          if (deleting) {
            removeMutation.mutate({ id: deleting.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        open={deleting !== null}
        title={`删除${deleting ? `《${deleting.title}》` : "文章"}？`}
        tone="destructive"
      />
    </div>
  );
};

const PostsGridSkeleton = () => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: PAGE_SIZE }, (_, index) => (
      <Skeleton className="h-80 rounded-xl" key={index} />
    ))}
  </div>
);

const PostsPage = () => {
  const navigate = useNavigate();
  const { session } = useRouteContext({ from: "/_authenticated" });
  const [filters, setFilters] = useState<PostFiltersState>(defaultPostFilters);
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(filters.q.trim());
  const canManageAll = isAdminRole(sessionRoleOf(session));

  const handleFilterChange = (patch: Partial<PostFiltersState>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(1);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              void navigate({ to: "/posts/new" });
            }}
          >
            <PlusIcon />
            新建文章
          </Button>
        }
        description={
          canManageAll
            ? "科室教学文章的撰写、发布与分享：写完发布，用网址或二维码发给同事。"
            : "只显示你撰写的文章；科室管理员可查看全科室的文章。"
        }
        title="教学与分享"
      />

      <PostFilters onChange={handleFilterChange} value={filters} />

      <Suspense fallback={<PostsGridSkeleton />}>
        <PostsResults
          canManageAll={canManageAll}
          filters={filters}
          onClearFilters={() => {
            setFilters(defaultPostFilters);
            setPage(1);
          }}
          onPageChange={setPage}
          page={page}
          query={deferredQuery}
          viewerName={session?.user.name}
        />
      </Suspense>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/posts/")({
  component: PostsPage,
});
