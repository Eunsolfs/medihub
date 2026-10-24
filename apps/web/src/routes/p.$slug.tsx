import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  CalendarDaysIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  HeartPulseIcon,
  KeyRoundIcon,
  Loader2Icon,
  LockIcon,
  PrinterIcon,
  QrCodeIcon,
  UserRoundIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { cn } from "@medihub/ui/lib/utils";

import { VisibilityBadge } from "#src/components/app-shell/ui/status-badges.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import { Markdown, VideoEmbed } from "#src/components/media/index.ts";
import {
  assetFileUrl,
  copyText,
  publicPostUrl,
  withAccessToken,
  withAccessTokenInMarkdown,
} from "#src/components/posts/post-utils.ts";
import type {
  PostGateSummary,
  PostMediaRow,
  PublicPostRecord,
  UnlockedPostResult,
} from "#src/components/posts/post-utils.ts";
import { SharePostDialog } from "#src/components/posts/share-dialog.tsx";
import { api } from "#src/lib/api.ts";
import { formatDate } from "#src/lib/format.ts";

const PROSE_CLASS = cn(
  "max-w-none text-[1.02rem] leading-8 text-pretty",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-3",
  "[&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic",
  "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]",
  "[&_h1]:mt-10 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_hr]:my-8",
  "[&_img]:my-4 [&_img]:rounded-lg",
  "[&_li]:my-1",
  "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_p]:my-4",
  "[&_pre]:bg-muted [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:text-sm",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse",
  "[&_td]:border-border [&_td]:border [&_td]:px-2 [&_td]:py-1",
  "[&_th]:border-border [&_th]:bg-muted [&_th]:border [&_th]:px-2 [&_th]:py-1",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
  "print:text-black"
);

const bySlugQueryOptions = (slug: string) =>
  api.posts.bySlug.queryOptions({
    input: { slug },
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

const BrandMark = () => (
  <a
    aria-label="回到医档通首页"
    className="focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3"
    href="/"
  >
    <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg">
      <HeartPulseIcon className="size-4" strokeWidth={2.1} />
    </span>
    <span className="grid leading-none">
      <span className="text-sm font-semibold tracking-tight">
        医档通 MediHub
      </span>
      <span className="text-muted-foreground mt-0.5 text-[0.6rem] font-medium tracking-[0.18em]">
        MEDIHUB
      </span>
    </span>
  </a>
);

const PublicShell = ({ children }: { children: ReactNode }) => (
  <div className="bg-background min-h-svh">
    <header className="bg-background/80 border-b print:hidden">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <BrandMark />
        <span className="text-muted-foreground hidden text-xs sm:inline">
          科室教学与分享
        </span>
      </div>
    </header>
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {children}
    </main>
    <footer className="border-t print:hidden">
      <div className="text-muted-foreground mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs sm:px-6">
        <span>医档通 MediHub · 科室内部知识沉淀与对外分享</span>
        <a
          className="hover:text-foreground underline-offset-4 hover:underline"
          href="/"
        >
          回到首页
        </a>
      </div>
    </footer>
  </div>
);

const GateCard = ({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) => (
  <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
    <span className="bg-muted text-muted-foreground grid size-11 place-items-center rounded-full">
      <LockIcon className="size-5" />
    </span>
    <p className="text-base font-medium">{title}</p>
    <p className="text-muted-foreground text-sm text-pretty">{description}</p>
    {action}
  </div>
);

const LoginGate = ({ slug }: { slug: string }) => (
  <GateCard
    action={
      <Link
        className={cn(buttonVariants({ size: "sm" }))}
        search={{ redirect: `/p/${slug}` }}
        to="/login"
      >
        登录后查看
      </Link>
    }
    description="这篇内容只对登录用户开放。登录后会自动回到这篇文章。"
    title="需要登录才能阅读"
  />
);

const DeniedGate = ({
  reason,
}: {
  reason: "organization" | "owner" | "audience";
}) => (
  <GateCard
    action={
      <Link
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        to="/dashboard"
      >
        返回工作台
      </Link>
    }
    description={
      reason === "organization"
        ? "这篇文章的可见范围是「仅科室内部」：需要登录该科室的账号才能阅读。"
        : reason === "audience"
          ? "这篇文章只对指定的科室或用户可见，当前账号不在名单里。"
          : "这篇内容的可见范围是「仅自己」，只有作者本人与管理员可以阅读。"
    }
    title={reason === "owner" ? "仅作者本人可见" : "没有访问权限"}
  />
);

/**
 * 素材文件走 `/api/files/:id` 的权限校验：挂在文章上（postId）的素材匿名可读，
 * 而资料库里独立存在的素材只有登录后可见。公开页被 403 时优雅降级，避免出现破图。
 */
const PublicImage = ({
  alt,
  className,
  fallback,
  src,
}: {
  alt: string;
  className?: string;
  fallback?: ReactNode;
  src: string;
}) => {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return <>{fallback ?? null}</>;
  }

  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        setBroken(true);
      }}
      src={src}
    />
  );
};

