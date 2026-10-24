import { useMutation, useQueryClient } from "@tanstack/react-query";
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

import {
  STORAGE_DRIVER_VALUES,
  isStorageDriver,
  storageDriverLabel,
} from "#src/components/admin/constants.ts";
import type {
  AdminViewer,
  StorageDriver,
  StorageScope,
  StorageTargetRow,
} from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";

interface StorageFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入即为编辑模式 */
  target: StorageTargetRow | null;
  viewer: AdminViewer;
}

/** 新建 / 编辑存储目标：按驱动切换必填字段，密钥留空表示沿用旧值。 */
export const StorageFormDialog = ({
  open,
  onOpenChange,
  target,
  viewer,
}: StorageFormDialogProps) => {
  const queryClient = useQueryClient();
  const editing = target !== null;
  const isRoot = viewer.role === "root";
  const initialSummary = target?.summary ?? null;

  const [name, setName] = useState(target?.name ?? "");

  const [driver, setDriver] = useState<StorageDriver>(
    target?.driver ?? "local"
  );

  const [scope, setScope] = useState<StorageScope>(
    target?.scope ?? (isRoot ? "global" : "organization")
  );

  const [rootPath, setRootPath] = useState(
    initialSummary && initialSummary.kind !== "s3"
      ? initialSummary.rootPath
      : ""
  );

  const [endpoint, setEndpoint] = useState(
    initialSummary?.kind === "s3" ? (initialSummary.endpoint ?? "") : ""
  );

  const [region, setRegion] = useState(
    initialSummary?.kind === "s3" ? initialSummary.region : ""
  );

  const [bucket, setBucket] = useState(
    initialSummary?.kind === "s3" ? initialSummary.bucket : ""
  );

  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [forcePathStyle, setForcePathStyle] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: api.storage.key() });
  };

  const createMutation = useMutation(
    api.storage.create.mutationOptions({
      onSuccess: async () => {
        toast.success("存储目标已创建");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const updateMutation = useMutation(
    api.storage.update.mutationOptions({
      onSuccess: async () => {
        toast.success("存储目标已更新");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;
  const driverChanged = target !== null && target.driver !== driver;
  const requireCredentials = !editing || driverChanged;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const base = { driver, name: name.trim() };

    const config =
      driver === "s3"
        ? {
            bucket: bucket.trim(),
            region: region.trim(),
            forcePathStyle,
            ...(endpoint.trim() ? { endpoint: endpoint.trim() } : {}),
            // 编辑时留空代表沿用旧密钥；后端做合并更新。
            ...(accessKeyId.trim() ? { accessKeyId: accessKeyId.trim() } : {}),
            ...(secretAccessKey.trim()
              ? { secretAccessKey: secretAccessKey.trim() }
              : {}),
          }
        : { rootPath: rootPath.trim() };

    if (target) {
      updateMutation.mutate({ ...base, ...config, id: target.id });

      return;
    }

    createMutation.mutate({
      ...base,
      ...config,
      isDefault,
      scope,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑存储目标" : "新建存储目标"}</DialogTitle>
          <DialogDescription>
            素材与导出包会写入默认目标；密钥由服务端加密保存，页面不会回显明文。
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="admin-storage-form"
          onSubmit={handleSubmit}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="admin-storage-name">名称</Label>
              <Input
                id="admin-storage-name"
                maxLength={80}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="如：科室 NAS"
                required
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-storage-driver">驱动</Label>
              <Select
                items={STORAGE_DRIVER_VALUES.map((value) => ({
                  label: storageDriverLabel(value),
                  value,
                }))}
                onValueChange={(value) => {
                  if (typeof value === "string" && isStorageDriver(value)) {
                    setDriver(value);
                  }
                }}
                value={driver}
              >
                <SelectTrigger className="w-full" id="admin-storage-driver">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STORAGE_DRIVER_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {storageDriverLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isRoot ? (
            editing ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">作用范围</p>
                <p className="text-muted-foreground flex h-8 items-center rounded-lg border border-dashed px-2.5 text-xs">
                  {target?.scope === "global"
                    ? "全部科室共用"
                    : `仅 ${target?.organizationName ?? "本科室"}`}
                </p>
                <p className="text-muted-foreground text-xs">
                  作用范围在创建后不可修改。
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm font-medium">作用范围</p>
                <Select
                  items={[
                    { label: "全部科室共用", value: "global" },
                    {
                      label: viewer.organizationId
                        ? "仅本科室"
                        : "仅本科室（当前账号未归属科室）",
                      value: "organization",
                    },
                  ]}
                  onValueChange={(value) => {
                    if (value === "global" || value === "organization") {
                      setScope(value);
                    }
                  }}
                  value={scope}
                >
                  <SelectTrigger className="w-full" id="admin-storage-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">全部科室共用</SelectItem>
                    <SelectItem
                      disabled={!viewer.organizationId}
                      value="organization"
                    >
                      仅本科室
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  全局目标对所有科室可见；本科室目标只有本科室管理员能管理。
                </p>
              </div>
            )
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
              科室管理员只能创建与管理本科室的存储目标。
            </p>
          )}

          {driver === "s3" ? (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="admin-storage-endpoint">
                    Endpoint（可选）
                  </Label>
                  <Input
                    id="admin-storage-endpoint"
                    maxLength={300}
                    onChange={(event) => {
                      setEndpoint(event.target.value);
                    }}
                    placeholder="如：https://minio.example.com"
                    value={endpoint}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="admin-storage-region">Region</Label>
                  <Input
                    id="admin-storage-region"
                    maxLength={80}
                    onChange={(event) => {
                      setRegion(event.target.value);
                    }}
                    placeholder="如：us-east-1"
                    required
                    value={region}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="admin-storage-bucket">Bucket</Label>
                <Input
                  id="admin-storage-bucket"
                  maxLength={120}
                  onChange={(event) => {
                    setBucket(event.target.value);
                  }}
                  placeholder="存放素材的存储桶"
                  required
                  value={bucket}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="admin-storage-access-key">
                    Access Key ID
                  </Label>
                  <Input
                    autoComplete="off"
                    id="admin-storage-access-key"
                    maxLength={200}
                    onChange={(event) => {
                      setAccessKeyId(event.target.value);
                    }}
                    placeholder={
                      editing ? "留空表示不修改" : "对象存储的访问密钥"
                    }
                    required={requireCredentials}
                    value={accessKeyId}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="admin-storage-secret-key">
                    Secret Access Key
                  </Label>
                  <Input
                    autoComplete="new-password"
                    id="admin-storage-secret-key"
                    maxLength={400}
                    onChange={(event) => {
                      setSecretAccessKey(event.target.value);
                    }}
                    placeholder={
                      editing ? "留空表示不修改" : "对象存储的私密密钥"
                    }
                    required={requireCredentials}
                    type="password"
                    value={secretAccessKey}
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
                <Checkbox
                  checked={forcePathStyle}
                  className="mt-0.5"
                  onCheckedChange={(checked) => {
                    setForcePathStyle(checked);
                  }}
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">使用路径风格访问</span>
                  <span className="text-muted-foreground text-xs">
                    MinIO、Ceph 等自建对象存储通常需要开启；AWS S3 保持关闭。
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="admin-storage-root-path">根路径</Label>
              <Input
                id="admin-storage-root-path"
                maxLength={500}
                onChange={(event) => {
                  setRootPath(event.target.value);
                }}
                placeholder="如：D:\\medihub\\storage 或 \\\\nas\\medihub"
                required
                value={rootPath}
              />
              <p className="text-muted-foreground text-xs">
                {driver === "nas"
                  ? "填写已挂载到服务器的 NAS 路径。"
                  : "填写服务器本地可写的目录。"}
              </p>
            </div>
          )}

          {editing ? null : (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
              <Checkbox
                checked={isDefault}
                className="mt-0.5"
                onCheckedChange={(checked) => {
                  setIsDefault(checked);
                }}
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">创建后设为默认</span>
                <span className="text-muted-foreground text-xs">
                  同一作用范围内会自动取消旧的默认目标。
                </span>
              </span>
            </label>
          )}
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
          <Button disabled={isPending} form="admin-storage-form" type="submit">
            {isPending ? "正在保存…" : editing ? "保存修改" : "创建存储目标"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
