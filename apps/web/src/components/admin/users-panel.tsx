import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  BanIcon,
  CircleCheckIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
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
import type { PillTone } from "#src/components/admin/badges.tsx";
import { CandidatesPanel } from "#src/components/admin/candidates-panel.tsx";
import {
  ALL,
  PAGE_SIZE,
  USER_ROLE_VALUES,
  USER_STATUS_VALUES,
  isUserRole,
  isUserStatus,
  userRoleLabel,
  userStatusLabel,
} from "#src/components/admin/constants.ts";
import type {
  AdminViewer,
  UserRole,
  UserRow,
  UserStatus,
} from "#src/components/admin/types.ts";
import { UserFormDialog } from "#src/components/admin/user-form-dialog.tsx";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { DataTableShell } from "#src/components/app-shell/ui/data-table-shell.tsx";
import type { DataTableColumn } from "#src/components/app-shell/ui/data-table-shell.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { SkeletonTable } from "#src/components/app-shell/ui/skeletons.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

type RoleFilter = UserRole | typeof ALL;

type StatusFilter = UserStatus | typeof ALL;

interface UsersFilters {
  keyword: string;
  role: RoleFilter;
  status: StatusFilter;
}

const DEFAULT_FILTERS: UsersFilters = {
  keyword: "",
  role: ALL,
  status: ALL,
};

const roleTone = (role: UserRole): PillTone => {
  if (role === "root") {
    return "primary";
  }

  return role === "dept_admin" ? "info" : "neutral";
};

const canManageUser = (user: UserRow, viewer: AdminViewer) =>
  viewer.role === "root" || user.role === "member";

const canDeleteUser = (user: UserRow, viewer: AdminViewer) =>
  user.id !== viewer.id && canManageUser(user, viewer);

const canToggleUser = (user: UserRow, viewer: AdminViewer) =>
  user.id !== viewer.id && canManageUser(user, viewer);

interface UserActionHandlers {
  onChangeStatus: (user: UserRow) => void;
  onDelete: (user: UserRow) => void;
  onEdit: (user: UserRow) => void;
}

const renderMember = (user: UserRow, viewer: AdminViewer) => (
  <div className="grid gap-0.5">
    <span className="font-medium">
      {user.name}
      {user.id === viewer.id ? (
        <span className="text-muted-foreground ml-1.5 text-xs">（我）</span>
      ) : null}
    </span>
    <span className="text-muted-foreground text-xs">{user.email}</span>
  </div>
);

const renderRole = (user: UserRow) => (
  <Pill tone={roleTone(user.role)}>{userRoleLabel(user.role)}</Pill>
);

const renderOrganization = (user: UserRow) => {
  const isGlobalAdmin = user.role === "root" && !user.organizationName;

  return (
    <div className="grid gap-0.5">
      {isGlobalAdmin ? (
        <Pill tone="primary">全局管理员</Pill>
      ) : (
        <span>{user.organizationName ?? "未归属科室"}</span>
      )}
      <span className="text-muted-foreground text-xs">
        {user.title ?? "未填写职称"}
      </span>
    </div>
  );
};

const renderStatus = (user: UserRow) => (
  <Pill tone={user.status === "active" ? "success" : "danger"}>
    {userStatusLabel(user.status)}
  </Pill>
);

const renderCreatedAt = (user: UserRow) => (
  <span className="text-muted-foreground whitespace-nowrap tabular-nums">
    {formatDateTime(user.createdAt)}
  </span>
);

const renderActions = (
  user: UserRow,
  viewer: AdminViewer,
  handlers: UserActionHandlers
) => {
  const canManage = canManageUser(user, viewer);
  const canToggle = canToggleUser(user, viewer);
  const canDelete = canDeleteUser(user, viewer);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        aria-label={`编辑 ${user.name}`}
        disabled={!canManage}
        onClick={() => {
          handlers.onEdit(user);
        }}
        size="icon-sm"
        title={canManage ? "编辑账号" : "无权编辑该账号"}
        variant="ghost"
      >
        <PencilIcon />
      </Button>
      <Button
        aria-label={
          user.status === "active" ? `禁用 ${user.name}` : `启用 ${user.name}`
        }
        disabled={!canToggle}
        onClick={() => {
          handlers.onChangeStatus(user);
        }}
        size="icon-sm"
        title={
          canToggle
            ? user.status === "active"
              ? "禁用账号"
              : "启用账号"
            : "只有超级管理员或本科室普通成员可操作"
        }
        variant="ghost"
      >
        {user.status === "active" ? <BanIcon /> : <CircleCheckIcon />}
      </Button>
      <Button
        aria-label={`删除 ${user.name}`}
        disabled={!canDelete}
        onClick={() => {
          handlers.onDelete(user);
        }}
        size="icon-sm"
        title={
          user.id === viewer.id
            ? "不能删除自己的账号"
            : canDelete
              ? "删除账号"
              : "科室管理员只能删除普通成员"
        }
        variant="ghost"
      >
        <Trash2Icon />
      </Button>
    </div>
  );
};

interface UsersTableProps {
  filters: UsersFilters;
  keywordDraft: string;
  page: number;
  viewer: AdminViewer;
  onCreate: () => void;
  onDelete: (user: UserRow) => void;
  onEdit: (user: UserRow) => void;
  onFiltersChange: (patch: Partial<UsersFilters>) => void;
  onKeywordDraftChange: (keyword: string) => void;
  onPageChange: (page: number) => void;
  onToggleStatus: (user: UserRow) => void;
}

