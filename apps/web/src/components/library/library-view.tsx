import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderPlusIcon, FolderTreeIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@medihub/ui/components/sheet";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { CollectionFormDialog } from "#src/components/library/collection-form-dialog.tsx";
import {
  CollectionTree,
  collectionPath,
} from "#src/components/library/collection-tree.tsx";
import type { CollectionNode } from "#src/components/library/collection-tree.tsx";
import { LibraryBrowser } from "#src/components/library/library-browser.tsx";
import type { LibrarySource } from "#src/components/library/library-source.ts";
import { SourceTabs } from "#src/components/library/source-tabs.tsx";
import { api } from "#src/lib/api.ts";

type FolderDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; collection: CollectionNode }
  | null;

interface LibraryViewProps {
  /** 传了就是某个目录的浏览页 */
  collectionId?: string;
  onSourceChange: (source: LibrarySource) => void;
  source: LibrarySource;
}

/**
 * 资料库：顶部按来源分类，只有「资料库目录」保留左侧文件夹树，
 * 其余分类是平铺列表，卡片底部标注归属（患者 / 会议 / 文件夹 / 文章）。
 */
export const LibraryView = ({
  collectionId,
  onSourceChange,
  source,
}: LibraryViewProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [treeOpen, setTreeOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState>(null);

  const [pendingFolderDelete, setPendingFolderDelete] =
    useState<CollectionNode | null>(null);

  const collectionsQuery = useQuery(api.collections.list.queryOptions());
  const collections = collectionsQuery.data ?? [];

  const current = collectionId
    ? collections.find((node) => node.id === collectionId)
    : undefined;

  const breadcrumb = collectionId
    ? collectionPath(collections, collectionId)
    : [];

  const currentName = current?.name ?? "全部资料";

  const missingFolder =
    Boolean(collectionId) && !collectionsQuery.isPending && !current;

  const isCollectionSource = source === "collections";

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

  const tree = (
    <CollectionTree
      activeId={collectionId ?? null}
      collections={collections}
      onCreate={(parentId) => {
        setTreeOpen(false);
        setFolderDialog({ mode: "create", parentId });
      }}
      onNavigate={() => {
        setTreeOpen(false);
      }}
      onRemove={setPendingFolderDelete}
      onRename={(collection) => {
        setTreeOpen(false);
        setFolderDialog({ collection, mode: "rename" });
      }}
    />
  );

  return (
    <div className="grid gap-4">
      <SourceTabs onChange={onSourceChange} value={source} />

      {isCollectionSource ? (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <aside className="bg-card ring-foreground/10 hidden max-h-[calc(100svh-12rem)] overflow-y-auto rounded-xl p-2 ring-1 lg:sticky lg:top-20 lg:block">
            {tree}
          </aside>

          <div className="grid min-w-0 gap-3">
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
                  <span
                    className="flex min-w-0 items-center gap-1.5"
                    key={node.id}
                  >
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

              <Button
                className="ml-auto"
                onClick={() => {
                  setFolderDialog({
                    mode: "create",
                    parentId: current?.id ?? null,
                  });
                }}
                size="sm"
                variant="outline"
              >
                <FolderPlusIcon />
                新建文件夹
              </Button>
            </div>

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
              <LibraryBrowser
                collectionId={collectionId}
                collections={collections}
                current={current}
                key={`${source}:${collectionId ?? ""}`}
                onUploaded={() => {
                  void refreshCollections();
                }}
                source={source}
              />
            )}
          </div>
        </div>
      ) : (
        <LibraryBrowser
          collections={collections}
          key={source}
          onUploaded={() => {
            void refreshCollections();
          }}
          source={source}
        />
      )}

      <Sheet onOpenChange={setTreeOpen} open={treeOpen}>
        <SheetContent className="w-72" side="left">
          <SheetHeader>
            <SheetTitle>资料目录</SheetTitle>
            <SheetDescription>
              按专题整理科室课件、文档与影像。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">{tree}</div>
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
    </div>
  );
};
