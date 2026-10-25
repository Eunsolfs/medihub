import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackupIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { Pill } from "#src/components/admin/badges.tsx";
import type { PillTone } from "#src/components/admin/badges.tsx";
import { storageDriverLabel } from "#src/components/admin/constants.ts";
import type { MirrorJobRow } from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";
import { formatBytes, formatDateTime } from "#src/lib/format.ts";

const DEFAULT_TARGET = "__default__";
const ACTIVE_STATUSES = new Set(["pending", "running"]);

const statusMeta = (status: string): { label: string; tone: PillTone } => {
  if (status === "ready") {
    return { label: "完成", tone: "success" };
  }

  if (status === "failed") {
    return { label: "失败", tone: "danger" };
  }

  if (status === "pruned") {
    return { label: "已清理", tone: "neutral" };
  }

  return { label: "进行中", tone: "info" };
};

interface MirrorJobRowItemProps {
  job: MirrorJobRow;
  onRestore: (job: MirrorJobRow) => void;
}

const MirrorJobRowItem = ({ job, onRestore }: MirrorJobRowItemProps) => {
  const meta = statusMeta(job.status);

  return (
    <li className="grid gap-1.5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={meta.tone}>{meta.label}</Pill>
        <span className="text-muted-foreground text-xs tabular-nums">
          {formatDateTime(job.createdAt)}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {job.includeAssets ? "含素材文件" : "仅数据库快照"}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{job.assetCount} 个素材</span>
        <span>{formatBytes(job.byteSize)}</span>
        {job.completedAt ? (
          <span>完成于 {formatDateTime(job.completedAt)}</span>
        ) : null}
      </div>
      {job.status === "failed" && job.error ? (
        <p className="text-destructive text-xs break-all">{job.error}</p>
      ) : null}
      {job.status === "ready" ? (
        <div>
          <Button
            className="min-h-11 sm:min-h-7"
            onClick={() => {
              onRestore(job);
            }}
            size="sm"
            variant="outline"
          >
            从该镜像恢复
          </Button>
        </div>
      ) : null}
    </li>
  );
};

/** 镜像备份：把 SQLite 快照（可选含素材）复制到目标存储，仅 root 可见。 */
export const MirrorBackupCard = () => {
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = useState(DEFAULT_TARGET);
  const [includeAssets, setIncludeAssets] = useState(false);
  const [restoreJob, setRestoreJob] = useState<MirrorJobRow | null>(null);
  const [restoreAssets, setRestoreAssets] = useState(true);

  const statusQuery = useQuery(api.mirror.status.queryOptions());

  const listQuery = useQuery({
    ...api.mirror.list.queryOptions({ input: { page: 1, pageSize: 10 } }),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];

      return items.some((item) => ACTIVE_STATUSES.has(item.status))
        ? 5000
        : false;
    },
    retry: false,
  });

  const runMutation = useMutation(
    api.mirror.run.mutationOptions({
      onSuccess: async () => {
        toast.success("镜像任务已创建");
        await queryClient.invalidateQueries({
          queryKey: api.mirror.status.key(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.mirror.list.key(),
        });
      },
    })
  );

  const restoreMutation = useMutation(
    api.mirror.restore.mutationOptions({
      onSuccess: async () => {
        toast.success(
          "恢复已准备，请重启服务生效（sudo systemctl restart medihub）"
        );
        setRestoreJob(null);
        await queryClient.invalidateQueries({
          queryKey: api.mirror.status.key(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.mirror.list.key(),
        });
      },
    })
  );

  const openRestore = (job: MirrorJobRow) => {
    restoreMutation.reset();
    setRestoreAssets(true);
    setRestoreJob(job);
  };

  const targets = statusQuery.data?.targets ?? [];
  const jobs = listQuery.data?.items ?? [];

  return (
    <section className="bg-card ring-foreground/10 grid gap-4 rounded-xl p-4 text-sm ring-1">
      <div className="grid gap-0.5">
        <h2 className="flex items-center gap-2 font-medium">
          <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg">
            <DatabaseBackupIcon className="size-4" />
          </span>
          镜像备份
        </h2>
        <p className="text-muted-foreground text-xs text-pretty">
          数据库快照始终包含；素材多时耗时较长，建议指向
          NAS/S3。每个存储目标只保留最近 2
          份镜像，更早的会自动清理（状态显示已清理）。仅超级管理员可见。
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <span className="text-xs font-medium">目标存储</span>
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
              <SelectTrigger
                aria-label="镜像目标存储"
                className="w-full"
                id="mirror-target"
              >
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
          </div>

          <Button
            className="min-h-11 w-full sm:min-h-8 sm:w-auto"
            disabled={runMutation.isPending}
            onClick={() => {
              runMutation.mutate({
                includeAssets,
                ...(targetId === DEFAULT_TARGET ? {} : { targetId }),
              });
            }}
          >
            <PlayIcon />
            {runMutation.isPending ? "正在创建…" : "立即镜像"}
          </Button>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5">
          <Checkbox
            checked={includeAssets}
            className="mt-0.5"
            onCheckedChange={(checked) => {
              setIncludeAssets(checked);
            }}
          />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">同时复制素材文件</span>
            <span className="text-muted-foreground text-xs">
              不勾选时只备份数据库快照。
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-2">
        <h3 className="text-xs font-medium">最近任务</h3>

        {listQuery.isPending ? (
          <div className="grid gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : null}

        {!listQuery.isPending && jobs.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            还没有镜像任务，创建一次备份以验证目标可用。
          </p>
        ) : null}

        {jobs.length > 0 ? (
          <ul className="divide-border divide-y rounded-lg border">
            {jobs.map((job) => (
              <MirrorJobRowItem
                job={job}
                key={job.id}
                onRestore={openRestore}
              />
            ))}
          </ul>
        ) : null}

        {listQuery.isError && listQuery.data ? (
          <p className="text-warning text-xs">
            镜像任务刷新失败，显示上次结果。
          </p>
        ) : null}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setRestoreJob(null);
          }
        }}
        open={restoreJob !== null}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>从这份镜像恢复</DialogTitle>
            <DialogDescription>
              将用该快照全量替换当前数据库（不是增量），恢复后需重启服务生效；恢复前会自动备份当前数据库。
            </DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3">
            <Checkbox
              checked={restoreAssets}
              className="mt-0.5"
              onCheckedChange={(checked) => {
                setRestoreAssets(checked);
              }}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">同时恢复素材文件</span>
              <span className="text-muted-foreground text-xs">
                素材会从镜像复制回原存储位置。
              </span>
            </span>
          </label>

          {restoreMutation.isError ? (
            <p className="text-destructive text-xs break-all">
              {restoreMutation.error instanceof Error
                ? restoreMutation.error.message
                : "恢复失败，请稍后重试"}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              className="min-h-11 sm:min-h-8"
              onClick={() => {
                setRestoreJob(null);
              }}
              variant="outline"
            >
              取消
            </Button>
            <Button
              className="min-h-11 sm:min-h-8"
              disabled={restoreMutation.isPending || !restoreJob}
              onClick={() => {
                if (restoreJob) {
                  restoreMutation.mutate({
                    id: restoreJob.id,
                    restoreAssets,
                  });
                }
              }}
            >
              {restoreMutation.isPending ? "正在恢复…" : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
