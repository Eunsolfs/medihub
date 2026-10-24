import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  EyeIcon,
  FileEditIcon,
  KeyRoundIcon,
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
import { Checkbox } from "@medihub/ui/components/checkbox";
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { Textarea } from "@medihub/ui/components/textarea";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { Markdown, MarkdownEditor } from "#src/components/media/index.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

import { AudienceSelector } from "./audience-selector.tsx";
import { CoverPicker } from "./cover-picker.tsx";
import { MediaAttachmentEditor } from "./media-attachment-editor.tsx";
import { PostPasswordBadge } from "./post-password-badge.tsx";
import {
  ACCESS_PASSWORD_MAX,
  defaultVisibility,
  postMediaToDraft,
  statusLabelOf,
  validateAccessPassword,
  validateMedia,
  visibilityOptionOf,
} from "./post-utils.ts";
import type {
  MediaDraft,
  MeProfile,
  PostDetail,
  PostRow,
  PostStatus,
  PostVisibility,
} from "./post-utils.ts";
import { PostVisibilityBadge } from "./post-visibility-badge.tsx";
import { TagInput } from "./tag-input.tsx";
import { VisibilityPicker } from "./visibility-picker.tsx";

interface EditorDraft {
  accessPassword: string;
  audienceOrganizations: string[];
  audienceUsers: string[];
  content: string;
  coverAssetId: string | null;
  excerpt: string;
  media: MediaDraft[];
  removePassword: boolean;
  tags: string[];
  title: string;
  visibility: PostVisibility;
}

