import { useQuery } from "@tanstack/react-query";
import {
  ArchiveIcon,
  DownloadIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { ArchiveCreateDialog } from "#src/components/admin/archive-create-dialog.tsx";
import { Pill } from "#src/components/admin/badges.tsx";
import type { PillTone } from "#src/components/admin/badges.tsx";
import type {
  AdminViewer,
  ArchiveChunkRow,
  ArchiveJobRow,
} from "#src/components/admin/types.ts";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { api } from "#src/lib/api.ts";
import { formatBytes, formatDate, formatDateTime } from "#src/lib/format.ts";

const ACTIVE_STATUSES = new Set(["pending", "running"]);

const statusMeta = (status: string): { label: string; tone: PillTone } => {
  if (status === "ready") {
    return { label: "完成", tone: "success" };
  }

  if (status === "failed") {
    return { label: "失败", tone: "danger" };
  }

  return { label: "打包中", tone: status === "running" ? "info" : "warning" };
};

const archiveDownloadUrl = (archiveId: string, index: number) =>
  `/api/archive/${archiveId}/${index}`;

interface ArchiveChunkLinksProps {
  archiveId: string;
}

/** 分片列表在详情接口里，只有打包完成的任务才需要拉取。 */
const ArchiveChunkLinks = ({ archiveId }: ArchiveChunkLinksProps) => {
  const detailQuery = useQuery({
    ...api.archive.get.queryOptions({ input: { id: archiveId } }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (detailQuery.isPending) {
    return <Skeleton className="h-7 w-40" />;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <p className="text-muted-foreground text-xs">
        分片信息读取失败，请刷新后重试。
      </p>
    );
  }

  const chunks: ArchiveChunkRow[] = detailQuery.data.chunks ?? [];

  if (chunks.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        这个任务还没有可下载的分片。
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {chunks.map((chunk) => (
        <Button
          className="min-h-11 sm:min-h-7"
          key={chunk.index}
          render={
            <a
              aria-label={`下载第 ${chunk.index + 1} 片`}
              download
              href={archiveDownloadUrl(archiveId, chunk.index)}
            />
          }
          size="sm"
          variant="outline"
        >
          <DownloadIcon />
          下载第 {chunk.index + 1} 片
          <span className="text-muted-foreground text-xs">
            {formatBytes(chunk.size)}
          </span>
        </Button>
      ))}
    </div>
  );
};

const ArchiveRow = ({ job }: { job: ArchiveJobRow }) => {
  const meta = statusMeta(job.status);
  const active = ACTIVE_STATUSES.has(job.status);

  return (
    <li className="grid gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={meta.tone}>{meta.label}</Pill>
        <span className="text-muted-foreground text-xs tabular-nums">
          创建于 {formatDateTime(job.createdAt)}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          截止 {formatDate(job.beforeAt)}
        </span>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{job.assetCount} 个素材</span>
        <span>{formatBytes(job.byteSize)}</span>
        <span>{job.chunkCount} 个分片</span>
        <span>{job.deleteSource ? "归档后删除源文件" : "保留源文件"}</span>
      </div>

      {job.status === "failed" && job.error ? (
        <p className="text-destructive text-xs break-all">{job.error}</p>
      ) : null}

      {active ? (
        <p className="text-muted-foreground text-xs">
          正在后台打包，列表每 3 秒自动刷新…
        </p>
      ) : null}

      {job.status === "ready" ? <ArchiveChunkLinks archiveId={job.id} /> : null}
    </li>
  );
};

interface ArchivePanelProps {
  viewer: AdminViewer;
}

/** 冷数据归档：创建归档任务、追踪进度与下载分片。 */
export const ArchivePanel = ({ viewer }: ArchivePanelProps) => {
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = useQuery({
    ...api.archive.list.queryOptions({ input: { page: 1, pageSize: 20 } }),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];

      return items.some((item) => ACTIVE_STATUSES.has(item.status))
        ? 3000
        : false;
    },
    retry: false,
  });

  const jobs = listQuery.data?.items ?? [];

  const openCreate = () => {
    setCreateOpen(true);
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ArchiveIcon className="text-muted-foreground size-4" />
            冷数据归档
          </h2>
          <p className="text-muted-foreground max-w-3xl text-xs text-pretty">
            归档会把指定时间之前上传的素材打包成分片 zip
            推到存储目标，并从服务器删除源文件（可取消勾选保留）；归档后素材在网站里仍可检索到，但会标注「已归档」。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            disabled={listQuery.isFetching}
            onClick={() => {
              void listQuery.refetch();
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon
              className={listQuery.isFetching ? "animate-spin" : undefined}
            />
            刷新
          </Button>
          <Button onClick={openCreate} size="sm">
            <PlusIcon />
            新建归档
          </Button>
        </div>
      </div>

      {listQuery.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!listQuery.isPending && listQuery.isError && !listQuery.data ? (
        <EmptyState
          action={
            <Button
              onClick={() => {
                void listQuery.refetch();
              }}
              variant="outline"
            >
              重试
            </Button>
          }
          description="无法读取归档任务列表，请稍后重试。"
          icon={ArchiveIcon}
          title="归档列表加载失败"
        />
      ) : null}

      {listQuery.data && jobs.length === 0 ? (
        <EmptyState
          action={<Button onClick={openCreate}>新建归档</Button>}
          description="把两年前的旧素材打包归档，释放服务器磁盘空间；归档文件仍可下载。"
          icon={ArchiveIcon}
          title="还没有归档任务"
        />
      ) : null}

      {jobs.length > 0 ? (
        <section className="bg-card ring-foreground/10 overflow-hidden rounded-xl text-sm ring-1">
          <div className="border-b px-4 py-3">
            <p className="text-muted-foreground text-xs">
              最近 {jobs.length} 条归档任务
              {listQuery.isFetching ? " · 刷新中…" : ""}
            </p>
          </div>
          <ul className="divide-border divide-y">
            {jobs.map((job) => (
              <ArchiveRow job={job} key={job.id} />
            ))}
          </ul>
        </section>
      ) : null}

      {listQuery.isError && listQuery.data ? (
        <p className="text-warning text-xs">归档列表刷新失败，显示上次结果。</p>
      ) : null}

      {createOpen ? (
        <ArchiveCreateDialog
          onOpenChange={setCreateOpen}
          open={createOpen}
          viewer={viewer}
        />
      ) : null}
    </div>
  );
};
