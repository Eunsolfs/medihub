import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  useBlocker,
  useNavigate,
  useRouteContext,
} from "@tanstack/react-router";
import {
  EyeIcon,
  FileEditIcon,
  Loader2Icon,
  LockIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { Textarea } from "@medihub/ui/components/textarea";

import { isAdminRole } from "#src/components/app-shell/roles.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { VisibilityBadge } from "#src/components/app-shell/ui/status-badges.tsx";
import { MarkdownEditor } from "#src/components/media/index.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";
import type { VisibilityKey } from "#src/lib/format.ts";

import { CoverPicker } from "./cover-picker.tsx";
import { MediaAttachmentEditor } from "./media-attachment-editor.tsx";
import {
  defaultVisibility,
  postMediaToDraft,
  sessionRoleOf,
  statusLabelOf,
  validateMedia,
  visibilityOptionOf,
} from "./post-utils.ts";
import type {
  MediaDraft,
  PostDetail,
  PostRow,
  PostStatus,
} from "./post-utils.ts";
import { TagInput } from "./tag-input.tsx";
import { VisibilityPicker } from "./visibility-picker.tsx";

interface EditorDraft {
  content: string;
  coverAssetId: string | null;
  excerpt: string;
  media: MediaDraft[];
  tags: string[];
  title: string;
  visibility: VisibilityKey;
}

const draftOf = (detail?: PostDetail): EditorDraft => ({
  content: detail?.post.content ?? "",
  coverAssetId: detail?.post.coverAssetId ?? null,
  excerpt: detail?.post.excerpt ?? "",
  media: detail?.media.map(postMediaToDraft) ?? [],
  tags: detail?.post.tags ?? [],
  title: detail?.post.title ?? "",
  visibility:
    visibilityOptionOf(detail?.post.visibility)?.value ?? defaultVisibility,
});

const errorMessageOf = (error: unknown): string =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : "操作失败，请稍后重试";

const Section = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="bg-card ring-foreground/10 grid gap-3 rounded-xl p-4 ring-1">
    <div className="grid gap-0.5">
      <h2 className="text-sm font-medium">{title}</h2>
      {description ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      ) : null}
    </div>
    {children}
  </section>
);

const EditorSkeleton = () => (
  <div className="grid gap-6">
    <div className="grid gap-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  </div>
);

const NoEditPermission = ({
  authorName,
  title,
}: {
  authorName: string | null;
  title: string;
}) => {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4">
      <PageHeader
        description="只有作者本人或科室管理员可以修改这篇内容。"
        title="无法编辑"
      />
      <EmptyState
        action={
          <Button
            onClick={() => {
              void navigate({ to: "/posts" });
            }}
            variant="outline"
          >
            返回文章列表
          </Button>
        }
        description={`《${title}》由 ${authorName ?? "其他成员"} 撰写，你可以直接在阅读页查看完整内容。`}
        icon={LockIcon}
        title="没有编辑权限"
      />
    </div>
  );
};

const PostEditorLoader = ({ postId }: { postId: string }) => {
  const { data } = useSuspenseQuery(
    api.posts.get.queryOptions({ input: { id: postId } })
  );

  const { session } = useRouteContext({ from: "/_authenticated" });
  const viewerId = session?.user.id;

  const canEdit =
    viewerId === data.post.authorId || isAdminRole(sessionRoleOf(session));

  if (!canEdit) {
    return (
      <NoEditPermission
        authorName={data.post.authorName}
        title={data.post.title}
      />
    );
  }

  return <PostEditorForm initial={data} postId={postId} />;
};

interface PostEditorFormProps {
  initial?: PostDetail;
  postId?: string;
}

