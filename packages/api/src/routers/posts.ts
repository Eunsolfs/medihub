import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { user } from "@medihub/db/schema/auth";
import {
  post,
  postMedia,
  postMediaKind,
  postMediaProvider,
  postVisibility,
} from "@medihub/db/schema/content";

import { organizationIdOf } from "#src/access.ts";
import { organizationProcedure, publicProcedure } from "#src/procedures.ts";

const slugify = (title: string) => {
  const base = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u4E00-\u9FA5]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60);

  return base || `post-${Math.random().toString(36).slice(2, 8)}`;
};

const mediaInput = z.object({
  assetId: z.string().min(1).nullish(),
  durationSeconds: z.int().positive().nullish(),
  kind: z.enum(postMediaKind).default("video"),
  provider: z.enum(postMediaProvider).default("asset"),
  title: z.string().trim().max(200).nullish(),
  url: z.string().trim().max(1000).nullish(),
});

const postInput = z.object({
  content: z.string().max(200_000).default(""),
  coverAssetId: z.string().min(1).nullish(),
  excerpt: z.string().max(500).nullish(),
  media: z.array(mediaInput).max(30).default([]),
  tags: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  title: z.string().trim().min(1).max(200),
  visibility: z.enum(postVisibility).default("org"),
});

/** 生成全站唯一的 slug：保留中英文，冲突时追加序号。 */
const uniqueSlug = async (context: { db: Database }, title: string) => {
  const base = slugify(title);

  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;

    const [existing] = await context.db
      .select({ id: post.id })
      .from(post)
      .where(eq(post.slug, candidate));

    if (!existing) {
      return candidate;
    }
  }

  return `${base}-${Date.now().toString(36)}`;
};

