import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Building2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { Suspense, useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import { Pill } from "#src/components/admin/badges.tsx";
import {
  ALL,
  ORG_KIND_VALUES,
  PAGE_SIZE,
  isOrgKind,
  orgKindLabel,
} from "#src/components/admin/constants.ts";
import { OrgFormDialog } from "#src/components/admin/org-form-dialog.tsx";
import type { OrgKind, OrgRow } from "#src/components/admin/types.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { DataTableShell } from "#src/components/app-shell/ui/data-table-shell.tsx";
import type { DataTableColumn } from "#src/components/app-shell/ui/data-table-shell.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { SkeletonTable } from "#src/components/app-shell/ui/skeletons.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

type KindFilter = OrgKind | typeof ALL;

interface OrgsFilters {
  keyword: string;
  kind: KindFilter;
}

const DEFAULT_FILTERS: OrgsFilters = { keyword: "", kind: ALL };

interface OrgActionHandlers {
  onDelete: (org: OrgRow) => void;
  onEdit: (org: OrgRow) => void;
}

const renderName = (org: OrgRow) => (
  <div className="grid gap-0.5">
    <span className="font-medium">{org.name}</span>
    <span className="text-muted-foreground font-mono text-xs">{org.code}</span>
  </div>
);

const renderKind = (org: OrgRow) => (
  <Pill tone={org.kind === "department" ? "info" : "neutral"}>
    {orgKindLabel(org.kind)}
  </Pill>
);

const renderMembers = (org: OrgRow) => (
  <span className="tabular-nums">{org.memberCount}</span>
);

const renderPatients = (org: OrgRow) => (
  <span className="tabular-nums">{org.patientCount}</span>
);

const renderCreatedAt = (org: OrgRow) => (
  <span className="text-muted-foreground whitespace-nowrap tabular-nums">
    {formatDateTime(org.createdAt)}
  </span>
);

const renderActions = (org: OrgRow, handlers: OrgActionHandlers) => (
  <div className="flex items-center justify-end gap-1">
    <Button
      aria-label={`编辑 ${org.name}`}
      onClick={() => {
        handlers.onEdit(org);
      }}
      size="icon-sm"
      title="编辑科室"
      variant="ghost"
    >
      <PencilIcon />
    </Button>
    <Button
      aria-label={`删除 ${org.name}`}
      onClick={() => {
        handlers.onDelete(org);
      }}
      size="icon-sm"
      title="删除科室"
      variant="ghost"
    >
      <Trash2Icon />
    </Button>
  </div>
);

interface OrgsTableProps {
  filters: OrgsFilters;
  keywordDraft: string;
  page: number;
  onCreate: () => void;
  onDelete: (org: OrgRow) => void;
  onEdit: (org: OrgRow) => void;
  onFiltersChange: (patch: Partial<OrgsFilters>) => void;
  onKeywordDraftChange: (keyword: string) => void;
  onPageChange: (page: number) => void;
}

const OrgsTable = ({
  filters,
  keywordDraft,
  page,
  onCreate,
  onDelete,
  onEdit,
  onFiltersChange,
  onKeywordDraftChange,
  onPageChange,
}: OrgsTableProps) => {
  const { data } = useSuspenseQuery(
    api.orgs.list.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        q: filters.keyword || undefined,
        kind: filters.kind === ALL ? undefined : filters.kind,
      },
    })
  );

  const handlers: OrgActionHandlers = { onDelete, onEdit };

  const columns: readonly DataTableColumn<OrgRow>[] = [
    {
      cell: (org) => renderName(org),
      header: "科室",
      key: "name",
    },
    {
      cell: (org) => renderKind(org),
      header: "类型",
      key: "kind",
    },
    {
      align: "right",
      cell: (org) => renderMembers(org),
      header: "成员数",
      key: "memberCount",
    },
    {
      align: "right",
      cell: (org) => renderPatients(org),
      header: "患者数",
      key: "patientCount",
    },
    {
      cell: (org) => renderCreatedAt(org),
      header: "创建时间",
      key: "createdAt",
      mobileHidden: true,
    },
    {
      align: "right",
      cell: (org) => renderActions(org, handlers),
      header: "操作",
      key: "actions",
    },
  ];

  const filtered = filters.keyword !== "" || filters.kind !== ALL;

  return (
    <DataTableShell
      actions={
        <Button onClick={onCreate} size="sm">
          <PlusIcon />
          新建科室
        </Button>
      }
      columns={columns}
      emptyState={
        <EmptyState
          action={
            filtered ? undefined : (
              <Button onClick={onCreate} size="sm">
                <PlusIcon />
                新建科室
              </Button>
            )
          }
          description={
            filtered
              ? "调整搜索关键词或类型筛选试试。"
              : "创建科室后即可邀请成员加入。"
          }
          icon={Building2Icon}
          title={filtered ? "没有匹配的科室" : "还没有科室"}
        />
      }
      footer={
        <PaginationBar
          onPageChange={onPageChange}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      }
      rowKey={(org) => org.id}
      rows={data.items}
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
              event.preventDefault();
              onFiltersChange({ keyword: keywordDraft.trim() });
            }}
          >
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground size-4 shrink-0"
            />
            <Input
              aria-label="搜索科室"
              maxLength={80}
              onChange={(event) => {
                onKeywordDraftChange(event.target.value);
              }}
              placeholder="搜索科室名称或短码…"
              type="search"
              value={keywordDraft}
            />
            <Button size="sm" type="submit" variant="outline">
              搜索
            </Button>
          </form>

          <Select
            items={[
              { label: "全部类型", value: ALL },
              ...ORG_KIND_VALUES.map((value) => ({
                label: orgKindLabel(value),
                value,
              })),
            ]}
            onValueChange={(value) => {
              if (typeof value !== "string") {
                return;
              }

              if (value === ALL || isOrgKind(value)) {
                onFiltersChange({ kind: value });
              }
            }}
            value={filters.kind}
          >
            <SelectTrigger aria-label="按类型筛选" className="w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部类型</SelectItem>
              {ORG_KIND_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {orgKindLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
};

const deleteDescription = (org: OrgRow | null): string | null => {
  if (!org) {
    return null;
  }

  if (org.memberCount > 0 || org.patientCount > 0) {
    return `「${org.name}」还有 ${org.memberCount} 名成员、${org.patientCount} 位患者，删除会被拒绝；请先清空后再试。`;
  }

  return `将删除「${org.name}」（${org.code}），删除后不可恢复。`;
};

export const OrgsPanel = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<OrgsFilters>(DEFAULT_FILTERS);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrgRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OrgRow | null>(null);

  const removeMutation = useMutation(
    api.orgs.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("科室已删除");
        setPendingDelete(null);
        await queryClient.invalidateQueries({ queryKey: api.orgs.key() });
        await queryClient.invalidateQueries({ queryKey: api.users.key() });
      },
    })
  );

  const updateFilters = (patch: Partial<OrgsFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  return (
    <div className="grid gap-3">
      <p className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-xs">
        删除科室前必须先清空其成员与患者档案；否则删除会被后端拒绝并提示原因。
      </p>

      <Suspense fallback={<SkeletonTable columns={6} rows={5} />}>
        <OrgsTable
          filters={filters}
          keywordDraft={keywordDraft}
          onCreate={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          onDelete={setPendingDelete}
          onEdit={(org) => {
            setEditing(org);
            setFormOpen(true);
          }}
          onFiltersChange={updateFilters}
          onKeywordDraftChange={setKeywordDraft}
          onPageChange={setPage}
          page={page}
        />
      </Suspense>

      {formOpen ? (
        <OrgFormDialog
          key={editing?.id ?? "create"}
          onOpenChange={setFormOpen}
          open={formOpen}
          org={editing}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除"
        description={deleteDescription(pendingDelete)}
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
        title="删除科室？"
        tone="destructive"
      />
    </div>
  );
};