const PostEditorForm = ({ initial, postId }: PostEditorFormProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [initialDraft] = useState<EditorDraft>(() => draftOf(initial));
  const [draft, setDraft] = useState<EditorDraft>(initialDraft);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialDraft));

  const [status, setStatus] = useState<PostStatus>(
    initial?.post.status ?? "draft"
  );

  const [publishedAt, setPublishedAt] = useState<Date | null>(
    initial?.post.publishedAt ?? null
  );

  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = JSON.stringify(draft) !== baseline;
  const slug = initial?.post.slug ?? null;

  const blocker = useBlocker({
    enableBeforeUnload: () => dirty,
    shouldBlockFn: ({ current, next }) =>
      dirty && current.pathname !== next.pathname,
    withResolver: true,
  });

  const createMutation = useMutation(api.posts.create.mutationOptions());
  const updateMutation = useMutation(api.posts.update.mutationOptions());
  const publishMutation = useMutation(api.posts.publish.mutationOptions());
  const removeMutation = useMutation(api.posts.remove.mutationOptions());

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const isBusy =
    isSaving || publishMutation.isPending || removeMutation.isPending;

  const patch = (next: Partial<EditorDraft>) => {
    setDraft((previous) => ({ ...previous, ...next }));
  };

  const refreshQueries = (id: string) => {
    void queryClient.invalidateQueries({
      queryKey: api.posts.get.key({ input: { id } }),
    });
    void queryClient.invalidateQueries({ queryKey: api.posts.list.key() });
  };

  const markSaved = () => {
    const normalized: EditorDraft = {
      ...draft,
      excerpt: draft.excerpt.trim(),
      title: draft.title.trim(),
    };

    setDraft(normalized);
    setBaseline(JSON.stringify(normalized));
  };

  const persist = async (): Promise<PostRow | null> => {
    if (draft.title.trim().length === 0) {
      toast.error("请先填写文章标题");

      return null;
    }

    const mediaError = validateMedia(draft.media);

    if (mediaError) {
      toast.error(mediaError);

      return null;
    }

    const values = {
      content: draft.content,
      coverAssetId: draft.coverAssetId,
      excerpt: draft.excerpt.trim() || null,
      media: draft.media.map((item) => ({ ...item })),
      tags: draft.tags,
      title: draft.title.trim(),
      visibility: draft.visibility,
    };

    const row = postId
      ? await updateMutation.mutateAsync({ ...values, id: postId })
      : await createMutation.mutateAsync(values);

    return row ?? null;
  };

  const handleSave = async () => {
    try {
      const saved = await persist();

      if (!saved) {
        return;
      }

      markSaved();
      refreshQueries(saved.id);
      toast.success(status === "published" ? "更改已保存" : "草稿已保存");

      if (!postId) {
        await navigate({
          ignoreBlocker: true,
          params: { postId: saved.id },
          replace: true,
          to: "/posts/$postId",
        });
      }
    } catch (error) {
      toast.error(errorMessageOf(error));
    }
  };

  const handlePublish = async () => {
    try {
      const saved = await persist();

      if (!saved) {
        return;
      }

      const published = await publishMutation.mutateAsync({
        id: saved.id,
        published: true,
      });

      if (!published) {
        toast.error("发布失败，请稍后重试");

        return;
      }

      setStatus("published");
      setPublishedAt(published.publishedAt ?? new Date());
      markSaved();
      refreshQueries(saved.id);
      toast.success("已发布，正在打开阅读页");

      await navigate({
        ignoreBlocker: true,
        params: { slug: published.slug },
        replace: !postId,
        to: "/p/$slug",
      });
    } catch (error) {
      toast.error(errorMessageOf(error));
    }
  };

  const handleUnpublish = async () => {
    if (!postId) {
      return;
    }

    try {
      const updated = await publishMutation.mutateAsync({
        id: postId,
        published: false,
      });

      if (!updated) {
        toast.error("取消发布失败，请稍后重试");

        return;
      }

      setStatus("draft");
      setPublishedAt(updated.publishedAt ?? null);
      refreshQueries(postId);
      toast.success("已取消发布，之前的分享链接暂时无法访问");
    } catch (error) {
      toast.error(errorMessageOf(error));
    }
  };

  const handleRemove = async () => {
    if (!postId) {
      return;
    }

    try {
      await removeMutation.mutateAsync({ id: postId });
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: api.posts.list.key() });
      toast.success("文章已删除");
      await navigate({ ignoreBlocker: true, to: "/posts" });
    } catch (error) {
      toast.error(errorMessageOf(error));
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              void navigate({ to: "/posts" });
            }}
            size="sm"
            variant="outline"
          >
            返回列表
          </Button>
        }
        description="正文用 Markdown 撰写，可以插入科室上传的视频、B 站视频和外部链接；发布后通过网址或二维码分享。"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span>状态：{statusLabelOf(status)}</span>
            <VisibilityBadge visibility={draft.visibility} />
            {publishedAt ? (
              <span>发布于 {formatDateTime(publishedAt)}</span>
            ) : null}
          </span>
        }
        title={postId ? "编辑教学文章" : "写教学文章"}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="post-title">标题</Label>
            <Input
              className="h-10 text-base md:text-base"
              id="post-title"
              maxLength={200}
              onChange={(event) => {
                patch({ title: event.target.value });
              }}
              placeholder="例如：游离皮瓣移植术后皮瓣危象的早期识别"
              value={draft.title}
            />
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              {draft.title.length}/200
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="post-excerpt">摘要</Label>
            <Textarea
              id="post-excerpt"
              maxLength={500}
              onChange={(event) => {
                patch({ excerpt: event.target.value });
              }}
              placeholder="一两句话说明这篇文章解决什么问题，会展示在列表卡片和分享页的描述里。"
              rows={3}
              value={draft.excerpt}
            />
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              {draft.excerpt.length}/500
            </p>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm leading-none font-medium">
                正文（Markdown）
              </span>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <FileEditIcon className="size-3.5" />
                支持标题、列表、表格、图片
              </span>
            </div>
            <MarkdownEditor
              minHeight={460}
              onChange={(content) => {
                patch({ content });
              }}
              placeholder={
                "## 病例回顾\n\n患者，男，56 岁……\n\n## 手术要点\n\n1. ……"
              }
              value={draft.content}
            />
          </div>
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-4 lg:self-start">
          <Section
            description={
              status === "published"
                ? "文章已发布，分享链接与二维码已经生效。"
                : "保存草稿不会对外可见，发布后才会生成可分享的链接。"
            }
            title="发布状态"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {statusLabelOf(status)}
              </span>
              <VisibilityBadge visibility={draft.visibility} />
            </div>
            {status === "published" && slug ? (
              <a
                className="text-primary inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                href={`/p/${slug}`}
                rel="noreferrer"
                target="_blank"
              >
                <EyeIcon className="size-3.5" />
                在阅读页打开
              </a>
            ) : null}
          </Section>

          <Section
            description="决定谁可以通过链接看到这篇文章。"
            title="可见范围"
          >
            <VisibilityPicker
              disabled={isBusy}
              onChange={(visibility) => {
                patch({ visibility });
              }}
              value={draft.visibility}
            />
          </Section>

          <Section description="最多 20 个，每个不超过 20 字。" title="标签">
            <TagInput
              disabled={isBusy}
              onChange={(tags) => {
                patch({ tags });
              }}
              value={draft.tags}
            />
          </Section>

          <Section description="不选封面时用渐变占位。" title="封面">
            <CoverPicker
              assetId={draft.coverAssetId}
              disabled={isBusy}
              onChange={(coverAssetId) => {
                patch({ coverAssetId });
              }}
              postId={postId}
            />
          </Section>

          <Section
            description="附件按顺序展示在正文下方，可嵌入本系统素材、B 站视频或外链。"
            title="媒体附件"
          >
            <MediaAttachmentEditor
              disabled={isBusy}
              media={draft.media}
              onChange={(media) => {
                patch({ media });
              }}
              postId={postId}
            />
          </Section>
        </aside>
      </div>

      <div className="bg-background/95 sticky bottom-[4.5rem] z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 backdrop-blur md:bottom-0 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <p className="text-muted-foreground text-xs">
          {dirty ? "有未保存的改动" : "所有改动已保存"}
          {initial
            ? ` · 最后更新 ${formatDateTime(initial.post.updatedAt)}`
            : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {postId ? (
            <Button
              disabled={isBusy}
              onClick={() => {
                setConfirmOpen(true);
              }}
              size="sm"
              variant="ghost"
            >
              <Trash2Icon />
              删除
            </Button>
          ) : null}
          {status === "published" ? (
            <Button
              disabled={isBusy}
              onClick={handleUnpublish}
              size="sm"
              variant="outline"
            >
              <Undo2Icon />
              取消发布
            </Button>
          ) : null}
          <Button
            disabled={isBusy}
            onClick={handleSave}
            size="sm"
            variant="outline"
          >
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {status === "published" ? "保存更改" : "保存草稿"}
          </Button>
          {status === "published" ? null : (
            <Button disabled={isBusy} onClick={handlePublish} size="sm">
              {publishMutation.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
              发布
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="放弃改动并离开"
        description="这篇教学文章还有未保存的改动，离开后这次编辑会丢失。"
        onConfirm={() => {
          blocker.proceed?.();
        }}
        onOpenChange={(open) => {
          if (!open) {
            blocker.reset?.();
          }
        }}
        open={blocker.status === "blocked"}
        title="离开编辑器？"
        tone="destructive"
      />

      <ConfirmDialog
        confirmLabel="删除文章"
        description="删除后文章与分享链接都会失效，正文和附件无法恢复。"
        isPending={removeMutation.isPending}
        onConfirm={handleRemove}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={`删除《${draft.title || "未命名文章"}》？`}
        tone="destructive"
      />
    </div>
  );
};

interface PostEditorProps {
  postId?: string;
}

/** 新建与编辑共用同一个编辑器：/posts/new 与 /posts/$postId 都渲染它。 */
export const PostEditor = ({ postId }: PostEditorProps) => {
  if (!postId) {
    return <PostEditorForm />;
  }

  return (
    <Suspense fallback={<EditorSkeleton />}>
      <PostEditorLoader postId={postId} />
    </Suspense>
  );
};
