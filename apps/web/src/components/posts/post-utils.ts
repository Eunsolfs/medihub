/** 教学帖子的共用类型与工具：列表、编辑器、公开页都从这里取。 */
import {
  GlobeIcon,
  LockIcon,
  LogInIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { assetFileUrl } from "#src/components/media/index.ts";
import type { ThumbAsset } from "#src/components/media/index.ts";
import type { api } from "#src/lib/api.ts";

type ApiUtils = typeof api;

export type PostSummary = Awaited<
  ReturnType<ApiUtils["posts"]["list"]["call"]>
>["items"][number];

export type PostDetail = Awaited<ReturnType<ApiUtils["posts"]["get"]["call"]>>;

export type PostMediaRow = PostDetail["media"][number];

/** 当前登录用户与所属科室：可见范围选项按角色收敛用。 */
export type MeProfile = Awaited<ReturnType<ApiUtils["me"]["profile"]["call"]>>;

/** create / update / publish 直接返回 post 表的原始行（没有 join 作者名）。 */
export type PostRow = NonNullable<
  Awaited<ReturnType<ApiUtils["posts"]["create"]["call"]>>
>;

/** bySlug 的返回是「放行」与「门禁」的联合类型；这里取放行分支的记录。 */
export type BySlugResult = Awaited<
  ReturnType<ApiUtils["posts"]["bySlug"]["call"]>
>;

/** 公开页正文记录：不含 authorId、createdAt、updatedAt。 */
export type PublicPostRecord = Extract<BySlugResult, { gated: false }>["post"];

/** 被门禁拦下时只回标题、作者、日期等摘要，不含正文与附件。 */
export type PostGateSummary = Extract<BySlugResult, { gated: true }>["summary"];

/** 通过密码（或本来就不需要密码）后的完整结果，含素材访问令牌。 */
export type UnlockedPostResult = Extract<BySlugResult, { gated: false }>;

export const ACCESS_PASSWORD_MIN = 4;

export const ACCESS_PASSWORD_MAX = 64;

/** 访问密码只在「任何人」可见时使用；返回第一条中文错误。 */
export const validateAccessPassword = (value: string): string | null => {
  const password = value.trim();

  if (password.length === 0) {
    return null;
  }

  if (password.length < ACCESS_PASSWORD_MIN) {
    return `访问密码至少 ${ACCESS_PASSWORD_MIN} 位`;
  }

  if (password.length > ACCESS_PASSWORD_MAX) {
    return `访问密码最多 ${ACCESS_PASSWORD_MAX} 位`;
  }

  return null;
};

/**
 * 密码帖的素材文件必须带令牌：`/api/files/<id>?access=<token>`。
 * token 由 bySlug 在密码正确后签发，带过期时间且由服务端密钥加密。
 */
export const withAccessToken = (
  url: string,
  token: string | null | undefined
): string => {
  if (!token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";

  return `${url}${separator}access=${encodeURIComponent(token)}`;
};

/**
 * 正文是 Markdown 字符串，图片/附件可能写成 `![](/api/files/x)` 或内联 HTML。
 * 解锁后统一替换成带 access 令牌的地址，避免正文图片 403。
 */
export const withAccessTokenInMarkdown = (
  content: string,
  token: string | null | undefined
): string => {
  if (!token) {
    return content;
  }

  const encoded = encodeURIComponent(token);

  return content.replaceAll(
    /\/api\/files\/([A-Za-z0-9-]+)(\?[^)"'\s<>]*)?/gu,
    (match, assetId: string, query: string | undefined) => {
      if (match.includes("access=")) {
        return match;
      }

      const base = `/api/files/${assetId}`;
      const search = query ?? "";

      return `${base}${search ? `${search}&` : "?"}access=${encoded}`;
    }
  );
};

export type PostStatus = "draft" | "published";

export type MediaProvider = "asset" | "bilibili" | "external";

export type MediaKind = "audio" | "file" | "image" | "video";

/** 编辑器里的媒体草稿：与 create/update 的 media 入参一一对应。 */
export interface MediaDraft {
  assetId: string | null;
  durationSeconds: number | null;
  kind: MediaKind;
  provider: MediaProvider;
  title: string | null;
  url: string | null;
}

const MEDIA_MIME: Record<string, string> = {
  audio: "audio/mpeg",
  document: "application/pdf",
  file: "application/octet-stream",
  image: "image/jpeg",
  video: "video/mp4",
};

const MEDIA_KIND_TO_ASSET_KIND: Record<MediaKind, string> = {
  audio: "audio",
  file: "document",
  image: "image",
  video: "video",
};

export const assetKindOfMedia = (kind: MediaKind): string =>
  MEDIA_KIND_TO_ASSET_KIND[kind];

export { assetFileUrl };

/** 只有 assetId 时也要能显示出缩略图，所以把已知字段摊平成媒体工具箱的形状。 */
export const assetLikeOf = (
  assetId: string,
  options: { kind?: string; name?: string } = {}
): ThumbAsset => {
  const kind = options.kind ?? "image";

  return {
    id: assetId,
    kind,
    mimeType: MEDIA_MIME[kind] ?? MEDIA_MIME.file,
    originalName: options.name ?? "素材",
  };
};

/** 公开访问地址：/p/<slug>，二维码与复制链接都用它。slug 只含中英文与连字符，可直接拼。 */
export const publicPostUrl = (slug: string): string =>
  `${window.location.origin}/p/${slug}`;

/** B 站视频号：链接里形如 .../video/BV1xx411c7mD。 */
const BILIBILI_BV_PATTERN = /BV[0-9A-Za-z]{10}/u;

export const extractBilibiliBv = (
  value: string | null | undefined
): string | null => {
  if (!value) {
    return null;
  }

  const match = BILIBILI_BV_PATTERN.exec(value.trim());

  return match ? match[0] : null;
};

/** 无论是粘贴完整链接还是裸 BV 号，都统一存成规范链接。 */
export const normalizeBilibiliUrl = (value: string): string | null => {
  const bv = extractBilibiliBv(value);

  return bv ? `https://www.bilibili.com/video/${bv}` : null;
};

const statusLabels = {
  draft: "草稿",
  published: "已发布",
} as const;

export const statusLabelOf = (status: string | null | undefined): string =>
  status === "published" ? statusLabels.published : statusLabels.draft;

export const mediaKindLabels: Record<MediaKind, string> = {
  audio: "音频",
  file: "文件",
  image: "图片",
  video: "视频",
};

export const mediaProviderLabels: Record<MediaProvider, string> = {
  asset: "本系统素材",
  bilibili: "B 站视频",
  external: "外部链接",
};

/** 后端帖子的五档可见范围（含「指定对象」）。 */
export type PostVisibility =
  | "private"
  | "org"
  | "logged_in"
  | "selected"
  | "public";

interface VisibilityOption {
  description: string;
  icon: LucideIcon;
  label: string;
  value: PostVisibility;
}

/** 五档可见范围与各自的一句话说明，按「范围从窄到宽」排列。 */
export const visibilityOptions: readonly VisibilityOption[] = [
  {
    description: "只有你自己与管理员能看到，适合还没想好的内容。",
    icon: LockIcon,
    label: "仅自己",
    value: "private",
  },
  {
    description: "本科室的同事登录后可以阅读。",
    icon: UsersIcon,
    label: "本科室",
    value: "org",
  },
  {
    description: "全系统所有登录用户都可以阅读。",
    icon: LogInIcon,
    label: "全系统登录用户",
    value: "logged_in",
  },
  {
    description: "只对指定的科室或用户可见，名单会在下方展开选择。",
    icon: UserCheckIcon,
    label: "指定对象",
    value: "selected",
  },
  {
    description: "任何人拿到链接都能阅读，无需登录。",
    icon: GlobeIcon,
    label: "任何人",
    value: "public",
  },
];

export const visibilityOptionOf = (
  value: string | null | undefined
): VisibilityOption | undefined =>
  visibilityOptions.find((option) => option.value === value);

/** 可见范围的中文标签（含「指定对象」），卡片与编辑器共用。 */
export const visibilityLabelOf = (value: string | null | undefined): string =>
  visibilityOptionOf(value)?.label ?? "未设置";

/**
 * 角色能选的可见范围：成员只能最基础的三档，科室管理员增加「全系统 / 指定对象」，
 * root 可选全部（后端还会再校验一次，前端只负责不展示越权选项）。
 */
export const visibilityOptionsForRole = (
  role: string | null | undefined
): readonly VisibilityOption[] => {
  if (role === "root" || role === "dept_admin") {
    return visibilityOptions;
  }

  return visibilityOptions.filter(
    (option) => option.value !== "logged_in" && option.value !== "selected"
  );
};

export const defaultVisibility: PostVisibility = "org";

const mediaProviderOf = (value: string | null | undefined): MediaProvider =>
  value === "bilibili" || value === "external" ? value : "asset";

const mediaKindOf = (value: string | null | undefined): MediaKind =>
  value === "audio" || value === "file" || value === "image" ? value : "video";

/** 统一校验一份媒体草稿，返回第一条中文错误。 */
export const validateMedia = (drafts: readonly MediaDraft[]): string | null => {
  for (const item of drafts) {
    if (item.provider === "asset" && !item.assetId) {
      return "有一项本系统素材还没有选择素材";
    }

    if (item.provider === "bilibili" && !extractBilibiliBv(item.url)) {
      return "B 站视频需要在链接里包含 BV 号，例如 BV1xx411c7mD";
    }

    if (item.provider === "external" && !item.url) {
      return "外部链接需要填写网址";
    }
  }

  return null;
};

export const copyText = async (text: string): Promise<void> => {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持自动复制，请手动选中链接复制");
  }

  await navigator.clipboard.writeText(text);
};

type SessionLike = { user: { id: string; name: string } } | null;

/** 会话里的 role / organizationId 由服务端附加字段提供，客户端按字符串容错。 */
export const sessionRoleOf = (session: SessionLike): string | undefined => {
  const user = session?.user as { role?: unknown } | undefined;

  return typeof user?.role === "string" ? user.role : undefined;
};

export const postMediaToDraft = (row: PostMediaRow): MediaDraft => ({
  assetId: row.assetId,
  durationSeconds: row.durationSeconds,
  kind: mediaKindOf(row.kind),
  provider: mediaProviderOf(row.provider),
  title: row.title,
  url: row.url,
});

interface UploadedAssetInfo {
  id: string;
  kind: string;
  name: string;
}

/**
 * 上传接口的返回在媒体工具箱里由 UploadButton 交回来；这里只读需要的三个字段，
 * 既兼容单个素材与数组两种回调，也不会把 `any` 带进页面。
 */
const readUploadedAsset = (value: unknown): UploadedAssetInfo | null => {
  if (typeof value !== "object" || value === null || !("id" in value)) {
    return null;
  }

  const record = value as {
    id?: unknown;
    kind?: unknown;
    originalName?: unknown;
  };

  if (typeof record.id !== "string") {
    return null;
  }

  return {
    id: record.id,
    kind: typeof record.kind === "string" ? record.kind : "video",
    name:
      typeof record.originalName === "string" ? record.originalName : "素材",
  };
};

export const firstUploadedAsset = (value: unknown): UploadedAssetInfo | null =>
  readUploadedAsset(Array.isArray(value) ? value[0] : value);

/** 上传接口返回的 asset.kind 是资料库语义，帖子附件用另一套四分类。 */
export const mediaKindOfAssetKind = (kind: string): MediaKind =>
  kind === "audio" || kind === "image" || kind === "video" ? kind : "file";
