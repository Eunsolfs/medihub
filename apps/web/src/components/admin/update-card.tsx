import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpCircleIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { Pill } from "#src/components/admin/badges.tsx";
import type { UpdateStatus } from "#src/components/admin/types.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const parseVersion = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .replace(/^v/iu, "")
    .split(/[-+]/u)[0]
    ?.split(".")
    .map((part) => Math.trunc(Number(part)));

  if (!parts || parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return parts;
};

/** 只比较主版本号数值段；`v1.2.0` 与 `1.2.0` 视为同一版本。 */
const isNewerVersion = (latest: string | null, current: string) => {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);

  if (!latestParts || !currentParts) {
    return false;
  }

  for (let index = 0; index < latestParts.length; index += 1) {
    const latestPart = latestParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;

    if (latestPart !== currentPart) {
      return latestPart > currentPart;
    }
  }

  return false;
};

const phaseLabel = (status: UpdateStatus) => {
  const { phase } = status.state;

  if (phase === "succeeded") {
    return `已升级到 v${status.state.targetVersion ?? status.latest.latestVersion ?? status.currentVersion}`;
  }

  if (phase === "rolled_back") {
    return "已回滚";
  }

  return null;
};

const latestLabel = (latestVersion: string | null) =>
  latestVersion ? `v${latestVersion}` : "暂未获取";

interface UpdateActionProps {
  status: UpdateStatus;
  updateAvailable: boolean;
  onStartUpdate: () => void;
  onRollback: () => void;
  startPending: boolean;
  rollbackPending: boolean;
}

const UpdateActions = ({
  status,
  updateAvailable,
  onStartUpdate,
  onRollback,
  startPending,
  rollbackPending,
}: UpdateActionProps) => {
  const running = status.state.phase === "running";

  if (!status.enabled) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {running ? (
        <Button className="min-h-11 w-full sm:min-h-8 sm:w-auto" disabled>
          <RefreshCwIcon className="animate-spin" />
          {status.state.mode === "rollback" ? "正在回滚…" : "正在升级…"}
        </Button>
      ) : updateAvailable && status.latest.latestVersion ? (
        <Button
          className="min-h-11 w-full sm:min-h-8 sm:w-auto"
          disabled={startPending}
          onClick={onStartUpdate}
        >
          <ArrowUpCircleIcon />
          升级到 v{status.latest.latestVersion}
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">当前已是最新版本。</p>
      )}

      {status.canRollback && !running ? (
        <Button
          className="min-h-11 w-full sm:min-h-8 sm:w-auto"
          disabled={rollbackPending}
          onClick={onRollback}
          variant="outline"
        >
          <RotateCcwIcon />
          回滚到上一版本
        </Button>
      ) : null}
    </div>
  );
};

const UpdateStateNotices = ({ status }: { status: UpdateStatus }) => {
  const { state } = status;

  if (state.phase === "running") {
    const lines = (state.log ?? []).slice(-8);

    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="info">执行中</Pill>
          <span className="text-muted-foreground text-xs">
            {state.mode === "rollback" ? "正在回滚" : "正在升级"}
            {state.targetVersion ? `到 v${state.targetVersion}` : ""}
          </span>
        </div>
        {lines.length > 0 ? (
          <div className="grid gap-1">
            <span className="text-muted-foreground text-xs">
              升级日志（最后 8 行）
            </span>
            <pre className="bg-muted/50 max-h-40 overflow-auto rounded-lg p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
              {lines.join("\n")}
            </pre>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">任务已启动，等待日志…</p>
        )}
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className="bg-destructive/10 text-destructive grid gap-1 rounded-lg px-3 py-2 text-xs">
        <p className="font-medium">升级失败</p>
        {state.error ? <p className="break-all">{state.error}</p> : null}
        {state.rolledBack ? (
          <p className="text-warning">已自动回滚到上个版本</p>
        ) : null}
      </div>
    );
  }

  const label = phaseLabel(status);

  if (!label) {
    return null;
  }

  const finishedAt = "finishedAt" in state ? state.finishedAt : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={state.phase === "succeeded" ? "success" : "info"}>
        {label}
      </Pill>
      {finishedAt ? (
        <span className="text-muted-foreground text-xs">
          {formatDateTime(finishedAt)}
        </span>
      ) : null}
    </div>
  );
};

const DisabledNotice = () => (
  <div className="bg-muted/50 grid gap-1.5 rounded-lg p-3 text-xs">
    <p className="font-medium">服务端未启用在线升级</p>
    <p className="text-muted-foreground text-pretty">
      需要在 <code className="font-mono">apps/server/.env</code>{" "}
      配置以下变量并重启服务：
    </p>
    <ul className="grid gap-1 font-mono text-[11px]">
      <li>UPDATE_ENABLED=true</li>
      <li>UPDATE_RESTART_CMD</li>
      <li>UPDATE_WORKDIR</li>
    </ul>
  </div>
);

