import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { DownloadIcon, FolderTreeIcon, Trash2Icon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";

import {
  getSessionRole,
  isAdminRole,
} from "#src/components/app-shell/roles.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { AssetCaption } from "#src/components/library/asset-caption.tsx";
import type { CollectionNode } from "#src/components/library/collection-tree.tsx";
import { sourceLabel } from "#src/components/library/library-source.ts";
import type {
  LibraryKindFilter,
  LibrarySort,
  LibrarySource,
  LibraryStageFilter,
  LibraryViewMode,
} from "#src/components/library/library-source.ts";
import { LibraryToolbar } from "#src/components/library/library-toolbar.tsx";
import { MoveAssetsDialog } from "#src/components/library/move-assets-dialog.tsx";
import { LibraryUpload } from "#src/components/library/upload-control.tsx";
import { AssetGrid } from "#src/components/media/index.ts";
import { api } from "#src/lib/api.ts";

const PAGE_SIZE = 48;

interface LibraryBrowserProps {
  collectionId?: string;
  collections: readonly CollectionNode[];
  current?: CollectionNode;
  onUploaded: () => void;
  source: LibrarySource;
}

const EMPTY_COPY: Record<
  LibrarySource,
  { description: string; title: string }
> = {
  all: {
    description: "患者影像、会议资料与教学附件都会汇总在这里。",
    title: "还没有素材",
  },
  collections: {
    description: "点右上角「上传」，把课件、文档或影像放进当前目录。",
    title: "这个目录还没有素材",
  },
  patients: {
    description: "在患者档案里上传的术前、术中与随访影像会归档到这里。",
    title: "还没有患者影像",
  },
  posts: {
    description: "在教学文章里上传的附件会出现在这里。",
    title: "还没有文章附件",
  },
  sessions: {
    description: "在学习会议详情页上传课件、照片与录音后，会出现在这里。",
    title: "还没有会议资料",
  },
};

const emptyCopy = (source: LibrarySource, filtered: boolean) =>
  filtered
    ? {
        description: "换个关键词、类型或分期再试试。",
        title: "没有匹配的素材",
      }
    : EMPTY_COPY[source];

/** 素材区：工具条 + 网格/列表 + 批量操作。 */
export const LibraryBrowser = ({
  collectionId,
  collections,
  current,
  onUploaded,
  source,
}: LibraryBrowserProps) => {
  const queryClient = useQueryClient();
  const { session } = useRouteContext({ from: "/_authenticated" });
  const viewerId = session?.user.id;
  const viewerRole = getSessionRole(session);
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const [kind, setKind] = useState<LibraryKindFilter>("all");
  const [stage, setStage] = useState<LibraryStageFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [view, setView] = useState<LibraryViewMode>("grid");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 输入即时可见，300ms 后才真正查询，避免每个按键打一次接口。
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(q.trim());
    }, 300);

    return () => {
      window.clearInterval(timer);
    };
  }, [q]);

  const showStage = source === "patients";
  const effectiveStage = showStage && stage !== "all" ? stage : undefined;

  const assetsQuery = useQuery(
    api.assets.list.queryOptions({
      input: {
        collectionId: source === "collections" ? collectionId : undefined,
        kind: kind === "all" ? undefined : kind,
        page,
        pageSize: PAGE_SIZE,
        q: keyword || undefined,
        sort,
        source,
        ...(effectiveStage ? { stage: effectiveStage } : {}),
      },
    })
  );

  const assets = assetsQuery.data?.items ?? [];
  const total = assetsQuery.data?.total ?? 0;

  // 科室素材共享可读，但整理（移动/删除）只属于上传者与管理员。
  const selectedAssets = assets.filter((asset) =>
    selectedIds.includes(asset.id)
  );

  const canManageSelected =
    isAdminRole(viewerRole) ||
    (selectedAssets.length > 0 &&
      selectedAssets.every((asset) => asset.ownerId === viewerId));

  const refreshAssets = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.assets.list.key({ type: "query" }),
    });
  };

  const removeMutation = useMutation(
    api.assets.remove.mutationOptions({
      onSuccess: async (result) => {
        setDeleteOpen(false);
        setSelectedIds([]);
        await refreshAssets();
        onUploaded();

        if (result.skipped > 0) {
          toast.warning(
            `已删除 ${result.deleted} 个素材，${result.skipped} 个因权限不足被跳过`
          );
        } else {
          toast.success(`已删除 ${result.deleted} 个素材`);
        }
      },
    })
  );

  const packMutation = useMutation(
    api.exports.create.mutationOptions({
      onSuccess: async () => {
        toast.success("已创建打包任务，可在导出中心下载");
        setSelectedIds([]);
        await queryClient.invalidateQueries({
          queryKey: api.exports.list.key({ type: "query" }),
        });
      },
    })
  );

  const filtered = keyword.length > 0 || kind !== "all" || effectiveStage;
  const empty = emptyCopy(source, Boolean(filtered));
  const canMove = source === "collections";

  return (
    <section className="grid min-w-0 gap-3">
      <LibraryToolbar
        kind={kind}
        onKindChange={(value) => {
          setKind(value);
          setPage(1);
          setSelectedIds([]);
        }}
        onQChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        onSortChange={(value) => {
          setSort(value);
          setPage(1);
        }}
        onStageChange={(value) => {
          setStage(value);
          setPage(1);
          setSelectedIds([]);
        }}
        onViewChange={setView}
        q={q}
        sort={sort}
        source={source}
        stage={stage}
        upload={
          <LibraryUpload
            collectionId={collectionId}
            onUploaded={onUploaded}
            source={source}
          />
        }
        view={view}
      />

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {sourceLabel(source)}
          {current ? `「${current.name}」` : ""} · 共 {total} 个素材
          {keyword ? ` · 搜索「${keyword}」` : ""}
        </span>
        {selectedIds.length > 0 ? (
          <span className="text-foreground">已选 {selectedIds.length} 个</span>
        ) : null}
      </div>

      <p className="text-muted-foreground -mt-1 text-xs">
        本科室共享资料，只有上传者与管理员可以整理。
      </p>

      {selectedIds.length > 0 ? (
        <div className="bg-accent/40 ring-foreground/10 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ring-1">
          <span className="text-sm font-medium tabular-nums">
            已选 {selectedIds.length} 个素材
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {canMove && canManageSelected ? (
              <Button
                onClick={() => {
                  setMoveOpen(true);
                }}
                size="sm"
                variant="outline"
              >
                移动到…
              </Button>
            ) : null}
            <Button
              disabled={packMutation.isPending}
              onClick={() => {
                packMutation.mutate({
                  assetIds: selectedIds,
                  includeFiles: true,
                  kind: "selection",
                });
              }}
              size="sm"
              variant="outline"
            >
              <DownloadIcon />
              打包下载
            </Button>
            {canManageSelected ? (
              <Button
                onClick={() => {
                  setDeleteOpen(true);
                }}
                size="sm"
                variant="destructive"
              >
                <Trash2Icon />
                删除
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">
                只有上传者与管理员可以整理
              </span>
            )}
            <Button
              aria-label="取消选择"
              onClick={() => {
                setSelectedIds([]);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </div>
        </div>
      ) : null}

      {assetsQuery.isPending ? <LoadingRows rows={3} /> : null}

      {assetsQuery.isPending ? null : (
        <AssetGrid
          assets={assets}
          empty={
            <div className="grid place-items-center gap-1">
              <FolderTreeIcon
                aria-hidden="true"
                className="text-muted-foreground/60 mb-1 size-6"
              />
              <p className="text-sm font-medium">{empty.title}</p>
              <p className="text-muted-foreground text-xs">
                {empty.description}
              </p>
            </div>
          }
          layout={view}
          renderCaption={(asset) => (
            <AssetCaption
              asset={asset}
              collections={collections}
              source={source}
            />
          )}
          selection={{ onChange: setSelectedIds, selectedIds }}
        />
      )}

      {total > PAGE_SIZE ? (
        <PaginationBar
          onPageChange={setPage}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      ) : null}

      <MoveAssetsDialog
        assetIds={selectedIds}
        collections={collections}
        onMoved={() => {
          setSelectedIds([]);
        }}
        onOpenChange={setMoveOpen}
        open={moveOpen}
      />

      <ConfirmDialog
        confirmLabel="删除"
        description={`将删除选中的 ${selectedIds.length} 个素材。文件本身会保留在存储中，误删可由管理员恢复。`}
        isPending={removeMutation.isPending}
        onConfirm={() => {
          removeMutation.mutate({ ids: selectedIds });
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="删除素材？"
        tone="destructive"
      />
    </section>
  );
};
