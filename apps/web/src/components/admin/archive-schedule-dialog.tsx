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

import {
  ARCHIVE_CHUNK_OPTIONS,
  DEFAULT_ARCHIVE_CHUNK_BYTES,
} from "#src/components/admin/archive-options.ts";
import { storageDriverLabel } from "#src/components/admin/constants.ts";
import type {
  AdminViewer,
  ArchiveScheduleRow,
} from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";
import { useOrgScope } from "#src/lib/org-scope.ts";

const FREQUENCY_OPTIONS = [
  { label: "每天", value: "daily" },
  { label: "每周", value: "weekly" },
  { label: "每月", value: "monthly" },
] as const;

const WEEKDAY_OPTIONS = [
  { label: "周一", value: "1" },
  { label: "周二", value: "2" },
  { label: "周三", value: "3" },
  { label: "周四", value: "4" },
  { label: "周五", value: "5" },
  { label: "周六", value: "6" },
  { label: "周日", value: "7" },
] as const;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  label: `${String(hour).padStart(2, "0")}:00`,
  value: String(hour),
}));

const DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => ({
  label: `${index + 1} 号`,
  value: String(index + 1),
}));

interface ArchiveScheduleDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  schedule: ArchiveScheduleRow | null;
  viewer: AdminViewer;
}

