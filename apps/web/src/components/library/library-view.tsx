import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DownloadIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  LayoutGridIcon,
  ListIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@medihub/ui/components/sheet";
import { cn } from "@medihub/ui/lib/utils";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { CollectionFormDialog } from "#src/components/library/collection-form-dialog.tsx";
import {
  CollectionTree,
  collectionPath,
} from "#src/components/library/collection-tree.tsx";
import type { CollectionNode } from "#src/components/library/collection-tree.tsx";
import { MoveAssetsDialog } from "#src/components/library/move-assets-dialog.tsx";
import { AssetGrid, UploadButton } from "#src/components/media/index.ts";
import { api } from "#src/lib/api.ts";

const PAGE_SIZE = 48;
const ALL_KINDS = "all";

const KIND_FILTERS = [
  { label: "全部", value: ALL_KINDS },
  { label: "图片", value: "image" },
  { label: "视频", value: "video" },
  { label: "文档", value: "document" },
  { label: "音频", value: "audio" },
  { label: "压缩包", value: "archive" },
  { label: "其它", value: "other" },
] as const;

type AssetKindFilter = (typeof KIND_FILTERS)[number]["value"];

type ViewMode = "grid" | "list";

type FolderDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; collection: CollectionNode }
  | null;

interface LibraryViewProps {
  collectionId?: string;
}

/**
 * 资料库主体：桌面左侧目录树 + 右侧素材区，移动端目录收进抽屉。
 * `/library` 与 `/library/$collectionId` 共用同一套交互。
 */
