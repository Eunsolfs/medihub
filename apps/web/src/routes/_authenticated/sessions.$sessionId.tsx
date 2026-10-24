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

      <PageHeader
        actions={
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

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">会议资料</h2>
            <p className="text-muted-foreground text-xs">
              课件、照片、录音与视频都可以在会后上传归档。
            </p>
          </div>
          <UploadButton
            onUploaded={() => {
              void refreshAssets();
            }}
            target={{ sessionId }}
          />
        </div>

        {assetsQuery.isPending ? <LoadingRows rows={2} /> : null}

        {assetsQuery.isPending ? null : (
          <AssetGrid
            assets={assets}
            empty={
              <div className="grid place-items-center gap-1 py-10 text-center">
                <p className="text-sm font-medium">还没有归档资料</p>
                <p className="text-muted-foreground text-xs">
                  点右上角「上传」，把这次会议的课件与影像归档到这里。
                </p>
              </div>
            }
          />
        )}
      </section>

      <SessionFormDialog
        onOpenChange={setFormOpen}
        open={formOpen}
        session={session}
      />

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
