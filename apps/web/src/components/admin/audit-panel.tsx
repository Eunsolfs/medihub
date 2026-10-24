import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Suspense, useState } from "react";

import { Button } from "@medihub/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import { Pill } from "#src/components/admin/badges.tsx";
import type { PillTone } from "#src/components/admin/badges.tsx";
import {
  ALL,
  AUDIT_ACTION_OPTIONS,
  PAGE_SIZE,
  auditActionLabel,
  auditEntityTypeLabel,
} from "#src/components/admin/constants.ts";
import type { AuditRow } from "#src/components/admin/types.ts";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const actionTone = (action: string): PillTone => {
  if (action.startsWith("user.")) {
    return "primary";
  }

  if (action.startsWith("org.")) {
    return "info";
  }

  if (action.startsWith("storage.")) {
    return "warning";
  }

  return action.startsWith("export.") ? "success" : "neutral";
};

const detailText = (detail: AuditRow["detail"]) =>
  detail ? JSON.stringify(detail, null, 2) : "无附加详情";

interface AuditListProps {
  action: string;
  page: number;
  onPageChange: (page: number) => void;
}

const AuditList = ({ action, page, onPageChange }: AuditListProps) => {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data } = useSuspenseQuery(
    api.audit.list.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        action: action === ALL ? undefined : action,
      },
    })
  );

  if (data.items.length === 0) {
    return (
      <EmptyState
        description={
          action === ALL
            ? "账号、科室与存储的敏感操作会自动记录在这里。"
            : "换一个操作类型筛选试试。"
        }
        icon={ScrollTextIcon}
        title={action === ALL ? "还没有审计记录" : "没有匹配的操作记录"}
      />
    );
  }

  return (
    <section className="bg-card text-card-foreground ring-foreground/10 overflow-hidden rounded-xl text-sm ring-1">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <p className="text-muted-foreground text-xs">
          共{" "}
          <span className="text-foreground font-medium tabular-nums">
            {data.total}
          </span>{" "}
          条操作记录 · 按时间倒序
        </p>
        <Button
          onClick={() => {
            void queryClient.invalidateQueries({
              queryKey: api.audit.key(),
            });
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCwIcon />
          刷新
        </Button>
      </div>

      <ul className="divide-border divide-y">
        {data.items.map((entry) => {
          const expanded = expandedId === entry.id;

          return (
            <li className="grid gap-2 px-4 py-3" key={entry.id}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <Pill tone={actionTone(entry.action)}>
                  {auditActionLabel(entry.action)}
                </Pill>
                <span className="text-muted-foreground font-mono text-xs">
                  {entry.action}
                </span>
                <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap tabular-nums">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>

              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>
                  实体：{auditEntityTypeLabel(entry.entityType)}
                  {entry.entityId ? (
                    <span
                      className="text-foreground ml-1 font-mono"
                      title={entry.entityId}
                    >
                      {entry.entityId.slice(0, 8)}
                    </span>
                  ) : null}
                </span>
                <span>操作人：{entry.actorName ?? "系统"}</span>
                <span>科室：{entry.organizationName ?? "全局"}</span>
              </div>

              <Button
                aria-expanded={expanded}
                className="w-fit"
                onClick={() => {
                  setExpandedId(expanded ? null : entry.id);
                }}
                size="xs"
                variant="ghost"
              >
                {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                {expanded ? "收起详情" : "展开详情"}
              </Button>

              {expanded ? (
                <pre className="bg-muted/50 overflow-x-auto rounded-lg p-3 text-xs break-all whitespace-pre-wrap">
                  {detailText(entry.detail)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="border-t px-4 py-2.5">
        <PaginationBar
          onPageChange={onPageChange}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      </div>
    </section>
  );
};

export const AuditPanel = () => {
  const [action, setAction] = useState<string>(ALL);
  const [page, setPage] = useState(1);

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <Select
          items={[
            { label: "全部操作", value: ALL },
            ...AUDIT_ACTION_OPTIONS.map((option) => ({
              label: option.label,
              value: option.value,
            })),
          ]}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setAction(value);
              setPage(1);
            }
          }}
          value={action}
        >
          <SelectTrigger aria-label="按操作类型筛选" className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部操作</SelectItem>
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {action === ALL ? null : (
          <Button
            onClick={() => {
              setAction(ALL);
              setPage(1);
            }}
            size="sm"
            variant="ghost"
          >
            <SlidersHorizontalIcon />
            清除筛选
          </Button>
        )}

        <p className="text-muted-foreground text-xs sm:ml-auto">
          审计记录由系统自动生成，不可编辑。
        </p>
      </div>

      <Suspense fallback={<LoadingRows rows={6} />}>
        <AuditList action={action} onPageChange={setPage} page={page} />
      </Suspense>
    </div>
  );
};