const UsersTable = ({
  filters,
  keywordDraft,
  page,
  viewer,
  onCreate,
  onDelete,
  onEdit,
  onFiltersChange,
  onKeywordDraftChange,
  onPageChange,
  onToggleStatus,
}: UsersTableProps) => {
  const { data } = useSuspenseQuery(
    api.users.list.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        q: filters.keyword || undefined,
        role: filters.role === ALL ? undefined : filters.role,
        status: filters.status === ALL ? undefined : filters.status,
      },
    })
  );

  const handlers: UserActionHandlers = {
    onChangeStatus: onToggleStatus,
    onDelete,
    onEdit,
  };

  const columns: readonly DataTableColumn<UserRow>[] = [
    {
      cell: (user) => renderMember(user, viewer),
      header: "成员",
      key: "member",
    },
    {
      cell: (user) => renderRole(user),
      header: "角色",
      key: "role",
    },
    {
      cell: (user) => renderOrganization(user),
      header: "科室 / 职称",
      key: "organization",
    },
    {
      cell: (user) => renderStatus(user),
      header: "状态",
      key: "status",
    },
    {
      cell: (user) => renderCreatedAt(user),
      header: "创建时间",
      key: "createdAt",
      mobileHidden: true,
    },
    {
      align: "right",
      cell: (user) => renderActions(user, viewer, handlers),
      header: "操作",
      key: "actions",
    },
  ];

  const filtered =
    filters.keyword !== "" || filters.role !== ALL || filters.status !== ALL;

  return (
    <DataTableShell
      actions={
        <Button onClick={onCreate} size="sm">
          <PlusIcon />
          新建用户
        </Button>
      }
      columns={columns}
      emptyState={
        <EmptyState
          action={
            filtered ? undefined : (
              <Button onClick={onCreate} size="sm">
                <PlusIcon />
                新建用户
              </Button>
            )
          }
          description={
            filtered
              ? "调整搜索关键词、角色或状态筛选试试。"
              : "创建成员账号后，成员即可登录上传资料。"
          }
          icon={UsersIcon}
          title={filtered ? "没有匹配的成员" : "还没有成员账号"}
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
      rowKey={(user) => user.id}
      rows={data.items}
      toolbar={
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
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
              aria-label="搜索成员"
              maxLength={80}
              onChange={(event) => {
                onKeywordDraftChange(event.target.value);
              }}
              placeholder="搜索姓名或邮箱…"
              type="search"
              value={keywordDraft}
            />
            <Button size="sm" type="submit" variant="outline">
              搜索
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              items={[
                { label: "全部角色", value: ALL },
                ...USER_ROLE_VALUES.map((value) => ({
                  label: userRoleLabel(value),
                  value,
                })),
              ]}
              onValueChange={(value) => {
                if (typeof value !== "string") {
                  return;
                }

                if (value === ALL || isUserRole(value)) {
                  onFiltersChange({ role: value });
                }
              }}
              value={filters.role}
            >
              <SelectTrigger aria-label="按角色筛选" className="w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部角色</SelectItem>
                {USER_ROLE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {userRoleLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={[
                { label: "全部状态", value: ALL },
                ...USER_STATUS_VALUES.map((value) => ({
                  label: userStatusLabel(value),
                  value,
                })),
              ]}
              onValueChange={(value) => {
                if (typeof value !== "string") {
                  return;
                }

                if (value === ALL || isUserStatus(value)) {
                  onFiltersChange({ status: value });
                }
              }}
              value={filters.status}
            >
              <SelectTrigger aria-label="按状态筛选" className="w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部状态</SelectItem>
                {USER_STATUS_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {userStatusLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      }
    />
  );
};

interface UsersPanelProps {
  viewer: AdminViewer;
}

export const UsersPanel = ({ viewer }: UsersPanelProps) => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<UsersFilters>(DEFAULT_FILTERS);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: api.users.key() });
    await queryClient.invalidateQueries({ queryKey: api.orgs.key() });
  };

  const removeMutation = useMutation(
    api.users.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("账号已删除");
        setPendingDelete(null);
        await invalidate();
      },
    })
  );

  const statusMutation = useMutation(
    api.users.update.mutationOptions({
      onSuccess: async () => {
        toast.success("账号状态已更新");
        await invalidate();
      },
    })
  );

  const updateFilters = (patch: Partial<UsersFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="grid gap-3">
      <CandidatesPanel />

      {viewer.role === "dept_admin" ? (
        <p className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-xs">
          科室管理员只能查看并管理本科室的普通成员账号；新建与编辑时角色固定为「科室成员」。
        </p>
      ) : null}

      <Suspense fallback={<SkeletonTable columns={6} rows={5} />}>
        <UsersTable
          filters={filters}
          keywordDraft={keywordDraft}
          onCreate={openCreate}
          onDelete={setPendingDelete}
          onEdit={(user) => {
            setEditing(user);
            setFormOpen(true);
          }}
          onFiltersChange={updateFilters}
          onKeywordDraftChange={setKeywordDraft}
          onPageChange={setPage}
          onToggleStatus={(user) => {
            statusMutation.mutate({
              id: user.id,
              status: user.status === "active" ? "disabled" : "active",
            });
          }}
          page={page}
          viewer={viewer}
        />
      </Suspense>

      {formOpen ? (
        <UserFormDialog
          key={editing?.id ?? "create"}
          onOpenChange={setFormOpen}
          open={formOpen}
          user={editing}
          viewer={viewer}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除"
        description={
          pendingDelete
            ? `将删除「${pendingDelete.name}」（${pendingDelete.email}），该账号将立即无法登录，已上传的资料会保留。`
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
        title="删除账号？"
        tone="destructive"
      />
    </div>
  );
};
