import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDriveIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { cn } from "@medihub/ui/lib/utils";

import type {
  AdminViewer,
  DiskUsage,
  OrganizationUsage,
  StorageUsage,
} from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";
import { formatBytes } from "#src/lib/format.ts";

const GB = 1024 ** 3;

const bytesToGbInput = (bytes: number | null) => {
  if (bytes === null) {
    return "";
  }

  return String(Math.round((bytes / GB) * 100) / 100);
};

const usageTone = (percent: number | null) => {
  if (percent === null) {
    return "bg-muted-foreground/30";
  }

  if (percent > 100) {
    return "bg-destructive";
  }

  return percent > 80 ? "bg-warning" : "bg-primary";
};

const driveTone = (percent: number) => {
  if (percent > 95) {
    return "bg-destructive";
  }

  return percent > 80 ? "bg-warning" : "bg-primary";
};

interface UsageBarProps {
  percent: number | null;
}

const UsageBar = ({ percent }: UsageBarProps) => (
  <div
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={
      percent === null ? undefined : Math.min(100, Math.round(percent))
    }
    className="bg-muted h-2 overflow-hidden rounded-full"
    role="progressbar"
  >
    <div
      className={cn("h-full rounded-full transition-all", usageTone(percent))}
      style={{ width: `${percent === null ? 0 : Math.min(100, percent)}%` }}
    />
  </div>
);

interface QuotaEditorProps {
  id: string;
  label: string;
  quotaBytes: number | null;
  usedBytes: number;
  pending: boolean;
  onSave: (quotaBytes: number | null) => void;
}

const QuotaEditor = ({
  id,
  label,
  quotaBytes,
  usedBytes,
  pending,
  onSave,
}: QuotaEditorProps) => {
  const [value, setValue] = useState(() => bytesToGbInput(quotaBytes));
  const [error, setError] = useState<string | null>(null);

  const percent =
    quotaBytes === null
      ? null
      : quotaBytes > 0
        ? (usedBytes / quotaBytes) * 100
        : usedBytes > 0
          ? 100
          : 0;

  const handleSave = () => {
    const raw = value.trim();

    if (raw === "") {
      setError(null);
      onSave(null);

      return;
    }

    const gb = Number(raw);

    if (!Number.isFinite(gb) || gb < 0) {
      setError("请输入不小于 0 的 GB 数值");

      return;
    }

    const bytes = Math.round(gb * GB);

    if (!Number.isSafeInteger(bytes)) {
      setError("配额数值过大，请重新输入");

      return;
    }

    setError(null);
    onSave(bytes);
  };

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          已用 {formatBytes(usedBytes)} /{" "}
          {quotaBytes === null ? "不限制" : formatBytes(quotaBytes)}
        </span>
      </div>

      <UsageBar percent={percent} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label className="text-xs" htmlFor={`quota-${id}`}>
            上限（GB）
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              className="w-32"
              id={`quota-${id}`}
              min={0}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              placeholder="不限制"
              step="0.1"
              type="number"
              value={value}
            />
            <span className="text-muted-foreground text-xs">GB</span>
          </div>
        </div>
        <Button
          className="min-h-11 sm:min-h-8"
          disabled={pending}
          onClick={handleSave}
          size="sm"
          variant="outline"
        >
          {pending ? "保存中…" : "保存"}
        </Button>
        {percent === null ? null : (
          <span className="text-muted-foreground text-xs tabular-nums">
            已用 {Math.round(percent)}%
          </span>
        )}
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
};

interface DiskRowProps {
  disk: DiskUsage;
}

const DiskRow = ({ disk }: DiskRowProps) => {
  const usedBytes = Math.max(0, disk.totalBytes - disk.freeBytes);
  const percent = disk.totalBytes > 0 ? (usedBytes / disk.totalBytes) * 100 : 0;

  return (
    <div className="grid gap-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{disk.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          剩余 {formatBytes(disk.freeBytes)} / 共 {formatBytes(disk.totalBytes)}
        </span>
      </div>
      <span className="text-muted-foreground font-mono text-xs break-all">
        {disk.rootPath}
      </span>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.min(100, Math.round(percent))}
        className="bg-muted h-2 overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className={cn("h-full rounded-full", driveTone(percent))}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        已用 {Math.round(percent)}%
      </span>
    </div>
  );
};

interface StorageQuotaCardProps {
  viewer: AdminViewer;
}

/** 存储配额：全站/科室上限与磁盘剩余，root 可跨科室。 */
export const StorageQuotaCard = ({ viewer }: StorageQuotaCardProps) => {
  const queryClient = useQueryClient();
  const isRoot = viewer.role === "root";

  const usageQuery = useQuery(api.storage.usage.queryOptions());

  const setQuotaMutation = useMutation(
    api.storage.setQuota.mutationOptions({
      onSuccess: async () => {
        toast.success("存储配额已更新");
        await queryClient.invalidateQueries({ queryKey: api.storage.key() });
      },
    })
  );

  const pendingTarget = setQuotaMutation.isPending
    ? (setQuotaMutation.variables?.organizationId ?? "global")
    : null;

  const usage: StorageUsage | undefined = usageQuery.data;

  const saveQuota =
    (organizationId: string | null) => (quotaBytes: number | null) => {
      setQuotaMutation.mutate({ organizationId, quotaBytes });
    };

  return (
    <section className="bg-card ring-foreground/10 grid gap-4 rounded-xl p-4 text-sm ring-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-0.5">
          <h2 className="flex items-center gap-2 font-medium">
            <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg">
              <HardDriveIcon className="size-4" />
            </span>
            存储配额
          </h2>
          <p className="text-muted-foreground text-xs text-pretty">
            上传会按「科室配额 → 全站上限 → 磁盘剩余（保留
            512MB）」依次校验；上限留空表示不限制。
          </p>
        </div>
        <Button
          disabled={usageQuery.isFetching}
          onClick={() => {
            void usageQuery.refetch();
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCwIcon
            className={usageQuery.isFetching ? "animate-spin" : undefined}
          />
          刷新
        </Button>
      </div>

      {usageQuery.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!usageQuery.isPending && !usage ? (
        <p className="text-destructive rounded-lg border border-dashed p-3 text-xs">
          用量读取失败，请点击「刷新」重试。
        </p>
      ) : null}

      {usage ? (
        <>
          {isRoot ? (
            <QuotaEditor
              id="global"
              key={`global-${usage.global.quotaBytes ?? "none"}`}
              label="全站上限"
              onSave={saveQuota(null)}
              pending={pendingTarget === "global"}
              quotaBytes={usage.global.quotaBytes}
              usedBytes={usage.global.usedBytes}
            />
          ) : null}

          <div className="grid gap-2">
            <h3 className="text-xs font-medium">科室配额</h3>
            {usage.organizations.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                当前账号没有可管理的科室。
              </p>
            ) : (
              usage.organizations.map((organization: OrganizationUsage) => (
                <QuotaEditor
                  id={organization.id}
                  key={`${organization.id}-${organization.quotaBytes ?? "none"}`}
                  label={organization.name}
                  onSave={saveQuota(organization.id)}
                  pending={pendingTarget === organization.id}
                  quotaBytes={organization.quotaBytes}
                  usedBytes={organization.usedBytes}
                />
              ))
            )}
          </div>

          <div className="grid gap-2">
            <h3 className="text-xs font-medium">磁盘剩余</h3>
            {usage.disks.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                没有可读取的本地或 NAS 存储目标。
              </p>
            ) : (
              usage.disks.map((disk) => (
                <DiskRow disk={disk} key={disk.targetId} />
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  );
};
