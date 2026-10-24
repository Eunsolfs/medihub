import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  DownloadIcon,
  FileArchiveIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { DataTableShell } from "#src/components/app-shell/ui/data-table-shell.tsx";
import type { DataTableColumn } from "#src/components/app-shell/ui/data-table-shell.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { ExportCreateDialog } from "#src/components/exports/export-create-dialog.tsx";
import { ExportStatusBadge } from "#src/components/exports/export-status-badge.tsx";
import {
  exportDownloadUrl,
  exportKindLabel,
  isActiveExport,
} from "#src/components/exports/exports-api.ts";
import type {
  ExportJob,
  ExportStatus,
} from "#src/components/exports/exports-api.ts";
import { api } from "#src/lib/api.ts";
import { formatBytes, formatDateTime } from "#src/lib/format.ts";

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 3000;

/**
 * 列定义放在组件外：cell 只是返回节点的渲染函数，
 * 不该随着每次渲染重新创建。删除动作通过工厂注入。
 */
const buildColumns = (
  onDelete: (job: ExportJob) => void
): readonly DataTableColumn<ExportJob>[] => [
  {
    cell: (job) => (
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg"
        >
          <FileArchiveIcon className="size-4" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">
            {job.fileName ?? "正在生成压缩包…"}
          </span>
          <span className="text-muted-foreground text-xs">
            {exportKindLabel(job.kind)}
          </span>
        </span>
      </div>
    ),
    header: "导出任务",
    key: "task",
  },
  {
    cell: (job) => <ExportStatusBadge status={job.status} />,
    header: "状态",
    key: "status",
  },
  {
    cell: (job) => (
      <span className="tabular-nums">
        {job.byteSize ? formatBytes(job.byteSize) : "—"}
      </span>
    ),
    header: "文件大小",
    key: "size",
  },
  {
    cell: (job) => (
      <span className="tabular-nums">{job.assetCount ?? 0} 个素材</span>
    ),
    header: "内容",
    key: "assetCount",
  },
  {
    cell: (job) => (
      <span className="text-muted-foreground whitespace-nowrap tabular-nums">
        {formatDateTime(job.createdAt)}
      </span>
    ),
    header: "创建时间",
    key: "createdAt",
    mobileHidden: true,
  },
  {
    align: "right",
    cell: (job) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          disabled={job.status !== "ready"}
          nativeButton={false}
          render={
            <a
              aria-label={`下载 ${job.fileName ?? "导出包"}`}
              href={exportDownloadUrl(job.id)}
            />
          }
          size="sm"
          variant="outline"
        >
          <DownloadIcon />
          下载
        </Button>
        <Button
          aria-label={`删除导出 ${job.fileName ?? job.id}`}
          onClick={() => {
            onDelete(job);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      </div>
    ),
    header: "",
    key: "actions",
  },
];

const ExportsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExportJob | null>(null);
  const previousStatus = useRef<Map<string, ExportStatus>>(new Map());

  const listQuery = useQuery(
    api.exports.list.queryOptions({ input: { page, pageSize: PAGE_SIZE } })
  );

  const jobs = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const hasActive = jobs.some((job) => isActiveExport(job.status));

  // 有任务在打包时每 3 秒刷新一次；终态后立刻停表，组件卸载时清掉定时器。
  useEffect(() => {
    const timer = hasActive
      ? window.setInterval(() => {
          void queryClient.invalidateQueries({
            queryKey: api.exports.list.key({ type: "query" }),
          });
        }, POLL_INTERVAL_MS)
      : undefined;

    return () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [hasActive, queryClient]);

  // 从「排队中/打包中」变成「已完成」时提醒一次，轮询与手动刷新都覆盖。
  useEffect(() => {
    const items = listQuery.data?.items;

    if (!items) {
      return;
    }

    const next = new Map<string, ExportStatus>();

    for (const job of items) {
      next.set(job.id, job.status);
      const before = previousStatus.current.get(job.id);

      if (before && isActiveExport(before) && job.status === "ready") {
        toast.success(`「${job.fileName ?? "导出包"}」已完成，可以下载`);
      }
    }

    previousStatus.current = next;
  }, [listQuery.data]);

  const refreshList = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.exports.list.key({ type: "query" }),
    });
  };

  const removeMutation = useMutation(
    api.exports.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("导出记录已删除");
        setPendingDelete(null);
        await refreshList();
      },
    })
  );

  const columns = buildColumns(setPendingDelete);

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            新建导出
          </Button>
        }
        description="把一次就诊、一场学习会议或挑中的素材打包成压缩包，用于科研与病例汇报。"
        meta={
          <>
            <span>共 {total} 个导出任务</span>
            {hasActive ? (
              <span className="text-info">有任务正在打包，列表自动刷新中</span>
            ) : null}
          </>
        }
        title="导出中心"
      />

      <DataTableShell
        actions={
          <Button
            disabled={listQuery.isFetching}
            onClick={() => {
              void refreshList();
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon />
            刷新
          </Button>
        }
        columns={columns}
        emptyState={
          <EmptyState
            action={
              <Button
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                新建导出
              </Button>
            }
            description="选一个患者、一次就诊或一场会议，系统会在后台把资料打包好。"
            icon={FileArchiveIcon}
            title="还没有导出任务"
          />
        }
        footer={
          total > PAGE_SIZE ? (
            <PaginationBar
              onPageChange={setPage}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
            />
          ) : null
        }
        isLoading={listQuery.isPending}
        rowKey={(job) => job.id}
        rows={jobs}
      />

      <ExportCreateDialog onOpenChange={setCreateOpen} open={createOpen} />

      <ConfirmDialog
        confirmLabel="删除"
        description={
          pendingDelete
            ? `将删除「${pendingDelete.fileName ?? "这条导出记录"}」，已生成的压缩包也会一并清理。`
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
        title="删除导出记录？"
        tone="destructive"
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/exports")({
  component: ExportsPage,
});
