import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  LockIcon,
  MapPinIcon,
  PaperclipIcon,
  PencilIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@medihub/ui/components/card";
import { Separator } from "@medihub/ui/components/separator";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import { AssetGrid, UploadButton } from "#src/components/media/index.ts";
import { SessionFormDialog } from "#src/components/sessions/session-form-dialog.tsx";
import {
  learningKindLabel,
  learningKindTone,
} from "#src/components/sessions/session-kind.ts";
import { sessionVisibilityLabel } from "#src/components/sessions/visibility.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const SessionDetailPage = () => {
  const { sessionId } = useParams({
    from: "/_authenticated/sessions/$sessionId",
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const sessionQuery = useQuery(
    api.learning.get.queryOptions({ input: { id: sessionId } })
  );

  const assetsQuery = useQuery(
    api.assets.list.queryOptions({
      input: { page: 1, pageSize: 100, sessionId },
    })
  );

  const session = sessionQuery.data;
  const assets = assetsQuery.data?.items ?? [];
  const canEdit = session?.canEdit === true;

  const removeMutation = useMutation(
    api.learning.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("学习会议已删除");
        await queryClient.invalidateQueries({
          queryKey: api.learning.list.key({ type: "query" }),
        });
        await navigate({ to: "/sessions" });
      },
    })
  );

  const refreshAssets = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.assets.list.key({ type: "query" }),
    });
  };

  if (sessionQuery.isPending) {
    return (
      <div className="grid gap-4">
        <PageHeader title="学习会议" />
        <LoadingRows rows={3} />
      </div>
    );
  }

  if (!session) {
    return (
      <EmptyState
        action={
          <Button
            nativeButton={false}
            render={<Link to="/sessions" />}
            variant="outline"
          >
            返回会议列表
          </Button>
        }
        description="这场会议可能已被删除，或不属于当前科室。"
        icon={CalendarDaysIcon}
        title="会议不存在"
      />
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <Button
          nativeButton={false}
          render={<Link to="/sessions" />}
          size="sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
          学习会议
        </Button>
      </div>

      {canEdit ? null : (
        <div className="bg-info/10 text-info ring-info/20 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ring-1">
          <LockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>只读：这场会议由其他成员创建，仅创建者与管理员可以编辑。</span>
        </div>
      )}

      <PageHeader
        actions={
          canEdit ? (
            <>
              <Button
                onClick={() => {
                  setFormOpen(true);
                }}
                variant="outline"
              >
                <PencilIcon />
                编辑
              </Button>
              <Button
                onClick={() => {
                  setDeleteOpen(true);
                }}
                variant="destructive"
              >
                <Trash2Icon />
                删除
              </Button>
            </>
          ) : null
        }
        description={session.description ?? "还没有填写会议简介。"}
        meta={
          <>
            <span
              className={`inline-flex h-5 items-center rounded-4xl px-2 text-xs font-medium ${learningKindTone(session.kind)}`}
            >
              {learningKindLabel(session.kind)}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
              {formatDateTime(session.heldAt)}
            </span>
            <span className="flex items-center gap-1">
              <MapPinIcon aria-hidden="true" className="size-3.5" />
              {session.location ?? "未填写地点"}
            </span>
            <span className="flex items-center gap-1">
              <UserRoundIcon aria-hidden="true" className="size-3.5" />
              {session.speaker ?? "未填写讲者"}
            </span>
          </>
        }
        title={session.title}
      />

      <Card>
        <CardHeader>
          <CardTitle>会议信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground">资料数量</span>
              <span className="flex items-center gap-1.5 font-medium">
                <PaperclipIcon aria-hidden="true" className="size-3.5" />
                {assets.length} 份
              </span>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground">可见范围</span>
              <span className="font-medium">
                {sessionVisibilityLabel(session.visibility)}
              </span>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground">标签</span>
              <TagList max={6} tags={session.tags ?? []} />
            </div>
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground">建档时间</span>
              <span className="font-medium">
                {formatDateTime(session.createdAt)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>课程安排</CardTitle>
          {session.courses.length > 0 ? (
            <CardDescription>
              共 {session.courses.length} 门课程
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {session.courses.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无课程安排</p>
          ) : (
            <ol className="divide-border divide-y overflow-hidden rounded-lg border">
              {session.courses.map((course, index) => (
                <li
                  className="grid gap-1 px-3 py-2.5 sm:grid-cols-[2rem_8rem_minmax(0,1fr)_8rem] sm:items-center sm:gap-3"
                  key={course.id ?? `${course.title}-${index}`}
                >
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {course.startsAt
                      ? formatDateTime(course.startsAt)
                      : "时间待定"}
                  </span>
                  <span className="min-w-0 text-sm font-medium">
                    {course.title}
                    {course.note ? (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {course.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {course.speaker ?? "未指定主讲"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">会议资料</h2>
            <p className="text-muted-foreground text-xs">
              {canEdit
                ? "课件、照片、录音与视频都可以在会后上传归档。"
                : "会议资料可预览与下载；如需补充资料，请联系创建者或管理员。"}
            </p>
          </div>
          {canEdit ? (
            <UploadButton
              onUploaded={() => {
                void refreshAssets();
              }}
              target={{ sessionId }}
            />
          ) : null}
        </div>

        {assetsQuery.isPending ? <LoadingRows rows={2} /> : null}

        {assetsQuery.isPending ? null : (
          <AssetGrid
            assets={assets}
            empty={
              <div className="grid place-items-center gap-1 py-10 text-center">
                <p className="text-sm font-medium">还没有归档资料</p>
                <p className="text-muted-foreground text-xs">
                  {canEdit
                    ? "点右上角「上传」，把这次会议的课件与影像归档到这里。"
                    : "这场会议还没有上传资料。"}
                </p>
              </div>
            }
          />
        )}
      </section>

      {canEdit ? (
        <SessionFormDialog
          onOpenChange={setFormOpen}
          open={formOpen}
          sessionId={session.id}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除"
        description={`「${session.title}」将被删除，已归档的素材会保留在资料库中但失去会议关联。`}
        isPending={removeMutation.isPending}
        onConfirm={() => {
          removeMutation.mutate({ id: session.id });
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title="删除学习会议？"
        tone="destructive"
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/sessions/$sessionId")({
  component: SessionDetailPage,
});
