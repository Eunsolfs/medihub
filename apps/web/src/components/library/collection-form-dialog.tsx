import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";
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
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import { Textarea } from "@medihub/ui/components/textarea";

import type { CollectionNode } from "#src/components/library/collection-tree.tsx";
import { api } from "#src/lib/api.ts";

interface CollectionFormDialogProps {
  /** 传入即为重命名/编辑模式 */
  collection?: CollectionNode | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** 新建时的上级目录；null 表示顶层 */
  parentId: string | null;
  parentName?: string;
}

interface CollectionFormBodyProps {
  collection: CollectionNode | null;
  onClose: () => void;
  parentId: string | null;
  parentName?: string;
}

/** 表单主体：挂载时取初值，关闭即卸载，不需要重置副作用。 */
const CollectionFormBody = ({
  collection,
  onClose,
  parentId,
  parentName,
}: CollectionFormBodyProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState(collection?.name ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.collections.list.key({ type: "query" }),
    });
  };

  const createMutation = useMutation(
    api.collections.create.mutationOptions({
      onSuccess: async () => {
        toast.success("文件夹已创建");
        await invalidate();
        onClose();
      },
    })
  );

  const updateMutation = useMutation(
    api.collections.update.mutationOptions({
      onSuccess: async () => {
        toast.success("文件夹已更新");
        await invalidate();
        onClose();
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    const trimmedDescription = description.trim() || undefined;

    if (collection) {
      updateMutation.mutate({
        description: trimmedDescription,
        id: collection.id,
        name: trimmedName,
      });
    } else {
      createMutation.mutate({
        description: trimmedDescription,
        name: trimmedName,
        parentId,
      });
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{collection ? "重命名文件夹" : "新建文件夹"}</DialogTitle>
        <DialogDescription>
          {collection
            ? "改名不会影响已归档的素材。"
            : parentName
              ? `将创建「${parentName}」下的子文件夹。`
              : "文件夹用于按专题整理课件、文档与影像。"}
        </DialogDescription>
      </DialogHeader>

      <form className="grid gap-4" id="collection-form" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="collection-name">名称</Label>
          <Input
            autoFocus
            id="collection-name"
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="如：2026 年培训课件"
            required
            value={name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="collection-description">说明（可选）</Label>
          <Textarea
            id="collection-description"
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="写一句用途说明，方便同事理解这个目录放什么。"
            rows={3}
            value={description}
          />
        </div>
      </form>

      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          取消
        </Button>
        <Button disabled={isPending} form="collection-form" type="submit">
          {isPending ? "正在保存…" : collection ? "保存" : "创建"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

/** 新建 / 重命名资料库文件夹。 */
export const CollectionFormDialog = ({
  collection,
  onOpenChange,
  open,
  parentId,
  parentName,
}: CollectionFormDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    {open ? (
      <CollectionFormBody
        collection={collection ?? null}
        key={collection?.id ?? "new"}
        onClose={() => {
          onOpenChange(false);
        }}
        parentId={parentId}
        parentName={parentName}
      />
    ) : null}
  </Dialog>
);