/**
 * 版本与升级：root 在站点内触发在线升级或回滚。
 * 非 root 由 admin 页面决定不渲染本卡片。
 */
export const UpdateCard = () => {
  const queryClient = useQueryClient();
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const statusQuery = useQuery({
    ...api.system.updateStatus.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.state.phase === "running" ? 3000 : false,
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: api.system.key() });
  };

  const startMutation = useMutation(
    api.system.startUpdate.mutationOptions({
      onSuccess: async () => {
        toast.success("升级任务已启动");
        setConfirmUpgrade(false);
        await refresh();
      },
    })
  );

  const rollbackMutation = useMutation(
    api.system.rollbackUpdate.mutationOptions({
      onSuccess: async () => {
        toast.success("回滚任务已启动");
        setConfirmRollback(false);
        await refresh();
      },
    })
  );

  const status = statusQuery.data;
  const latestVersion = status?.latest.latestVersion ?? null;

  const updateAvailable = status
    ? status.enabled && isNewerVersion(latestVersion, status.currentVersion)
    : false;

  return (
    <section className="bg-card ring-foreground/10 grid gap-4 rounded-xl p-4 text-sm ring-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h2 className="flex items-center gap-2 font-medium">
            <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg">
              <ArrowUpCircleIcon className="size-4" />
            </span>
            版本与升级
          </h2>
          <p className="text-muted-foreground text-xs text-pretty">
            检查最新 Release，并在站点内完成升级或回滚。
          </p>
        </div>
        {statusQuery.isError ? (
          <p className="text-warning text-xs">状态查询失败</p>
        ) : null}
      </div>

      {statusQuery.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!statusQuery.isPending && !status ? (
        <p className="text-destructive rounded-lg border border-dashed p-3 text-xs">
          状态查询失败，请稍后重试。
        </p>
      ) : null}

      {status ? (
        <>
          <dl className="grid gap-2 text-xs">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <dt className="text-muted-foreground">当前版本</dt>
              <dd className="font-mono sm:text-right">
                {status.currentVersion === "unknown"
                  ? "未知"
                  : `v${status.currentVersion}`}
              </dd>
            </div>
            {status.enabled ? (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <dt className="text-muted-foreground">最新 Release</dt>
                <dd className="grid gap-0.5 sm:justify-items-end sm:text-right">
                  <span className="font-mono">
                    {latestLabel(latestVersion)}
                  </span>
                  {status.latest.publishedAt ? (
                    <span className="text-muted-foreground">
                      {formatDateTime(status.latest.publishedAt)}
                    </span>
                  ) : null}
                  {status.latest.url ? (
                    <a
                      className="text-primary inline-flex items-center gap-1 hover:underline"
                      href={status.latest.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      查看发布说明
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  ) : null}
                  {status.latest.error ? (
                    <span className="text-warning">{status.latest.error}</span>
                  ) : null}
                </dd>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <dt className="text-muted-foreground">最新 Release</dt>
                <dd className="text-muted-foreground sm:text-right">
                  未获取（{status.latest.error ?? "未启用在线升级"}）
                </dd>
              </div>
            )}
          </dl>

          {status.enabled ? (
            <>
              <UpdateStateNotices status={status} />
              <UpdateActions
                onRollback={() => {
                  setConfirmRollback(true);
                }}
                onStartUpdate={() => {
                  setConfirmUpgrade(true);
                }}
                rollbackPending={rollbackMutation.isPending}
                startPending={startMutation.isPending}
                status={status}
                updateAvailable={updateAvailable}
              />
            </>
          ) : (
            <DisabledNotice />
          )}

          {statusQuery.isError && statusQuery.data ? (
            <p className="text-warning text-xs">状态查询失败，显示上次结果。</p>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        confirmLabel="开始升级"
        description="升级会短暂重启服务，期间无法访问。确定继续吗？"
        isPending={startMutation.isPending}
        onConfirm={() => {
          if (latestVersion) {
            startMutation.mutate({ targetVersion: latestVersion });
          }
        }}
        onOpenChange={setConfirmUpgrade}
        open={confirmUpgrade}
        title={latestVersion ? `升级到 v${latestVersion}？` : "确认开始升级？"}
      />

      <ConfirmDialog
        confirmLabel="确认回滚"
        description="会还原代码与数据库到上一版本，期间服务会短暂重启。确定回滚吗？"
        isPending={rollbackMutation.isPending}
        onConfirm={() => {
          rollbackMutation.mutate({});
        }}
        onOpenChange={setConfirmRollback}
        open={confirmRollback}
        title="回滚到上一版本？"
        tone="destructive"
      />
    </section>
  );
};