export const LibraryView = ({ collectionId }: LibraryViewProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const [kind, setKind] = useState<AssetKindFilter>(ALL_KINDS);
  const [view, setView] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);

  const [pendingFolderDelete, setPendingFolderDelete] =
    useState<CollectionNode | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteAssetsOpen, setDeleteAssetsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(q.trim());
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [q]);

  const collectionsQuery = useQuery(api.collections.list.queryOptions());
  const collections = collectionsQuery.data ?? [];

  const assetsQuery = useQuery(
    api.assets.list.queryOptions({
      input: {
        collectionId,
        kind: kind === ALL_KINDS ? undefined : kind,
        page,
        pageSize: PAGE_SIZE,
        q: keyword || undefined,
      },
    })
  );

  const assets = assetsQuery.data?.items ?? [];
  const total = assetsQuery.data?.total ?? 0;

  const current = collectionId
    ? collections.find((node) => node.id === collectionId)
    : undefined;

  const breadcrumb = collectionId
    ? collectionPath(collections, collectionId)
    : [];

  const currentName = current?.name ?? "全部资料";

  const missingFolder =
    Boolean(collectionId) && !collectionsQuery.isPending && !current;

  const refreshCollections = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.collections.list.key({ type: "query" }),
    });
  };

  const refreshAssets = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.assets.list.key({ type: "query" }),
    });
  };

  const removeFolderMutation = useMutation(
    api.collections.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("文件夹已删除");
        const removedId = pendingFolderDelete?.id;
        setPendingFolderDelete(null);
        await refreshCollections();
        await refreshAssets();

        if (removedId && removedId === collectionId) {
          await navigate({ to: "/library" });
        }
      },
    })
  );

  const removeAssetsMutation = useMutation(
    api.assets.remove.mutationOptions({
      onSuccess: async (result) => {
        setDeleteAssetsOpen(false);
        setSelectedIds([]);
        await refreshAssets();
        await refreshCollections();

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

  const handleUploaded = async () => {
    await refreshAssets();
    await refreshCollections();
    toast.success("上传完成");
  };

  const openCreateFolder = (parentId: string | null) => {
    setFolderDialog({ mode: "create", parentId });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <aside className="bg-card ring-foreground/10 hidden max-h-[calc(100svh-9rem)] overflow-y-auto rounded-xl p-2 ring-1 lg:sticky lg:top-20 lg:block">
        <CollectionTree
          activeId={collectionId ?? null}
          collections={collections}
          onCreate={openCreateFolder}
          onRemove={setPendingFolderDelete}
          onRename={(collection) => {
            setFolderDialog({ collection, mode: "rename" });
          }}
        />
      </aside>

      <section className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="lg:hidden"
            onClick={() => {
              setTreeOpen(true);
            }}
            size="sm"
            variant="outline"
          >
            <FolderTreeIcon />
            目录
          </Button>

          <nav
            aria-label="资料库路径"
            className="flex min-w-0 items-center gap-1.5 text-sm"
          >
            <Link
              className="text-muted-foreground hover:text-foreground shrink-0"
              to="/library"
            >
              全部资料
            </Link>
            {breadcrumb.map((node) => (
              <span className="flex min-w-0 items-center gap-1.5" key={node.id}>
                <span className="text-muted-foreground/60">/</span>
                <Link
                  className="hover:text-foreground truncate font-medium"
                  params={{ collectionId: node.id }}
                  to="/library/$collectionId"
                >
                  {node.name}
                </Link>
              </span>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button
              aria-label="网格视图"
              aria-pressed={view === "grid"}
              onClick={() => {
                setView("grid");
              }}
              size="icon-sm"
              variant={view === "grid" ? "secondary" : "ghost"}
            >
              <LayoutGridIcon />
            </Button>
            <Button
              aria-label="列表视图"
              aria-pressed={view === "list"}
              onClick={() => {
                setView("list");
              }}
              size="icon-sm"
              variant={view === "list" ? "secondary" : "ghost"}
            >
              <ListIcon />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <Input
            aria-label="搜索素材"
            className="min-w-0 flex-1"
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="搜索文件名、描述或部位…"
            type="search"
            value={q}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {KIND_FILTERS.map((filter) => (
                <Button
                  aria-pressed={kind === filter.value}
                  key={filter.value}
                  onClick={() => {
                    setKind(filter.value);
                    setPage(1);
                    setSelectedIds([]);
                  }}
                  size="sm"
                  variant={kind === filter.value ? "secondary" : "ghost"}
                >
                  {filter.label}
                </Button>
              ))}
            </div>

            <Button
              onClick={() => {
                openCreateFolder(current?.id ?? null);
              }}
              size="sm"
              variant="outline"
            >
              <FolderPlusIcon />
              新建文件夹
            </Button>

            <UploadButton
              onUploaded={() => {
                void handleUploaded();
              }}
              target={current ? { collectionId: current.id } : {}}
            />
          </div>
        </div>

        {selectedIds.length > 0 ? (
          <div className="bg-accent/40 ring-foreground/10 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ring-1">
            <span className="text-sm font-medium tabular-nums">
              已选 {selectedIds.length} 个素材
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                onClick={() => {
                  setMoveOpen(true);
                }}
                size="sm"
                variant="outline"
              >
                移动到…
              </Button>
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
              <Button
                onClick={() => {
                  setDeleteAssetsOpen(true);
                }}
                size="sm"
                variant="destructive"
              >
                <Trash2Icon />
                删除
              </Button>
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

        {missingFolder ? (
          <EmptyState
            action={
              <Button
                nativeButton={false}
                render={<Link to="/library" />}
                variant="outline"
              >
                返回全部资料
              </Button>
            }
            description="这个文件夹可能已被删除。"
            icon={FolderTreeIcon}
            title="文件夹不存在"
          />
        ) : (
          <>
            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                {current
                  ? `「${currentName}」共 ${total} 个素材`
                  : `全部资料共 ${total} 个素材`}
              </span>
              {keyword ? <span>搜索：{keyword}</span> : null}
            </div>

            {assetsQuery.isPending ? <LoadingRows rows={3} /> : null}

            {assetsQuery.isPending ? null : (
              <AssetGrid
                assets={assets}
                empty={
                  <div className="grid place-items-center gap-1 py-12 text-center">
                    <p className="text-sm font-medium">
                      {keyword || kind !== ALL_KINDS
                        ? "没有匹配的素材"
                        : "这里还没有素材"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {keyword || kind !== ALL_KINDS
                        ? "换个关键词或类型再试试。"
                        : "点右上角「上传」，把课件、文档或影像放进这个目录。"}
                    </p>
                  </div>
                }
                layout={view}
                selection={{ onChange: setSelectedIds, selectedIds }}
              />
            )}

            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-2">
                <Button
                  disabled={page <= 1}
                  onClick={() => {
                    setPage((value) => Math.max(1, value - 1));
                  }}
                  size="sm"
                  variant="outline"
                >
                  上一页
                </Button>
                <span className="text-muted-foreground text-xs tabular-nums">
                  第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
                </span>
                <Button
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => {
                    setPage((value) => value + 1);
                  }}
                  size="sm"
                  variant="outline"
                >
                  下一页
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

      <Sheet onOpenChange={setTreeOpen} open={treeOpen}>
        <SheetContent className="w-72" side="left">
          <SheetHeader>
            <SheetTitle>资料目录</SheetTitle>
            <SheetDescription>
              按专题整理科室课件、文档与影像。
            </SheetDescription>
          </SheetHeader>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-6")}>
            <CollectionTree
              activeId={collectionId ?? null}
              collections={collections}
              onCreate={(parentId) => {
                setTreeOpen(false);
                openCreateFolder(parentId);
              }}
              onNavigate={() => {
                setTreeOpen(false);
              }}
              onRemove={(collection) => {
                setTreeOpen(false);
                setPendingFolderDelete(collection);
              }}
              onRename={(collection) => {
                setTreeOpen(false);
                setFolderDialog({ collection, mode: "rename" });
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <CollectionFormDialog
        collection={
          folderDialog?.mode === "rename" ? folderDialog.collection : null
        }
        onOpenChange={(open) => {
          if (!open) {
            setFolderDialog(null);
          }
        }}
        open={folderDialog !== null}
        parentId={
          folderDialog?.mode === "create" ? folderDialog.parentId : null
        }
        parentName={folderDialog?.mode === "create" ? currentName : undefined}
      />

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
        description={
          pendingFolderDelete
            ? `「${pendingFolderDelete.name}」将被删除；其中的素材会回到「全部资料」，子文件夹会移动到顶层。`
            : undefined
        }
        isPending={removeFolderMutation.isPending}
        onConfirm={() => {
          if (pendingFolderDelete) {
            removeFolderMutation.mutate({ id: pendingFolderDelete.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingFolderDelete(null);
          }
        }}
        open={pendingFolderDelete !== null}
        title="删除文件夹？"
        tone="destructive"
      />

      <ConfirmDialog
        confirmLabel="删除"
        description={`将删除选中的 ${selectedIds.length} 个素材。文件本身会保留在存储中，误删可由管理员恢复。`}
        isPending={removeAssetsMutation.isPending}
        onConfirm={() => {
          removeAssetsMutation.mutate({ ids: selectedIds });
        }}
        onOpenChange={setDeleteAssetsOpen}
        open={deleteAssetsOpen}
        title="删除素材？"
        tone="destructive"
      />
    </div>
  );
};