export const postsRouter = {
  list: organizationProcedure
    .input(
      z.object({
        mine: z.boolean().default(false),
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(100).default(20),
        q: z.string().trim().max(80).optional(),
        status: z.enum(["draft", "published"]).optional(),
        visibility: z.enum(postVisibility).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const filters: SQL[] = [eq(post.organizationId, organizationId)];

      if (input.status) {
        filters.push(eq(post.status, input.status));
      }

      if (input.visibility) {
        filters.push(eq(post.visibility, input.visibility));
      }

      if (input.mine && context.viewer) {
        filters.push(eq(post.authorId, context.viewer.id));
      }

      if (input.q) {
        const keyword = `%${input.q}%`;

        const search = or(
          like(post.title, keyword),
          like(post.excerpt, keyword)
        );

        if (search) {
          filters.push(search);
        }
      }

      const where = and(...filters);

      const [items, totals] = await Promise.all([
        context.db
          .select({
            authorName: user.name,
            coverAssetId: post.coverAssetId,
            createdAt: post.createdAt,
            excerpt: post.excerpt,
            id: post.id,
            mediaCount: context.db.$count(
              postMedia,
              eq(postMedia.postId, post.id)
            ),
            publishedAt: post.publishedAt,
            slug: post.slug,
            status: post.status,
            tags: post.tags,
            title: post.title,
            updatedAt: post.updatedAt,
            viewCount: post.viewCount,
            visibility: post.visibility,
          })
          .from(post)
          .leftJoin(user, eq(post.authorId, user.id))
          .where(where)
          .orderBy(desc(post.updatedAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        context.db.select({ total: count() }).from(post).where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total: totals[0]?.total ?? 0,
      };
    }),

  get: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      const [row] = await context.db
        .select({
          authorId: post.authorId,
          authorName: user.name,
          content: post.content,
          coverAssetId: post.coverAssetId,
          createdAt: post.createdAt,
          excerpt: post.excerpt,
          id: post.id,
          publishedAt: post.publishedAt,
          slug: post.slug,
          status: post.status,
          tags: post.tags,
          title: post.title,
          updatedAt: post.updatedAt,
          viewCount: post.viewCount,
          visibility: post.visibility,
        })
        .from(post)
        .leftJoin(user, eq(post.authorId, user.id))
        .where(
          and(eq(post.id, input.id), eq(post.organizationId, organizationId))
        );

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "帖子不存在" });
      }

      const media = await context.db
        .select()
        .from(postMedia)
        .where(eq(postMedia.postId, row.id))
        .orderBy(asc(postMedia.sortOrder));

      return { media, post: row };
    }),

  create: organizationProcedure
    .input(postInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const slug = await uniqueSlug(context, input.title);

      const [created] = await context.db
        .insert(post)
        .values({
          authorId: viewer.id,
          content: input.content,
          coverAssetId: input.coverAssetId ?? null,
          excerpt: input.excerpt?.trim() || null,
          organizationId,
          slug,
          tags: input.tags,
          title: input.title,
          visibility: input.visibility,
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "创建帖子失败" });
      }

      if (input.media.length > 0) {
        await context.db.insert(postMedia).values(
          input.media.map((media, index) => ({
            assetId: media.assetId ?? null,
            durationSeconds: media.durationSeconds ?? null,
            kind: media.kind,
            postId: created.id,
            provider: media.provider,
            sortOrder: index,
            title: media.title?.trim() || null,
            url: media.url ?? null,
          }))
        );
      }

      return created;
    }),

  update: organizationProcedure
    .input(
      postInput
        .omit({ media: true })
        .partial()
        .extend({
          id: z.string().min(1),
          media: z.array(mediaInput).max(30).optional(),
        })
    )
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;
      const { id, media, ...values } = input;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ authorId: post.authorId })
        .from(post)
        .where(and(eq(post.id, id), eq(post.organizationId, organizationId)));

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "帖子不存在" });
      }

      if (existing.authorId !== viewer.id && viewer.role === "member") {
        throw new ORPCError("FORBIDDEN", { message: "只能编辑自己撰写的帖子" });
      }

      const [updated] = await context.db
        .update(post)
        .set({
          ...(values.content === undefined ? {} : { content: values.content }),
          ...(values.coverAssetId === undefined
            ? {}
            : { coverAssetId: values.coverAssetId ?? null }),
          ...(values.excerpt === undefined
            ? {}
            : { excerpt: values.excerpt?.trim() || null }),
          ...(values.tags === undefined ? {} : { tags: values.tags }),
          ...(values.title === undefined ? {} : { title: values.title }),
          ...(values.visibility === undefined
            ? {}
            : { visibility: values.visibility }),
        })
        .where(and(eq(post.id, id), eq(post.organizationId, organizationId)))
        .returning();

      if (media) {
        await context.db.delete(postMedia).where(eq(postMedia.postId, id));

        if (media.length > 0) {
          await context.db.insert(postMedia).values(
            media.map((item, index) => ({
              assetId: item.assetId ?? null,
              durationSeconds: item.durationSeconds ?? null,
              kind: item.kind,
              postId: id,
              provider: item.provider,
              sortOrder: index,
              title: item.title?.trim() || null,
              url: item.url ?? null,
            }))
          );
        }
      }

      return updated;
    }),

  publish: organizationProcedure
    .input(z.object({ id: z.string().min(1), published: z.boolean() }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);

      const [updated] = await context.db
        .update(post)
        .set({
          publishedAt: input.published ? new Date() : null,
          status: input.published ? "published" : "draft",
        })
        .where(
          and(eq(post.id, input.id), eq(post.organizationId, organizationId))
        )
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "帖子不存在" });
      }

      return updated;
    }),

  remove: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ authorId: post.authorId })
        .from(post)
        .where(
          and(eq(post.id, input.id), eq(post.organizationId, organizationId))
        );

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "帖子不存在" });
      }

      if (existing.authorId !== viewer.id && viewer.role === "member") {
        throw new ORPCError("FORBIDDEN", { message: "只能删除自己撰写的帖子" });
      }

      await context.db.delete(post).where(eq(post.id, input.id));

      return { id: input.id };
    }),

  /**
   * 公开访问（二维码 / 网址）。只返回已发布且可见范围为 public 的帖子；
   * logged_in 由页面在拿到会话后再判断。
   */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(120) }))
    .handler(async ({ context, input }) => {
      const [row] = await context.db
        .select({
          authorName: user.name,
          content: post.content,
          coverAssetId: post.coverAssetId,
          excerpt: post.excerpt,
          id: post.id,
          organizationId: post.organizationId,
          publishedAt: post.publishedAt,
          slug: post.slug,
          status: post.status,
          tags: post.tags,
          title: post.title,
          viewCount: post.viewCount,
          visibility: post.visibility,
        })
        .from(post)
        .leftJoin(user, eq(post.authorId, user.id))
        .where(and(eq(post.slug, input.slug), eq(post.status, "published")));

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "帖子不存在或未发布" });
      }

      const media = await context.db
        .select()
        .from(postMedia)
        .where(eq(postMedia.postId, row.id))
        .orderBy(asc(postMedia.sortOrder));

      await context.db
        .update(post)
        .set({ viewCount: row.viewCount + 1 })
        .where(eq(post.id, row.id));

      return {
        media,
        post: { ...row, viewCount: row.viewCount + 1 },
      };
    }),
};
