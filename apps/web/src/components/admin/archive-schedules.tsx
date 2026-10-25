import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClockIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { Switch } from "@medihub/ui/components/switch";

import { archiveChunkLabel } from "#src/components/admin/archive-options.ts";
import { ArchiveScheduleDialog } from "#src/components/admin/archive-schedule-dialog.tsx";
import { Pill } from "#src/components/admin/badges.tsx";
import { storageDriverLabel } from "#src/components/admin/constants.ts";
import type {
  AdminViewer,
  ArchiveScheduleRow,
  StorageTargetRow,
} from "#src/components/admin/types.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

const padHour = (hour: number) => String(hour).padStart(2, "0");

const frequencyText = (schedule: ArchiveScheduleRow) => {
  const time = `${padHour(schedule.hour)}:00`;

  if (schedule.frequency === "daily") {
    return `每天 ${time}`;
  }

  if (schedule.frequency === "weekly") {
    return `每${WEEKDAY_LABELS[schedule.weekday] ?? "周"} ${time}`;
  }

  return `每月 ${schedule.dayOfMonth} 号 ${time}`;
};

const thresholdText = (beforeDays: number) =>
  `${beforeDays} 天前（约 ${(beforeDays / 365).toFixed(1)} 年）`;

const targetText = (targetId: string, targets: readonly StorageTargetRow[]) => {
  const target = targets.find((row) => row.id === targetId);

  return target
    ? `${target.name} · ${storageDriverLabel(target.driver)}`
    : targetId;
};

interface ScheduleRowProps {
  schedule: ArchiveScheduleRow;
  targets: readonly StorageTargetRow[];
  running: boolean;
  toggling: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onRunNow: () => void;
  onToggle: (enabled: boolean) => void;
}

const ScheduleRow = ({
  schedule,
  targets,
  running,
  toggling,
  onDelete,
  onEdit,
  onRunNow,
  onToggle,
}: ScheduleRowProps) => (
  <li className="grid gap-2 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <Switch
        aria-label={`${frequencyText(schedule)} 启用开关`}
        checked={schedule.enabled}
        disabled={toggling}
        onCheckedChange={onToggle}
      />
      <span className="font-medium">{frequencyText(schedule)}</span>
      <Pill tone={schedule.enabled ? "success" : "neutral"}>
        {schedule.enabled ? "已启用" : "已停用"}
      </Pill>

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <Button
          className="min-h-11 sm:min-h-7"
          disabled={running}
          onClick={onRunNow}
          size="sm"
          variant="outline"
        >
          <PlayIcon />
          {running ? "执行中…" : "立即执行"}
        </Button>
        <Button
          aria-label="编辑归档计划"
          className="size-11 sm:size-7"
          onClick={onEdit}
          size="icon-sm"
          title="编辑计划"
          variant="ghost"
        >
          <PencilIcon />
        </Button>
        <Button
          aria-label="删除归档计划"
          className="size-11 sm:size-7"
          onClick={onDelete}
          size="icon-sm"
          title="删除计划"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>

    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span>归档 {thresholdText(schedule.beforeDays)} 的素材</span>
      <span>目标：{targetText(schedule.targetId, targets)}</span>
      <span>分片：{archiveChunkLabel(schedule.chunkBytes)}</span>
      <span>{schedule.deleteSource ? "删除源文件" : "保留源文件"}</span>
    </div>

    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span>
        上次执行：
        {schedule.lastRunAt ? formatDateTime(schedule.lastRunAt) : "尚未执行"}
      </span>
      <span>
        上次结果：
        {schedule.lastError ? "失败" : schedule.lastRunAt ? "成功" : "尚未执行"}
      </span>
      <span>
        下次执行：
        {schedule.nextRunAt ? formatDateTime(schedule.nextRunAt) : "—"}
      </span>
    </div>

    {schedule.lastError ? (
      <p className="text-destructive text-xs break-all">
        上次执行失败：{schedule.lastError}
      </p>
    ) : null}
  </li>
);

interface ArchiveScheduleSectionProps {
  viewer: AdminViewer;
}