const MediaBlock = ({
  accessToken,
  item,
}: {
  accessToken: string | null;
  item: PostMediaRow;
}) => {
  if (item.provider === "bilibili" && item.url) {
    return (
      <figure className="grid gap-2">
        <div className="bg-muted aspect-video overflow-hidden rounded-xl">
          <VideoEmbed
            provider="bilibili"
            title={item.title ?? "B 站视频"}
            url={item.url}
          />
        </div>
        {item.title ? (
          <figcaption className="text-muted-foreground text-center text-xs">
            {item.title}
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (item.provider === "asset" && item.assetId) {
    const url = withAccessToken(assetFileUrl(item.assetId), accessToken);

    if (item.kind === "image") {
      return (
        <figure className="grid gap-2">
          <PublicImage
            alt={item.title ?? "文章配图"}
            className="w-full rounded-xl border object-contain"
            fallback={
              <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-xs">
                这张图片来自资料库，需要登录后查看。
              </p>
            }
            src={url}
          />
          {item.title ? (
            <figcaption className="text-muted-foreground text-center text-xs">
              {item.title}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    if (item.kind === "video") {
      return (
        <div className="bg-muted aspect-video overflow-hidden rounded-xl">
          <VideoEmbed
            provider="asset"
            title={item.title ?? "科室视频"}
            url={url}
          />
        </div>
      );
    }

    if (item.kind === "audio") {
      return (
        <div className="grid gap-2 rounded-xl border p-3">
          <audio className="w-full" controls src={url}>
            <track kind="captions" />
          </audio>
          <p className="text-muted-foreground text-xs">
            {item.title ?? "音频附件"}
          </p>
        </div>
      );
    }

    return (
      <a
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        href={url}
        rel="noreferrer"
        target="_blank"
      >
        {item.title ?? "下载附件"}
      </a>
    );
  }

  if (item.provider === "external" && item.url) {
    return (
      <a
        className="hover:bg-muted/60 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors"
        href={item.url}
        rel="noreferrer"
        target="_blank"
      >
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">{item.title ?? item.url}</span>
          <span className="text-muted-foreground truncate text-xs">
            {item.url}
          </span>
        </span>
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          打开链接
        </span>
      </a>
    );
  }

  return null;
};

const ArticleView = ({
  accessToken,
  media,
  post,
  slug,
}: {
  accessToken: string | null;
  media: PostMediaRow[];
  post: PublicPostRecord;
  slug: string;
}) => {
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // 密码帖的图片/附件都要带令牌：正文里的 /api/files/... 统一重写。
  const content = useMemo(
    () => withAccessTokenInMarkdown(post.content, accessToken),
    [accessToken, post.content]
  );

  const handleCopy = async () => {
    try {
      await copyText(publicPostUrl(slug));
      setCopied(true);
      toast.success("分享链接已复制");
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "复制失败，请手动复制"
      );
    }
  };

  return (
    <article className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <VisibilityBadge visibility={post.visibility} />
          <span className="text-muted-foreground text-xs">
            {formatDate(post.publishedAt)}
          </span>
        </div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[2rem]">
          {post.title}
        </h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <UserRoundIcon className="size-4" />
            {post.authorName ?? "未知作者"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDaysIcon className="size-4" />
            {formatDate(post.publishedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <EyeIcon className="size-4" />
            {post.viewCount} 次阅读
          </span>
        </div>
        {post.tags.length > 0 ? <TagList max={8} tags={post.tags} /> : null}
      </header>

      {post.coverAssetId ? (
        <PublicImage
          alt={`${post.title} 封面`}
          className="aspect-[16/9] w-full rounded-xl object-cover"
          fallback={
            <div
              aria-hidden="true"
              className="from-primary/10 via-muted to-accent aspect-[16/9] w-full rounded-xl bg-gradient-to-br"
            />
          }
          src={withAccessToken(assetFileUrl(post.coverAssetId), accessToken)}
        />
      ) : null}

      <div className={PROSE_CLASS}>
        <Markdown content={content} />
      </div>

      {media.length > 0 ? (
        <section className="grid gap-4 border-t pt-6 print:hidden">
          <h2 className="text-base font-semibold">附件与视频</h2>
          {media.map((item) => (
            <MediaBlock accessToken={accessToken} item={item} key={item.id} />
          ))}
        </section>
      ) : null}

      <section className="bg-muted/40 mt-2 grid gap-3 rounded-xl border p-4 print:hidden">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-medium">分享这篇文章</h2>
          <p className="text-muted-foreground text-xs">
            复制链接发给同事，或让同事用手机扫码直接打开。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleCopy} size="sm" variant="outline">
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "已复制" : "复制链接"}
          </Button>
          <Button
            onClick={() => {
              setShareOpen(true);
            }}
            size="sm"
            variant="outline"
          >
            <QrCodeIcon />
            二维码
          </Button>
          <Button
            onClick={() => {
              window.print();
            }}
            size="sm"
            variant="outline"
          >
            <PrinterIcon />
            打印
          </Button>
        </div>
      </section>

      <SharePostDialog
        onOpenChange={setShareOpen}
        open={shareOpen}
        slug={slug}
        title={post.title}
        withPrint
      />
    </article>
  );
};

const LoadingView = () => (
  <div className="grid gap-4">
    <Skeleton className="h-5 w-32" />
    <Skeleton className="h-9 w-3/4" />
    <Skeleton className="h-4 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
);

const messageOfError = (error: unknown): string =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : "这篇文章可能还没发布，或者链接已经失效。";

const PasswordGate = ({
  onUnlocked,
  slug,
  summary,
}: {
  onUnlocked: (result: UnlockedPostResult) => void;
  slug: string;
  summary: PostGateSummary;
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unlockMutation = useMutation(
    api.posts.bySlug.mutationOptions({
      onError: (mutationError) => {
        setError(messageOfError(mutationError));
      },
      onSuccess: (result) => {
        if (result.gated) {
          setError("密码不正确");

          return;
        }

        setError(null);
        onUnlocked(result);
      },
    })
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (unlockMutation.isPending) {
      return;
    }

    const candidate = password.trim();

    if (candidate.length === 0) {
      setError("请输入访问密码");

      return;
    }

    setError(null);
    unlockMutation.mutate({ password: candidate, slug });
  };

  return (
    <div className="mx-auto grid w-full max-w-md gap-6">
      <header className="grid gap-2 text-center">
        <span className="bg-muted text-muted-foreground mx-auto grid size-11 place-items-center rounded-full">
          <KeyRoundIcon className="size-5" />
        </span>
        <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance">
          {summary.title}
        </h1>
        <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          <span>{summary.authorName ?? "未知作者"}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDate(summary.publishedAt)}</span>
        </p>
        {summary.tags.length > 0 ? (
          <TagList className="justify-center" max={6} tags={summary.tags} />
        ) : null}
      </header>

      <form className="grid gap-3" onSubmit={handleSubmit}>
        <p className="text-muted-foreground text-sm leading-relaxed">
          这篇文章需要访问密码。作者或分享人应该已经把密码告诉你了。
        </p>
        <Input
          aria-label="访问密码"
          autoComplete="current-password"
          autoFocus
          className="h-11"
          disabled={unlockMutation.isPending}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          placeholder="请输入访问密码"
          type="password"
          value={password}
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          className="h-11 w-full"
          disabled={unlockMutation.isPending}
          type="submit"
        >
          {unlockMutation.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <KeyRoundIcon />
          )}
          {unlockMutation.isPending ? "验证中…" : "查看内容"}
        </Button>
        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          密码只用于本次阅读，刷新页面后需要重新输入。
        </p>
      </form>
    </div>
  );
};

const PublicPostError = ({ error }: ErrorComponentProps) => (
  <PublicShell>
    <GateCard
      action={
        <a className={cn(buttonVariants({ size: "sm" }))} href="/">
          回到首页
        </a>
      }
      description={messageOfError(error)}
      title="文章不存在或未发布"
    />
  </PublicShell>
);

const PublicPostPage = () => {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(bySlugQueryOptions(slug));

  const [unlocked, setUnlocked] = useState<{
    result: UnlockedPostResult;
    slug: string;
  } | null>(null);

  // 切换文章时重置解锁状态，避免上一篇的令牌作用到下一篇。
  const unlockedResult = unlocked?.slug === slug ? unlocked.result : null;

  if (unlockedResult) {
    return (
      <PublicShell>
        <ArticleView
          accessToken={unlockedResult.accessToken}
          media={unlockedResult.media}
          post={unlockedResult.post}
          slug={slug}
        />
      </PublicShell>
    );
  }

  // 可见范围由服务端判定：被拦下时只会拿到标题等摘要，不会下发正文与附件。
  if (data.gated) {
    if (data.reason === "password") {
      return (
        <PublicShell>
          <PasswordGate
            key={slug}
            onUnlocked={(result) => {
              setUnlocked({ result, slug });
            }}
            slug={slug}
            summary={data.summary}
          />
        </PublicShell>
      );
    }

    return (
      <PublicShell>
        {data.reason === "login" ? (
          <LoginGate slug={slug} />
        ) : (
          <DeniedGate reason={data.reason} />
        )}
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <ArticleView
        accessToken={data.accessToken}
        media={data.media}
        post={data.post}
        slug={slug}
      />
    </PublicShell>
  );
};

export const Route = createFileRoute("/p/$slug")({
  // TanStack Query 6 已废弃 ensureQueryData；`query` 是等价的替代写法。
  loader: async ({ context, params }) =>
    await context.queryClient.query(bySlugQueryOptions(params.slug)),
  head: ({ loaderData }) => {
    const title = loaderData
      ? loaderData.gated
        ? loaderData.summary.title
        : loaderData.post.title
      : null;

    // 被门禁拦下时不要泄露摘要与正文，只出标题与站点信息。
    const description =
      loaderData && !loaderData.gated
        ? (loaderData.post.excerpt ??
          "医档通 MediHub 的科室教学文章与手术视频分享。")
        : "医档通 MediHub 的科室教学文章与手术视频分享。";

    return {
      meta: [
        {
          title: title
            ? `${title} · 医档通 MediHub`
            : "文章不存在 · 医档通 MediHub",
        },
        { content: description, name: "description" },
        { content: title ?? "医档通 MediHub", property: "og:title" },
        { content: description, property: "og:description" },
        { content: "article", property: "og:type" },
      ],
    };
  },
  component: PublicPostPage,
  errorComponent: PublicPostError,
  pendingComponent: LoadingView,
});
