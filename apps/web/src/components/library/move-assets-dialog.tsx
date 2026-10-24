import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Label } from "@medihub/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import type { CollectionNode } from "#src/components/library/collection-tree.tsx";
import { api } from "#src/lib/api.ts";

const NO_FOLDER = "__none__";

/** 目录的完整路径名，用来在移动对话框里区分同名子目录。 */
const folderLabels = (collections: readonly CollectionNode[]) => {
  const byId = new Map(collections.map((node) => [node.id, node]));

  return collections
    .map((node) => {
      const names: string[] = [];
      const seen = new Set<string>();
      let cursor: CollectionNode | undefined = node;

      while (cursor && !seen.has(cursor.id)) {
        names.unshift(cursor.name);
        seen.add(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }

      return { label: names.join(" / "), value: node.id };
    })
    .toSorted((left, right) => left.label.localeCompare(right.label, "zh-CN"));
};

interface MoveAssetsDialogProps {
  assetIds: readonly string[];
  collections: readonly CollectionNode[];
  onMoved?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface MoveAssetsBodyProps {
  assetIds: readonly string[];
  collections: readonly CollectionNode[];
  onClose: () => void;
  onMoved?: () => void;
}

const MoveAssetsBody = ({
  assetIds,
  collections,
  onClose,
  onMoved,
}: MoveAssetsBodyProps) => {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<string>(NO_FOLDER);
  const options = folderLabels(collections);

  const moveMutation = useMutation(
    api.assets.move.mutationOptions({
      onSuccess: async () => {
        toast.success(`已移动 ${assetIds.length} 个素材`);
        await queryClient.invalidateQueries({
          queryKey: api.assets.list.key({ type: "query" }),
        });
        await queryClient.invalidateQueries({
          queryKey: api.collections.list.key({ type: "query" }),
        });
        onClose();
        onMoved?.();
      },
    })
  );

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>移动素材</DialogTitle>
        <DialogDescription>
          把选中的 {assetIds.length} 个素材移动到另一个文件夹。
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="move-target">目标文件夹</Label>
        <Select
          items={[
            { label: "不放进文件夹（全部资料）", value: NO_FOLDER },
            ...options,
          ]}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setTarget(value);
            }
          }}
          value={target}
        >
          <SelectTrigger className="w-full" id="move-target">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FOLDER}>不放进文件夹（全部资料）</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          取消
        </Button>
        <Button
          disabled={moveMutation.isPending}
          onClick={() => {
            moveMutation.mutate({
              collectionId: target === NO_FOLDER ? null : target,
              ids: [...assetIds],
            });
          }}
        >
          {moveMutation.isPending ? "正在移动…" : "移动"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

/** 批量移动素材到指定文件夹（或移出文件夹回到「全部资料」）。 */
export const MoveAssetsDialog = ({
  assetIds,
  collections,
  onMoved,
  onOpenChange,
  open,
}: MoveAssetsDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    {open ? (
      <MoveAssetsBody
        assetIds={assetIds}
        collections={collections}
        onClose={() => {
          onOpenChange(false);
        }}
        onMoved={onMoved}
      />
    ) : null}
  </Dialog>
);
