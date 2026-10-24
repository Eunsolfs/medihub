import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@medihub/ui/components/dropdown-menu";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import { SessionFormDialog } from "#src/components/sessions/session-form-dialog.tsx";
import type { SessionRecord } from "#src/components/sessions/session-form-dialog.tsx";
import {
  isLearningKind,
  LEARNING_KIND_OPTIONS,
  learningKindLabel,
  learningKindTone,
  toDateTimeInput,
} from "#src/components/sessions/session-kind.ts";
import type { LearningKind } from "#src/components/sessions/session-kind.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const PAGE_SIZE = 12;
const ALL_KINDS = "all";

type KindFilter = LearningKind | typeof ALL_KINDS;

const SessionsPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const [kind, setKind] = useState<KindFilter>(ALL_KINDS);
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRecord | null>(null);
  const [defaultHeldAt, setDefaultHeldAt] = useState("");

  const [pendingDelete, setPendingDelete] = useState<SessionRecord | null>(
    null
  );

  const listQuery = useQuery(
    api.learning.list.queryOptions({
      input: {
        kind: kind === ALL_KINDS ? undefined : kind,
        page,
        pageSize: PAGE_SIZE,
        q: keyword || undefined,
      },
    })
  );

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  const removeMutation = useMutation(
    api.learning.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("学习会议已删除");
        setPendingDelete(null);
        await queryClient.invalidateQueries({
          queryKey: api.learning.list.key({ type: "query" }),
        });
      },
    })
  );

  const submitSearch = () => {
    setPage(1);
    setKeyword(q.trim());
  };

  const openCreate = () => {
    setEditing(null);
    setDefaultHeldAt(toDateTimeInput(new Date()));
    setFormOpen(true);
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          <Button onClick={openCreate}>
            <PlusIcon />
            新建会议
          </Button>
        }
        description="科室讲课、学习会议、培训与病例讨论的资料归档，会后统一上传课件与影像。"
        meta={<span>共 {total} 场</span>}
        title="学习会议"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <Input
            aria-label="搜索学习会议"
            className="min-w-0 flex-1"
            onChange={(event) => {
              setQ(event.target.value);
            }}
            placeholder="搜索标题、简介或讲者…"
            type="search"
            value={q}
          />
          <Button type="submit" variant="outline">
            搜索
          </Button>
        </form>
        <Select
          items={[
            { label: "全部类型", value: ALL_KINDS },
            ...LEARNING_KIND_OPTIONS.map((option) => ({
              label: option.label,
              value: option.value,
            })),
          ]}
          onValueChange={(value) => {
            if (typeof value !== "string") {
              return;
            }

            setPage(1);

            if (value === ALL_KINDS) {
              setKind(ALL_KINDS);
            } else if (isLearningKind(value)) {
              setKind(value);
            }
          }}
          value={kind}
        >
          <SelectTrigger aria-label="按类型筛选" className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_KINDS}>全部类型</SelectItem>
            {LEARNING_KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.isPending ? <LoadingRows rows={4} /> : null}

      {!listQuery.isPending && items.length === 0 ? (
        <EmptyState
          action={<Button onClick={openCreate}>新建会议</Button>}
          description="创建一场学习会议后，就能把课件、照片和录音归档到一起。"
          icon={CalendarDaysIcon}
          title={
            keyword || kind !== ALL_KINDS ? "没有匹配的会议" : "还没有学习会议"
          }
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li
              className="bg-card ring-foreground/10 hover:ring-foreground/20 grid gap-3 rounded-xl p-4 ring-1 transition-colors"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-flex h-5 w-fit items-center rounded-4xl px-2 text-xs font-medium ${learningKindTone(item.kind)}`}
                >
                  {learningKindLabel(item.kind)}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        aria-label={`${item.title} 的操作`}
                        size="icon-sm"
                        variant="ghost"
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                    >
                      <PencilIcon />
                      编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setPendingDelete(item);
                      }}
                      variant="destructive"
                    >
                      <Trash2Icon />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Link
                className="line-clamp-2 text-base font-semibold tracking-tight hover:underline"
                params={{ sessionId: item.id }}
                to="/sessions/$sessionId"
              >
                {item.title}
              </Link>

              <dl className="text-muted-foreground grid gap-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
                  <dd className="tabular-nums">
                    {formatDateTime(item.heldAt)}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPinIcon aria-hidden="true" className="size-3.5" />
                  <dd className="truncate">{item.location ?? "未填写地点"}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <UserRoundIcon aria-hidden="true" className="size-3.5" />
                  <dd className="truncate">{item.speaker ?? "未填写讲者"}</dd>
                </div>
              </dl>

              <div className="flex items-center justify-between gap-2">
                <TagList tags={item.tags ?? []} />
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                  <PaperclipIcon aria-hidden="true" className="size-3.5" />
                  {item.assetCount} 份资料
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {total > PAGE_SIZE ? (
        <PaginationBar
          onPageChange={setPage}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      ) : null}

      <SessionFormDialog
        defaultHeldAt={defaultHeldAt}
        onCreated={(id) => {
          void navigate({
            params: { sessionId: id },
            to: "/sessions/$sessionId",
          });
        }}
        onOpenChange={(open) => {
          setFormOpen(open);

          if (!open) {
            setEditing(null);
          }
        }}
        open={formOpen}
        session={editing}
      />

      <ConfirmDialog
        confirmLabel="删除"
        description={
          pendingDelete
            ? `「${pendingDelete.title}」将被删除，归档在会议下的素材会失去关联（素材本身不会被删除）。`
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
        title="删除学习会议？"
        tone="destructive"
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/sessions/")({
  component: SessionsPage,
});
