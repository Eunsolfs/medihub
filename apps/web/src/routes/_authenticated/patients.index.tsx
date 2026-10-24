import { useQueries, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ChevronRightIcon, InfoIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import {
  getSessionRole,
  isOrglessRole,
} from "#src/components/app-shell/roles.ts";
import { DataTableShell } from "#src/components/app-shell/ui/data-table-shell.tsx";
import type { DataTableColumn } from "#src/components/app-shell/ui/data-table-shell.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { SkeletonTable } from "#src/components/app-shell/ui/skeletons.tsx";
import { describePatient, pageSize } from "#src/components/patients/display.ts";
import { PatientsOrgRequired } from "#src/components/patients/org-required.tsx";
import { PatientFormDialog } from "#src/components/patients/patient-form-dialog.tsx";
import { PatientStatusBadge } from "#src/components/patients/patient-status-badge.tsx";
import { PatientsErrorState } from "#src/components/patients/patients-error-state.tsx";
import type {
  PatientListItem,
  PatientStatus,
} from "#src/components/patients/types.ts";
import { useViewer } from "#src/components/patients/use-viewer.ts";
import { api } from "#src/lib/api.ts";
import {
  formatDateTime,
  formatRelative,
  patientStatusLabels,
} from "#src/lib/format.ts";

interface PatientSearch {
  page: number;
  q: string;
  sort: "recent" | "name";
  status: PatientStatus | "all";
  tag: string;
}

/** TanStack Router 传入的是 URL 上的原始值，逐字段解析成强类型。 */
interface PatientSearchInput {
  page?: unknown;
  q?: unknown;
  sort?: unknown;
  status?: unknown;
  tag?: unknown;
}

const SORT_VALUES = ["recent", "name"] as const;
const STATUS_VALUES = ["all", "active", "follow_up", "archived"] as const;

const statusFilters: readonly {
  label: string;
  value: PatientStatus | "all";
}[] = [
  { label: "全部", value: "all" },
  { label: patientStatusLabels.active, value: "active" },
  { label: patientStatusLabels.follow_up, value: "follow_up" },
  { label: patientStatusLabels.archived, value: "archived" },
];

const sortOptions = [
  { label: "最近建档", value: "recent" },
  { label: "按姓名排序", value: "name" },
] as const;

/** URL 上的搜索参数只会是 JSON 里的原始值；其它形态一律忽略。 */
const isPrimitive = (value: unknown): value is string | number => {
  if (value === null || value === undefined) {
    return false;
  }

  return !(value instanceof Object);
};

const asText = (value: unknown) => (isPrimitive(value) ? `${value}` : "");

const validateSearch = (search: PatientSearchInput): PatientSearch => {
  const page = Number(asText(search.page));

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    q: asText(search.q).slice(0, 80),
    sort:
      SORT_VALUES.find((value) => value === asText(search.sort)) ?? "recent",
    status:
      STATUS_VALUES.find((value) => value === asText(search.status)) ?? "all",
    tag: asText(search.tag).slice(0, 20),
  };
};

const patientListOptions = (filters: PatientSearch) =>
  api.patients.list.queryOptions({
    input: {
      page: filters.page,
      pageSize,
      q: filters.q || undefined,
      sort: filters.sort,
      status: filters.status === "all" ? undefined : filters.status,
      tag: filters.tag || undefined,
    },
  });

const buildPatientColumns = (options: {
  onEdit: (patientId: string) => void;
}): readonly DataTableColumn<PatientListItem>[] => [
  {
    cell: (row) => (
      <Link
        className="group flex w-full min-w-0 items-center justify-between gap-2"
        params={{ patientId: row.id }}
        to="/patients/$patientId"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="font-medium group-hover:underline">{row.name}</span>
          <span className="text-muted-foreground text-xs">
            {describePatient(row.gender, row.birthDate)}
          </span>
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
    ),
    header: "患者",
    key: "name",
  },
  {
    cell: (row) => (
      <span className="font-mono text-xs">{row.medicalRecordNo ?? "—"}</span>
    ),
    header: "病案号",
    key: "medicalRecordNo",
  },
  {
    cell: (row) => (
      <span className="line-clamp-2 max-w-[22rem] text-sm">
        {row.summary ?? "—"}
      </span>
    ),
    header: "诊断摘要",
    key: "summary",
  },
  {
    align: "right",
    cell: (row) => <span className="tabular-nums">{row.admissionCount}</span>,
    header: "就诊次数",
    key: "admissionCount",
  },
  {
    cell: (row) => <PatientStatusBadge status={row.status} />,
    header: "状态",
    key: "status",
  },
  {
    cell: (row) => (
      <span
        className="text-muted-foreground text-xs"
        title={formatDateTime(row.updatedAt)}
      >
        {formatRelative(row.updatedAt)}
      </span>
    ),
    header: "更新时间",
    key: "updatedAt",
  },
  {
    align: "right",
    cell: (row) => (
      <Button
        onClick={() => {
          options.onEdit(row.id);
        }}
        size="sm"
        variant="ghost"
      >
        <PencilIcon />
        编辑
      </Button>
    ),
    header: "操作",
    key: "actions",
    mobileHidden: true,
  },
];