/** 新建 / 编辑定时归档计划。 */
export const ArchiveScheduleDialog = ({
  onOpenChange,
  open,
  schedule,
  viewer,
}: ArchiveScheduleDialogProps) => {
  const queryClient = useQueryClient();
  const isRoot = viewer.role === "root";
  const editing = schedule !== null;
  const { currentOrganization, organizations } = useOrgScope();

  const [frequency, setFrequency] = useState<ArchiveScheduleRow["frequency"]>(
    schedule?.frequency ?? "monthly"
  );

  const [hour, setHour] = useState(String(schedule?.hour ?? 3));
  const [weekday, setWeekday] = useState(String(schedule?.weekday ?? 1));

  const [dayOfMonth, setDayOfMonth] = useState(
    String(schedule?.dayOfMonth ?? 1)
  );

  const [beforeDays, setBeforeDays] = useState(
    String(schedule?.beforeDays ?? 730)
  );

  const [chunkBytes, setChunkBytes] = useState(
    String(schedule?.chunkBytes ?? DEFAULT_ARCHIVE_CHUNK_BYTES)
  );

  const [targetId, setTargetId] = useState(schedule?.targetId ?? "");

  const [deleteSource, setDeleteSource] = useState(
    schedule?.deleteSource ?? true
  );

  const [organizationId, setOrganizationId] = useState(
    schedule?.organizationId ??
      currentOrganization?.id ??
      organizations[0]?.id ??
      ""
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const targetsQuery = useQuery({
    ...api.storage.list.queryOptions(),
    enabled: open,
  });

  const targets = targetsQuery.data ?? [];

  const targetOptions = targets.map((target) => ({
    label: `${target.name} · ${storageDriverLabel(target.driver)}`,
    value: target.id,
  }));

  if (
    schedule?.targetId &&
    !targets.some((target) => target.id === schedule.targetId)
  ) {
    targetOptions.push({
      label: "当前目标（当前列表不可见）",
      value: schedule.targetId,
    });
  }

  const selectedTarget = targets.find((target) => target.id === targetId);
  const localTargetWarning = selectedTarget?.driver === "local";

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.archive.schedules.key(),
    });
    await queryClient.invalidateQueries({ queryKey: api.archive.key() });
  };

  const createMutation = useMutation(
    api.archive.schedules.create.mutationOptions({
      onSuccess: async () => {
        toast.success("归档计划已创建");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const updateMutation = useMutation(
    api.archive.schedules.update.mutationOptions({
      onSuccess: async () => {
        toast.success("归档计划已更新");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const days = Number(beforeDays);

    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setErrorMessage("归档天数需为 1–3650 的整数");

      return;
    }

    if (!targetId) {
      setErrorMessage("请选择存储目标");

      return;
    }

    if (isRoot && !editing && !organizationId) {
      setErrorMessage("请选择要归档的科室");

      return;
    }

    const timing = {
      beforeDays: days,
      chunkBytes: Number(chunkBytes),
      dayOfMonth: Number(dayOfMonth),
      deleteSource,
      frequency,
      hour: Number(hour),
      targetId,
      weekday: Number(weekday),
    };

    if (schedule) {
      updateMutation.mutate({ ...timing, id: schedule.id });

      return;
    }

    createMutation.mutate({
      ...timing,
      ...(isRoot ? { organizationId } : {}),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑归档计划" : "新建归档计划"}</DialogTitle>
          <DialogDescription>
            按天/周/月自动归档旧素材。本地存储目标仅允许单次预计归档小于
            200MB，超过请改用 NAS/S3。
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="archive-schedule-form"
          onSubmit={handleSubmit}
        >
          {errorMessage ? (
            <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
              {errorMessage}
            </p>
          ) : null}

          {isRoot ? (
            editing ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
                归档科室：
                {organizations.find(
                  (row) => row.id === schedule?.organizationId
                )?.name ?? schedule?.organizationId}
                （创建后不可修改）
              </p>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="schedule-organization">归档科室</Label>
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
                  <SelectTrigger className="w-full" id="schedule-organization">
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
            )
          ) : (
            <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
              计划只归档本科室的数据。
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="schedule-frequency">频率</Label>
              <Select
                items={FREQUENCY_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                onValueChange={(value) => {
                  if (
                    value === "daily" ||
                    value === "weekly" ||
                    value === "monthly"
                  ) {
                    setFrequency(value);
                  }
                }}
                value={frequency}
              >
                <SelectTrigger className="w-full" id="schedule-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="schedule-hour">执行时刻</Label>
              <Select
                items={HOUR_OPTIONS}
                onValueChange={(value) => {
                  if (typeof value === "string") {
                    setHour(value);
                  }
                }}
                value={hour}
              >
                <SelectTrigger className="w-full" id="schedule-hour">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {frequency === "weekly" ? (
              <div className="grid gap-2">
                <Label htmlFor="schedule-weekday">每周几</Label>
                <Select
                  items={WEEKDAY_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setWeekday(value);
                    }
                  }}
                  value={weekday}
                >
                  <SelectTrigger className="w-full" id="schedule-weekday">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {frequency === "monthly" ? (
              <div className="grid gap-2">
                <Label htmlFor="schedule-day">每月几号</Label>
                <Select
                  items={DAY_OPTIONS.map((option) => ({
                    label: option.label,
                    value: option.value,
                  }))}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setDayOfMonth(value);
                    }
                  }}
                  value={dayOfMonth}
                >
                  <SelectTrigger className="w-full" id="schedule-day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label htmlFor="schedule-before-days">归档多少天前</Label>
              <Input
                id="schedule-before-days"
                max={3650}
                min={1}
                onChange={(event) => {
                  setBeforeDays(event.target.value);
                }}
                type="number"
                value={beforeDays}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="schedule-chunk-size">分片大小</Label>
            <Select
              items={ARCHIVE_CHUNK_OPTIONS.map((option) => ({
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
              <SelectTrigger className="w-full" id="schedule-chunk-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARCHIVE_CHUNK_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              分片越小越省内存，但片数更多。
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="schedule-target">存储目标</Label>
            <Select
              items={targetOptions}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setTargetId(value);
                }
              }}
              value={targetId === "" ? null : targetId}
            >
              <SelectTrigger className="w-full" id="schedule-target">
                <SelectValue placeholder="选择存储目标" />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {localTargetWarning ? (
              <p className="text-warning text-xs">
                本地目标仅在单次预计归档小于 200MB 时允许执行，否则请选 NAS/S3
                目标。
              </p>
            ) : null}
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
                取消勾选则保留原文件。
              </span>
            </span>
          </label>
        </form>

        <DialogFooter>
          <Button
            className="min-h-11 sm:min-h-8"
            onClick={() => {
              onOpenChange(false);
            }}
            variant="outline"
          >
            取消
          </Button>
          <Button
            className="min-h-11 sm:min-h-8"
            disabled={isPending}
            form="archive-schedule-form"
            type="submit"
          >
            {isPending ? "正在保存…" : editing ? "保存修改" : "创建计划"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