/** 归档计划：按天/周/月自动创建归档任务。 */
export const ArchiveScheduleSection = ({
  viewer,
}: ArchiveScheduleSectionProps) => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ArchiveScheduleRow | null>(null);

  const [pendingDelete, setPendingDelete] = useState<ArchiveScheduleRow | null>(
    null
  );

  const schedulesQuery = useQuery(
    api.archive.schedules.list.queryOptions({ input: {} })
  );

  const targetsQuery = useQuery(api.storage.list.queryOptions());
  const targets = targetsQuery.data ?? [];
  const schedules = schedulesQuery.data?.items ?? [];

  const updateMutation = useMutation(
    api.archive.schedules.update.mutationOptions({
      onSuccess: async () => {
        toast.success("归档计划已更新");
        await queryClient.invalidateQueries({
          queryKey: api.archive.schedules.key(),
        });
      },
    })
  );

  const removeMutation = useMutation(
    api.archive.schedules.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("归档计划已删除");
        setPendingDelete(null);
        await queryClient.invalidateQueries({
          queryKey: api.archive.schedules.key(),
        });
      },
    })
  );

  const runMutation = useMutation(
    api.archive.schedules.runNow.mutationOptions({
      onSuccess: async () => {
        toast.success("已发起一次归档执行");
        await queryClient.invalidateQueries({
          queryKey: api.archive.schedules.key(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.archive.list.key(),
        });
      },
    })
  );

  const pendingUpdateId = updateMutation.isPending
    ? updateMutation.variables?.id
    : undefined;

  const pendingRunId = runMutation.isPending
    ? runMutation.variables?.id
    : undefined;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-0.5">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <CalendarClockIcon className="text-muted-foreground size-4" />
            归档计划
          </h3>
          <p className="text-muted-foreground max-w-3xl text-xs text-pretty">
            按天/周/月自动把旧素材归档到指定目标；本地目标仅允许单次预计小于
            200MB 的任务，超过请使用 NAS/S3。
          </p>
        </div>
        <Button className="min-h-11 sm:min-h-8" onClick={openCreate} size="sm">
          <PlusIcon />
          新建计划
        </Button>
      </div>

      {schedulesQuery.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!schedulesQuery.isPending && schedulesQuery.isError ? (
        <EmptyState
          action={
            <Button
              onClick={() => {
                void schedulesQuery.refetch();
              }}
              variant="outline"
            >
              重试
            </Button>
          }
          description="无法读取归档计划，请稍后重试。"
          icon={CalendarClockIcon}
          title="归档计划加载失败"
        />
      ) : null}

      {!schedulesQuery.isPending &&
      !schedulesQuery.isError &&
      schedules.length === 0 ? (
        <EmptyState
          action={<Button onClick={openCreate}>新建计划</Button>}
          description="创建一个每月自动归档旧素材的计划，免去手工操作。"
          icon={CalendarClockIcon}
          title="还没有归档计划"
        />
      ) : null}

      {schedules.length > 0 ? (
        <section className="bg-card ring-foreground/10 overflow-hidden rounded-xl text-sm ring-1">
          <ul className="divide-border divide-y">
            {schedules.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                onDelete={() => {
                  setPendingDelete(schedule);
                }}
                onEdit={() => {
                  setEditing(schedule);
                  setDialogOpen(true);
                }}
                onRunNow={() => {
                  runMutation.mutate({ id: schedule.id });
                }}
                onToggle={(enabled) => {
                  updateMutation.mutate({ enabled, id: schedule.id });
                }}
                running={pendingRunId === schedule.id}
                schedule={schedule}
                targets={targets}
                toggling={pendingUpdateId === schedule.id}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {dialogOpen ? (
        <ArchiveScheduleDialog
          key={editing?.id ?? "create"}
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          schedule={editing}
          viewer={viewer}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除"
        description={
          pendingDelete
            ? `将删除「${frequencyText(pendingDelete)}」的归档计划，已创建的归档任务不受影响。`
            : undefined
        }
        isPending={removeMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) {
            removeMutation.mutate({ id: pendingDelete.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
        title="删除归档计划？"
        tone="destructive"
      />
    </div>
  );
};
