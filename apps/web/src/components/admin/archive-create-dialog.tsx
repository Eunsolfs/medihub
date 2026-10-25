import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Checkbox } from "@medihub/ui/components/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import { storageDriverLabel } from "#src/components/admin/constants.ts";
import type { AdminViewer } from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";
import { useOrgScope } from "#src/lib/org-scope.ts";

const DEFAULT_TARGET = "__default__";
const CHUNK_SIZE = 1024 ** 3;

const CHUNK_OPTIONS = [
  { label: "512 MB", value: String(512 * 1024 * 1024) },
  { label: "1 GB", value: String(CHUNK_SIZE) },
  { label: "2 GB", value: String(2 * CHUNK_SIZE) },
  { label: "4 GB", value: String(4 * CHUNK_SIZE) },
] as const;

const toDateInput = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
};

const defaultBeforeAt = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 2);

  return toDateInput(date);
};

interface ArchiveCreateDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  viewer: AdminViewer;
}

/** 新建冷数据归档：指定截止日期、分片大小与存储目标。 */
export const ArchiveCreateDialog = ({
  onOpenChange,
  open,
  viewer,
}: ArchiveCreateDialogProps) => {
  const queryClient = useQueryClient();
  const isRoot = viewer.role === "root";
  const { currentOrganization, organizations } = useOrgScope();

  const [beforeAt, setBeforeAt] = useState(defaultBeforeAt);
  const [chunkBytes, setChunkBytes] = useState(String(CHUNK_SIZE));
  const [deleteSource, setDeleteSource] = useState(true);
  const [targetId, setTargetId] = useState(DEFAULT_TARGET);

  const [organizationId, setOrganizationId] = useState(
    currentOrganization?.id ?? organizations[0]?.id ?? ""
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetsQuery = useQuery({
    ...api.storage.list.queryOptions(),
    enabled: open,
  });

  const targets = targetsQuery.data ?? [];

  const createMutation = useMutation(
    api.archive.create.mutationOptions({
      onSuccess: async () => {
        toast.success("归档任务已创建，后台打包中");
        await queryClient.invalidateQueries({
          queryKey: api.archive.list.key(),
        });
        onOpenChange(false);
      },
    })
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const parsedDate = new Date(`${beforeAt}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      setErrorMessage("请选择有效的截止日期");

      return;
    }

    if (isRoot && !organizationId) {
      setErrorMessage("请选择要归档的科室");

      return;
    }

    createMutation.mutate({
      beforeAt: parsedDate,
      chunkBytes: Number(chunkBytes),
      deleteSource,
      ...(isRoot ? { organizationId } : {}),
      ...(targetId === DEFAULT_TARGET ? {} : { targetId }),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建冷数据归档</DialogTitle>
          <DialogDescription>
            把截止日期之前上传的素材打包成分片 zip
            推到存储目标；可选删除服务器源文件，归档后素材仍可检索。
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="archive-create-form"
          onSubmit={handleSubmit}
        >
          {errorMessage ? (
            <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
              {errorMessage}
            </p>
          ) : null}

          {isRoot ? (
            <div className="grid gap-2">
              <Label htmlFor="archive-organization">归档科室</Label>
              <Select
                items={organizations.map((organization) => ({
                  label: organization.name,
                  value: organization.id,
                }))}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setOrganizationId(value);
                  }
                }}
                value={organizationId === "" ? null : organizationId}
              >
                <SelectTrigger className="w-full" id="archive-organization">
                  <SelectValue placeholder="选择科室" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
              将归档本科室的数据。
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="archive-before-at">截止日期</Label>
              <Input
                id="archive-before-at"
                onChange={(event) => {
                  setBeforeAt(event.target.value);
                }}
                required
                type="date"
                value={beforeAt}
              />
              <p className="text-muted-foreground text-xs">
                只归档这个日期之前上传的素材。
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="archive-chunk-size">分片大小</Label>
              <Select
                items={CHUNK_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setChunkBytes(value);
                  }
                }}
                value={chunkBytes}
              >
                <SelectTrigger className="w-full" id="archive-chunk-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHUNK_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="archive-target">存储目标</Label>
            <Select
              items={[
                { label: "使用默认存储目标", value: DEFAULT_TARGET },
                ...targets.map((target) => ({
                  label: `${target.name} · ${storageDriverLabel(target.driver)}`,
                  value: target.id,
                })),
              ]}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setTargetId(value);
                }
              }}
              value={targetId}
            >
              <SelectTrigger className="w-full" id="archive-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_TARGET}>使用默认存储目标</SelectItem>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name} · {storageDriverLabel(target.driver)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              归档分片会写入该存储目标；不选则使用当前默认目标。
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
            <Checkbox
              checked={deleteSource}
              className="mt-0.5"
              onCheckedChange={(checked) => {
                setDeleteSource(checked);
              }}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                归档后删除服务器源文件
              </span>
              <span className="text-muted-foreground text-xs">
                可释放服务器空间；取消勾选则保留原文件。
              </span>
            </span>
          </label>
        </form>

        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            variant="outline"
          >
            取消
          </Button>
          <Button
            className="min-h-11 sm:min-h-8"
            disabled={createMutation.isPending}
            form="archive-create-form"
            type="submit"
          >
            {createMutation.isPending ? "正在创建…" : "创建归档任务"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