const draftOf = (detail?: PostDetail): EditorDraft => ({
  accessPassword: "",
  audienceOrganizations: detail?.audience.organizations ?? [],
  audienceUsers: detail?.audience.users ?? [],
  content: detail?.post.content ?? "",
  coverAssetId: detail?.post.coverAssetId ?? null,
  excerpt: detail?.post.excerpt ?? "",
  media: detail?.media.map(postMediaToDraft) ?? [],
  removePassword: false,
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

const PostEditorLoader = ({
  postId,
  profile,
}: {
  postId: string;
  profile: MeProfile;
}) => {
  const { data } = useSuspenseQuery(
    api.posts.get.queryOptions({ input: { id: postId } })
  );

  return <PostEditorForm initial={data} postId={postId} profile={profile} />;
};

interface PostEditorFormProps {
  initial?: PostDetail;
  postId?: string;
  profile: MeProfile;
}

interface PersistResult {
  accessPassword: string | null | undefined;
  row: PostRow;
}

const PostEditorForm = ({ initial, postId, profile }: PostEditorFormProps) => {
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
  const [hasPassword, setHasPassword] = useState(initial?.hasPassword ?? false);

  const viewer = profile?.viewer ?? null;
  const role = viewer?.role ?? null;
  const viewerOrganizationId = viewer?.organizationId ?? null;
  const viewerOrganizationName = profile?.organization?.name ?? null;
  /** 阅读权与编辑权解耦：非作者/非管理员打开详情时整页只读。 */
  const readOnly = initial !== undefined && !initial.canEdit;

  /** 公开范围 + 已有密码或本次输入了密码时展示「密码」徽标。 */
  const passwordSet =
    draft.visibility === "public" &&
    !draft.removePassword &&
    (hasPassword || draft.accessPassword.trim().length > 0);

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

  /** 切换可见范围：离开「任何人」时清空密码字段，「指定对象」预置本科室。 */
  const handleVisibilityChange = (visibility: PostVisibility) => {
    const leavesPublic = visibility !== "public";

    if (visibility === "selected") {
      const organizations =
        draft.audienceOrganizations.length > 0
          ? draft.audienceOrganizations
          : role !== "root" && viewerOrganizationId !== null
            ? [viewerOrganizationId]
            : [];

      patch({
        accessPassword: leavesPublic ? "" : draft.accessPassword,
        audienceOrganizations: organizations,
        removePassword: leavesPublic ? false : draft.removePassword,
        visibility,
      });

      return;
    }

    patch({
      accessPassword: leavesPublic ? "" : draft.accessPassword,
      audienceOrganizations: [],
      audienceUsers: [],
      removePassword: leavesPublic ? false : draft.removePassword,
      visibility,
    });
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
      accessPassword: "",
      excerpt: draft.excerpt.trim(),
      removePassword: false,
      title: draft.title.trim(),
    };

    setDraft(normalized);
    setBaseline(JSON.stringify(normalized));
  };

  /**
   * 提交给后端的密码字段：
   * - 非「任何人」→ null（后端会顺手清空旧密码）
   * - 勾选「移除密码」→ null
   * - 输入了新密码 → 明文（后端哈希）
   * - 留空且原来有密码 → undefined（保持原密码不变）
   */
  const passwordPayload = (): string | null | undefined => {
    if (draft.visibility !== "public" || draft.removePassword) {
      return null;
    }

    const password = draft.accessPassword.trim();

    if (password.length > 0) {
      return password;
    }

    return postId !== undefined && hasPassword ? undefined : null;
  };

  const persist = async (): Promise<PersistResult | null> => {
    if (draft.title.trim().length === 0) {
      toast.error("请先填写文章标题");

      return null;
    }

    const mediaError = validateMedia(draft.media);

    if (mediaError) {
      toast.error(mediaError);

      return null;
    }

    if (
      draft.visibility === "selected" &&
      draft.audienceOrganizations.length === 0 &&
      draft.audienceUsers.length === 0
    ) {
      toast.error("「指定对象」至少要选择一个科室或一位成员");

      return null;
    }

    const accessPassword = passwordPayload();

    const passwordError =
      accessPassword === null || accessPassword === undefined
        ? null
        : validateAccessPassword(accessPassword);

    if (passwordError) {
      toast.error(passwordError);

      return null;
    }

    // 科室管理员只能指定本科室；root 可以指定任意科室与成员。
    const audienceOrganizations =
      draft.visibility === "selected"
        ? role === "dept_admin" && viewerOrganizationId !== null
          ? [viewerOrganizationId]
          : draft.audienceOrganizations
        : [];

    const values = {
      accessPassword,
      audienceOrganizations,
      audienceUsers: draft.visibility === "selected" ? draft.audienceUsers : [],
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

    return row ? { accessPassword, row } : null;
  };

  const handleSave = async () => {
    try {
      const saved = await persist();

      if (!saved) {
        return;
      }

      setHasPassword(
        saved.accessPassword === undefined
          ? hasPassword
          : saved.accessPassword !== null
      );
      markSaved();
      refreshQueries(saved.row.id);
      toast.success(status === "published" ? "更改已保存" : "草稿已保存");

      if (!postId) {
        await navigate({
          ignoreBlocker: true,
          params: { postId: saved.row.id },
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

      setHasPassword(
        saved.accessPassword === undefined
          ? hasPassword
          : saved.accessPassword !== null
      );

      const published = await publishMutation.mutateAsync({
        id: saved.row.id,
        published: true,
      });

      if (!published) {
        toast.error("发布失败，请稍后重试");

        return;
      }

      setStatus("published");
      setPublishedAt(published.publishedAt ?? new Date());
      markSaved();
      refreshQueries(saved.row.id);
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
          <span className="flex flex-wrap items-center gap-2">
            {readOnly && status === "published" && slug ? (
              <a
                className="text-primary inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm underline-offset-4 hover:underline"
                href={`/p/${slug}`}
                rel="noreferrer"
                target="_blank"
              >
                <EyeIcon className="size-4" />
                打开阅读页
              </a>
            ) : null}
            <Button
              onClick={() => {
                void navigate({ to: "/posts" });
              }}
              size="sm"
              variant="outline"
            >
              返回列表
            </Button>
          </span>
        }
        description={
          readOnly
            ? "你可以阅读、下载这篇文章；只有作者与管理员可以编辑。"
            : "正文用 Markdown 撰写，可以插入科室上传的视频、B 站视频和外部链接；发布后通过网址或二维码分享。"
        }
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <span>状态：{statusLabelOf(status)}</span>
            <PostVisibilityBadge visibility={draft.visibility} />
            {draft.visibility === "public" &&
            (readOnly ? hasPassword : passwordSet) ? (
              <PostPasswordBadge />
            ) : null}
            {publishedAt ? (
              <span>发布于 {formatDateTime(publishedAt)}</span>
            ) : null}
          </span>
        }
        title={readOnly ? "文章详情" : postId ? "编辑教学文章" : "写教学文章"}
      />

      {readOnly ? (
        <p className="bg-warning/10 text-warning border-warning/20 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          只读：仅作者与管理员可编辑。
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="post-title">标题</Label>
            <Input
              className="h-10 text-base md:text-base"
              disabled={readOnly}
              id="post-title"
              maxLength={200}
              onChange={(event) => {
                patch({ title: event.target.value });
              }}
              placeholder="例如：游离皮瓣移植术后皮瓣危象的早期识别"
              value={draft.title}
            />
            {readOnly ? null : (
              <p className="text-muted-foreground text-right text-xs tabular-nums">
                {draft.title.length}/200
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="post-excerpt">摘要</Label>
            <Textarea
              disabled={readOnly}
              id="post-excerpt"
              maxLength={500}
              onChange={(event) => {
                patch({ excerpt: event.target.value });
              }}
              placeholder="一两句话说明这篇文章解决什么问题，会展示在列表卡片和分享页的描述里。"
              rows={3}
              value={draft.excerpt}
            />
            {readOnly ? null : (
              <p className="text-muted-foreground text-right text-xs tabular-nums">
                {draft.excerpt.length}/500
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm leading-none font-medium">
                正文（Markdown）
              </span>
              {readOnly ? null : (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <FileEditIcon className="size-3.5" />
                  支持标题、列表、表格、图片
                </span>
              )}
            </div>
            {readOnly ? (
              <div className="bg-card ring-foreground/10 min-h-40 rounded-xl px-4 py-3 text-sm ring-1">
                <Markdown content={draft.content} />
              </div>
            ) : (
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
            )}
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
              <PostVisibilityBadge visibility={draft.visibility} />
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
            description="决定谁可以在列表与链接里看到这篇文章。"
            title="发布设置"
          >
            {readOnly ? (
              <div className="grid gap-2">
                <PostVisibilityBadge visibility={draft.visibility} />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {visibilityOptionOf(draft.visibility)?.description ?? "—"}
                </p>
                {draft.visibility === "selected" ? (
                  <p className="text-muted-foreground bg-muted/40 rounded-lg px-2.5 py-2 text-xs leading-relaxed">
                    指定科室 {draft.audienceOrganizations.length} 个 · 指定用户{" "}
                    {draft.audienceUsers.length} 位
                  </p>
                ) : null}
                {draft.visibility === "public" ? (
                  <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
                    <KeyRoundIcon className="size-3.5" />
                    {hasPassword ? "访问密码：已设置" : "访问密码：未设置"}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <VisibilityPicker
                  disabled={isBusy}
                  onChange={handleVisibilityChange}
                  role={role}
                  value={draft.visibility}
                />

                {draft.visibility === "selected" ? (
                  <AudienceSelector
                    disabled={isBusy}
                    onChangeOrganizations={(audienceOrganizations) => {
                      patch({ audienceOrganizations });
                    }}
                    onChangeUsers={(audienceUsers) => {
                      patch({ audienceUsers });
                    }}
                    organizationId={viewerOrganizationId}
                    organizationName={viewerOrganizationName}
                    organizations={draft.audienceOrganizations}
                    role={role}
                    users={draft.audienceUsers}
                  />
                ) : null}

                {draft.visibility === "public" ? (
                  <div className="grid gap-2 border-t pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <KeyRoundIcon className="text-muted-foreground size-3.5" />
                        <Label
                          className="text-xs"
                          htmlFor="post-access-password"
                        >
                          访问密码（可选）
                        </Label>
                      </span>
                      {passwordSet ? <PostPasswordBadge /> : null}
                    </div>
                    <Input
                      autoComplete="new-password"
                      className="h-11"
                      disabled={isBusy || draft.removePassword}
                      id="post-access-password"
                      maxLength={ACCESS_PASSWORD_MAX}
                      onChange={(event) => {
                        patch({ accessPassword: event.target.value });
                      }}
                      placeholder={
                        hasPassword
                          ? "已设置（留空保持不变）"
                          : "4–64 位，可留空"
                      }
                      type="password"
                      value={draft.accessPassword}
                    />
                    {hasPassword ? (
                      <label className="text-muted-foreground flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={draft.removePassword}
                          disabled={isBusy}
                          onCheckedChange={(checked) => {
                            patch({
                              accessPassword: "",
                              removePassword: checked,
                            });
                          }}
                        />
                        移除密码
                      </label>
                    ) : null}
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      设置后，只有知道密码的人才能查看，适合发给未注册的实习生。
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </Section>

          <Section description="最多 20 个，每个不超过 20 字。" title="标签">
            <TagInput
              disabled={readOnly || isBusy}
              onChange={(tags) => {
                patch({ tags });
              }}
              value={draft.tags}
            />
          </Section>

          <Section description="不选封面时用渐变占位。" title="封面">
            <CoverPicker
              assetId={draft.coverAssetId}
              disabled={readOnly || isBusy}
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
              disabled={readOnly || isBusy}
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
          {readOnly
            ? "只读：仅作者与管理员可编辑"
            : dirty
              ? "有未保存的改动"
              : "所有改动已保存"}
          {initial
            ? ` · 最后更新 ${formatDateTime(initial.post.updatedAt)}`
            : ""}
        </p>
        {readOnly ? (
          <Button
            onClick={() => {
              void navigate({ to: "/posts" });
            }}
            size="sm"
            variant="outline"
          >
            返回列表
          </Button>
        ) : (
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
              {isSaving ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SaveIcon />
              )}
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
        )}
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

const PostEditorContent = ({ postId }: PostEditorProps) => {
  const { data: profile } = useSuspenseQuery(api.me.profile.queryOptions());

  if (postId) {
    return <PostEditorLoader postId={postId} profile={profile} />;
  }

  return <PostEditorForm profile={profile} />;
};

/** 新建与编辑共用同一个编辑器：/posts/new 与 /posts/$postId 都渲染它。 */
export const PostEditor = ({ postId }: PostEditorProps) => (
  <Suspense fallback={<EditorSkeleton />}>
    <PostEditorContent postId={postId} />
  </Suspense>
);
