import { Link } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@medihub/ui/components/dropdown-menu";
import { cn } from "@medihub/ui/lib/utils";

export interface CollectionNode {
  _count: number;
  description: string | null;
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  visibility: string;
}

interface TreeEntry {
  children: TreeEntry[];
  node: CollectionNode;
}

const buildTree = (collections: readonly CollectionNode[]): TreeEntry[] => {
  const entries = new Map<string, TreeEntry>();
  const roots: TreeEntry[] = [];

  for (const node of collections) {
    entries.set(node.id, { children: [], node });
  }

  for (const entry of entries.values()) {
    const parent = entry.node.parentId
      ? entries.get(entry.node.parentId)
      : undefined;

    if (parent) {
      parent.children.push(entry);
    } else {
      roots.push(entry);
    }
  }

  return roots;
};

/** 从当前目录向上回溯，得到面包屑所需的祖先链。 */
export const collectionPath = (
  collections: readonly CollectionNode[],
  collectionId: string
): CollectionNode[] => {
  const byId = new Map(collections.map((node) => [node.id, node]));
  const path: CollectionNode[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(collectionId);

  while (cursor && !seen.has(cursor.id)) {
    path.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return path;
};

interface CollectionTreeProps {
  activeId: string | null;
  collections: readonly CollectionNode[];
  /** 移动端抽屉在跳转后关闭 */
  onNavigate?: () => void;
  onCreate: (parentId: string | null) => void;
  onRemove: (collection: CollectionNode) => void;
  onRename: (collection: CollectionNode) => void;
  className?: string;
}

interface TreeItemProps {
  activeId: string | null;
  collapsedIds: Set<string>;
  entry: TreeEntry;
  onDelete: (collection: CollectionNode) => void;
  onNavigate?: () => void;
  onRename: (collection: CollectionNode) => void;
  onToggle: (id: string) => void;
}

const TreeItem = ({
  activeId,
  collapsedIds,
  entry,
  onDelete,
  onNavigate,
  onRename,
  onToggle,
}: TreeItemProps) => {
  const { children, node } = entry;
  const expanded = !collapsedIds.has(node.id);
  const active = activeId === node.id;

  return (
    <li>
      <div className="group flex items-center gap-0.5">
        {children.length > 0 ? (
          <Button
            aria-expanded={expanded}
            aria-label={expanded ? `折叠 ${node.name}` : `展开 ${node.name}`}
            onClick={() => {
              onToggle(node.id);
            }}
            size="icon-xs"
            variant="ghost"
          >
            <ChevronRightIcon
              className={cn("transition-transform", expanded && "rotate-90")}
            />
          </Button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}

        <Link
          activeOptions={{ exact: true }}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
            active
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
          onClick={onNavigate}
          params={{ collectionId: node.id }}
          to="/library/$collectionId"
        >
          <FolderIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{node.name}</span>
          <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
            {node._count}
          </span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`${node.name} 的文件夹操作`}
                size="icon-xs"
                variant="ghost"
              />
            }
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => {
                onRename(node);
              }}
            >
              <PencilIcon />
              重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onDelete(node);
              }}
              variant="destructive"
            >
              <Trash2Icon />
              删除文件夹
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && children.length > 0 ? (
        <ul className="mt-0.5 ml-3 grid gap-0.5 border-l pl-2">
          {children.map((child) => (
            <TreeItem
              activeId={activeId}
              collapsedIds={collapsedIds}
              entry={child}
              key={child.node.id}
              onDelete={onDelete}
              onNavigate={onNavigate}
              onRename={onRename}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

/** 科室资料目录树：平铺数据在这里组装成树，支持展开折叠与当前高亮。 */
export const CollectionTree = ({
  activeId,
  collections,
  onNavigate,
  onCreate,
  onRemove,
  onRename,
  className,
}: CollectionTreeProps) => {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const entries = buildTree(collections);

  const toggle = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  return (
    <nav aria-label="资料目录" className={cn("grid gap-0.5", className)}>
      <Link
        activeOptions={{ exact: true }}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
          activeId === null
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
        onClick={onNavigate}
        to="/library"
      >
        <FolderIcon aria-hidden="true" className="size-4 shrink-0" />
        全部资料
      </Link>

      {entries.length === 0 ? (
        <p className="text-muted-foreground px-2 py-3 text-xs">
          还没有文件夹，点上方「新建文件夹」开始整理。
        </p>
      ) : (
        <ul className="mt-0.5 grid gap-0.5">
          {entries.map((entry) => (
            <TreeItem
              activeId={activeId}
              collapsedIds={collapsedIds}
              entry={entry}
              key={entry.node.id}
              onDelete={onRemove}
              onNavigate={onNavigate}
              onRename={onRename}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}

      <Button
        className="mt-2 justify-start"
        onClick={() => {
          onCreate(activeId);
        }}
        size="sm"
        variant="ghost"
      >
        <FolderPlusIcon />
        在当前目录新建子文件夹
      </Button>
    </nav>
  );
};