interface PatientToolbarProps {
  search: PatientSearch;
  onChange: (patch: Partial<PatientSearch>) => void;
}

/** 关键词输入：本地立即可见，300ms 后才写回 URL 触发查询。 */
const SearchBox = ({ search, onChange }: PatientToolbarProps) => {
  const [keyword, setKeyword] = useState(search.q);
  const committedRef = useRef(search.q);

  useEffect(() => {
    if (search.q !== committedRef.current) {
      committedRef.current = search.q;
      setKeyword(search.q);
    }
  }, [search.q]);

  useEffect(() => {
    const pending = keyword !== committedRef.current;

    const timer = pending
      ? window.setTimeout(() => {
          committedRef.current = keyword;
          onChange({ page: 1, q: keyword });
        }, 300)
      : 0;

    return () => {
      if (timer > 0) {
        window.clearTimeout(timer);
      }
    };
  }, [keyword, onChange]);

  return (
    <Input
      aria-label="搜索患者"
      className="w-full sm:max-w-xs"
      maxLength={80}
      onChange={(event) => {
        setKeyword(event.target.value);
      }}
      placeholder="搜索姓名 / 病案号 / 电话"
      type="search"
      value={keyword}
    />
  );
};

const PatientTable = ({
  search,
  onChange,
  onEdit,
  onCreate,
  isAdmin,
}: PatientToolbarProps & {
  onEdit: (patientId: string) => void;
  onCreate: () => void;
  /** 成员只能看到自己建档的患者，空态文案与管理员不同。 */
  isAdmin: boolean;
}) => {
  const { data } = useSuspenseQuery(patientListOptions(search));
  const columns = buildPatientColumns({ onEdit });

  const filtered =
    search.q !== "" || search.status !== "all" || search.tag !== "";

  // 标签筛选的候选取自当前这一页的患者标签（后端按 tag 精确匹配）。
  const tagOptions = [
    { label: "全部标签", value: "" },
    ...[...new Set(data.items.flatMap((patient) => patient.tags))]
      .toSorted((left, right) => left.localeCompare(right, "zh-CN"))
      .map((tag) => ({ label: tag, value: tag })),
  ];

  const emptyState = (() => {
    if (!isAdmin) {
      return {
        description: filtered
          ? "当前筛选下没有你建档的患者，换个条件或新建一份档案。"
          : "你只能看到自己建档的患者；新建档案后即可在此管理，科室管理员可查看全科室。",
        title: "你还没有建档的患者",
      };
    }

    return {
      description: filtered
        ? "调整搜索关键词、状态或标签筛选试试。"
        : "还没有患者档案，先建立第一份档案。",
      title: filtered ? "没有符合条件的患者" : "还没有患者档案",
    };
  })();

  return (
    <DataTableShell
      actions={
        <div className="flex items-center gap-2">
          <Select
            items={sortOptions}
            onValueChange={(value) => {
              if (value) {
                onChange({ page: 1, sort: value });
              }
            }}
            value={search.sort}
          >
            <SelectTrigger aria-label="排序" className="w-32" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      columns={columns}
      emptyState={
        <EmptyState
          action={
            <Button onClick={onCreate} size="sm">
              <PlusIcon />
              新建患者
            </Button>
          }
          description={emptyState.description}
          title={emptyState.title}
        />
      }
      footer={
        <PaginationBar
          onPageChange={(page) => {
            onChange({ page });
          }}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
        />
      }
      rowKey={(row) => row.id}
      rows={data.items}
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <SearchBox onChange={onChange} search={search} />
          <fieldset className="bg-muted inline-flex w-fit min-w-0 flex-wrap items-center rounded-lg p-0.5">
            <legend className="sr-only">按状态筛选</legend>
            {statusFilters.map((filter) => {
              const active = search.status === filter.value;

              return (
                <Button
                  aria-pressed={active}
                  key={filter.value}
                  onClick={() => {
                    onChange({ page: 1, status: filter.value });
                  }}
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                >
                  {filter.label}
                </Button>
              );
            })}
          </fieldset>
          <Select
            items={tagOptions}
            onValueChange={(value) => {
              if (value !== null) {
                onChange({ page: 1, tag: value });
              }
            }}
            value={search.tag}
          >
            <SelectTrigger aria-label="按标签筛选" className="w-28" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tagOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
};

const PatientStats = () => {
  const [total, active, followUp] = useQueries({
    queries: [
      api.patients.list.queryOptions({
        input: { page: 1, pageSize: 1 },
      }),
      api.patients.list.queryOptions({
        input: { page: 1, pageSize: 1, status: "active" },
      }),
      api.patients.list.queryOptions({
        input: { page: 1, pageSize: 1, status: "follow_up" },
      }),
    ],
  });

  const stats = [
    { label: "患者总数", value: total?.data?.total },
    { label: "在诊", value: active?.data?.total },
    { label: "随访中", value: followUp?.data?.total },
  ];

  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {stats.map((stat) => (
        <span className="inline-flex items-baseline gap-1" key={stat.label}>
          {stat.label}
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {stat.value ?? "—"}
          </span>
        </span>
      ))}
    </div>
  );
};

const PatientsPageContent = () => {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateSearch = (patch: Partial<PatientSearch>) => {
    void navigate({ search: { ...search, ...patch } });
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            <PlusIcon />
            新建患者
          </Button>
        }
        description="科室内所有患者的档案、历次入院记录与影像素材，按日期浏览、补写分期与部位。"
        meta={<PatientStats />}
        title="患者档案"
      />

      {viewer.isAdmin ? null : (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          仅显示我建档的患者；科室管理员可查看全科室。
        </p>
      )}

      <Suspense fallback={<SkeletonTable />}>
        <PatientTable
          isAdmin={viewer.isAdmin}
          onChange={updateSearch}
          onCreate={() => {
            setCreateOpen(true);
          }}
          onEdit={(patientId) => {
            setEditingId(patientId);
          }}
          search={search}
        />
      </Suspense>

      <PatientFormDialog
        onOpenChange={setCreateOpen}
        onSaved={(patientId) => {
          void navigate({
            params: { patientId },
            to: "/patients/$patientId",
          });
        }}
        open={createOpen}
      />

      <PatientFormDialog
        onOpenChange={(open) => {
          if (!open) {
            setEditingId(null);
          }
        }}
        open={editingId !== null}
        patientId={editingId}
      />
    </div>
  );
};

/** 没有归属科室的账号连页面都不进：直接渲染拦截页，loader 也已跳过请求。 */
const PatientsPage = () => {
  const viewer = useViewer();

  if (isOrglessRole(viewer.role)) {
    return <PatientsOrgRequired />;
  }

  return <PatientsPageContent />;
};

const PatientsRouteError = ({ error }: ErrorComponentProps) => {
  const router = useRouter();

  return (
    <PatientsErrorState
      message={
        error instanceof Error
          ? error.message
          : "患者档案加载失败，请稍后重试。"
      }
      onRetry={() => {
        void router.invalidate();
      }}
      title="患者档案加载失败"
    />
  );
};

export const Route = createFileRoute("/_authenticated/patients/")({
  component: PatientsPage,
  errorComponent: PatientsRouteError,
  loaderDeps: ({ search }) => ({
    page: search.page,
    q: search.q,
    sort: search.sort,
    status: search.status,
    tag: search.tag,
  }),
  loader: async ({ context, deps }) => {
    // 没有归属科室的账号：不发任何患者档案请求，组件直接渲染拦截页。
    if (isOrglessRole(getSessionRole(context.session))) {
      return;
    }

    await context.queryClient.query(patientListOptions(deps));
  },
  validateSearch,
});
