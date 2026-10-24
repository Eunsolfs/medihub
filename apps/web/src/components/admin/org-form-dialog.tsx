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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Textarea } from "@medihub/ui/components/textarea";

import {
  ORG_KIND_VALUES,
  isOrgKind,
  orgKindLabel,
} from "#src/components/admin/constants.ts";
import type { OrgKind, OrgRow } from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";

interface OrgFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入即为编辑模式 */
  org: OrgRow | null;
}

/** 新建 / 编辑科室：短码会进入导出文件名与分享链接，创建后谨慎修改。 */
export const OrgFormDialog = ({
  open,
  onOpenChange,
  org,
}: OrgFormDialogProps) => {
  const queryClient = useQueryClient();
  const editing = org !== null;

  const [name, setName] = useState(org?.name ?? "");
  const [code, setCode] = useState(org?.code ?? "");
  const [kind, setKind] = useState<OrgKind>(org?.kind ?? "department");
  const [description, setDescription] = useState(org?.description ?? "");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: api.orgs.key() });
    await queryClient.invalidateQueries({ queryKey: api.users.key() });
  };

  const createMutation = useMutation(
    api.orgs.create.mutationOptions({
      onSuccess: async () => {
        toast.success("科室已创建");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const updateMutation = useMutation(
    api.orgs.update.mutationOptions({
      onSuccess: async () => {
        toast.success("科室信息已更新");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const values = {
      code: code.trim().toLowerCase(),
      description: description.trim() || null,
      kind,
      name: name.trim(),
    };

    if (org) {
      updateMutation.mutate({ ...values, id: org.id });
    } else {
      createMutation.mutate(values);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑科室" : "新建科室"}</DialogTitle>
          <DialogDescription>
            科室是数据可见范围的基本单位；短码只含小写字母、数字与连字符。
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="admin-org-form"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="admin-org-name">科室名称</Label>
              <Input
                id="admin-org-name"
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="如：耳鼻咽喉头颈外科"
                required
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-org-kind">类型</Label>
              <Select
                items={ORG_KIND_VALUES.map((value) => ({
                  label: orgKindLabel(value),
                  value,
                }))}
                onValueChange={(value) => {
                  if (typeof value === "string" && isOrgKind(value)) {
                    setKind(value);
                  }
                }}
                value={kind}
              >
                <SelectTrigger className="w-full" id="admin-org-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_KIND_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {orgKindLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="admin-org-code">短码</Label>
            <Input
              id="admin-org-code"
              maxLength={60}
              minLength={2}
              onChange={(event) => {
                setCode(event.target.value.toLowerCase());
              }}
              pattern="[a-z0-9][a-z0-9\\-]*"
              placeholder="如：ent"
              required
              title="只能包含小写字母、数字和连字符，且不能以连字符开头"
              value={code}
            />
            <p className="text-muted-foreground text-xs">
              用于导出文件名与分享链接，建议使用科室英文缩写。
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="admin-org-description">描述</Label>
            <Textarea
              id="admin-org-description"
              maxLength={400}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              placeholder="科室职能、收治范围等，成员在「我的」页面可以看到。"
              rows={3}
              value={description}
            />
          </div>
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
          <Button disabled={isPending} form="admin-org-form" type="submit">
            {isPending ? "正在保存…" : editing ? "保存修改" : "创建科室"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
