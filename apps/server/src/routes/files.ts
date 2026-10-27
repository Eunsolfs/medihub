import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";

import { loadAudience, postViewGate, verifyShareAccess } from "@medihub/api";
import type { ShareAudience, Viewer } from "@medihub/api";
import {
  asset,
  clinicalStage,
  post,
  postMedia,
} from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";
import { patient } from "@medihub/db/schema/patients";
import { storageTarget } from "@medihub/db/schema/system";
import { buildStorageKey, detectAssetKind } from "@medihub/storage";
import type { StorageDriver, StorageTargetLike } from "@medihub/storage";

import { db, storage, storageRoot } from "#src/context.ts";
import { env } from "#src/env.ts";
import { viewerOf } from "#src/lib/session.ts";
import { checkUploadQuota } from "#src/storage-guard.ts";

/**
 * 上传要落到哪个科室：普通账号用自己的科室；root 用顶部切换器指定的科室，
 * 没指定时回落到系统第一个科室，保证「无归属科室的全局管理员」也能直接上传。
 */
const uploadOrganizationId = async (viewer: Viewer, scope?: string) => {
  if (viewer.role !== "root") {
    return viewer.organizationId;
  }

  const requested = scope?.trim() || viewer.organizationId;

  if (requested) {
    const [target] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, requested));

    return target?.id ?? null;
  }

  const [first] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.kind, "department"))
    .orderBy(asc(organization.createdAt))
    .limit(1);

  return first?.id ?? null;
};

/**
 * 找到本次写入用的存储目标：优先指定的、其次本组织默认、再次全局默认。
 * 第一次上传时若系统里还没有任何目标，就地创建一个本地磁盘目标，
 * 让空库也能立刻用起来。
 */
const resolveTarget = async (organizationId: string, targetId?: string) => {
  if (targetId) {
    const [row] = await db
      .select()
      .from(storageTarget)
      .where(
        and(
          eq(storageTarget.id, targetId),
          eq(storageTarget.enabled, true),
          or(
            eq(storageTarget.organizationId, organizationId),
            isNull(storageTarget.organizationId)
          )
        )
      );

    if (!row) {
      throw new Error("指定的存储目标不可用");
    }

    return row;
  }

  const rows = await db
    .select()
    .from(storageTarget)
    .where(
      and(
        eq(storageTarget.enabled, true),
        or(
          eq(storageTarget.organizationId, organizationId),
          isNull(storageTarget.organizationId)
        )
      )
    )
    .orderBy(desc(storageTarget.isDefault));

  const preferred =
    rows.find(
      (row) => row.organizationId === organizationId && row.isDefault
    ) ??
    rows.find((row) => row.organizationId === null && row.isDefault) ??
    rows[0];

  if (preferred) {
    return preferred;
  }

  const [created] = await db
    .insert(storageTarget)
    .values({
      config: storage.encrypt({ rootPath: storageRoot }),
      driver: "local",
      isDefault: true,
      name: "服务器本地磁盘",
      organizationId: null,
    })
    .returning();

  if (!created) {
    throw new Error("创建默认存储目标失败");
  }

  return created;
};

const driverOf = (row: StorageTargetLike) => storage.driverFor(row);

type PostRow = typeof post.$inferSelect;

/** 帖子素材的可见性完全跟随帖子的可见范围（与 posts.bySlug 同一套判定）。 */
const postAllowsViewer = (
  parent: PostRow,
  viewer: Viewer | null,
  audience?: ShareAudience,
  accessToken?: string
) => {
  if (parent.status !== "published") {
    return false;
  }

  // 「任何人 + 访问密码」的帖子：素材必须带有效令牌才能读；
  // 作者与管理员在后台预览/编辑时直接放行，否则缩略图会变成破图。
  if (parent.visibility === "public" && parent.accessPasswordHash) {
    const canEdit =
      viewer !== null &&
      (viewer.role === "root" ||
        parent.authorId === viewer.id ||
        (viewer.role === "dept_admin" &&
          viewer.organizationId === parent.organizationId));

    if (canEdit) {
      return true;
    }

    return verifyShareAccess(
      (payload) => storage.decrypt<never>(payload),
      accessToken,
      parent.id
    );
  }

  return postViewGate(
    {
      authorId: parent.authorId,
      organizationId: parent.organizationId,
      visibility: parent.visibility,
    },
    viewer,
    audience
  ).allowed;
};

/**
 * 素材能否被当前访问者读取。
 *
 * 帖子里的素材有两条引用路径：直接上传时写入 `asset.postId`，以及在编辑器里
 * 上传后再添加为附件/封面时只存在 `post_media.asset_id` 与 `post.cover_asset_id`。
 * 两者都要按所属帖子的可见范围判定，否则公开帖的图片对匿名访客会 403。
 */
const canReadAsset = async (
  row: typeof asset.$inferSelect,
  viewer: Viewer | null,
  accessToken?: string
) => {
  if (row.deletedAt) {
    return false;
  }

  const mediaRefs = await db
    .select({ postId: postMedia.postId })
    .from(postMedia)
    .where(eq(postMedia.assetId, row.id));

  const coverRefs = await db
    .select({ postId: post.id })
    .from(post)
    .where(eq(post.coverAssetId, row.id));

  const postIds = new Set<string>([
    ...(row.postId ? [row.postId] : []),
    ...mediaRefs.map((ref) => ref.postId),
    ...coverRefs.map((ref) => ref.postId),
  ]);

  if (postIds.size > 0) {
    const parents = await db
      .select()
      .from(post)
      .where(inArray(post.id, [...postIds]));

    if (
      await asyncSome(parents, async (parent) =>
        postAllowsViewer(
          parent,
          viewer,
          parent.visibility === "selected"
            ? await loadAudience(db, "post", parent.id)
            : undefined,
          accessToken
        )
      )
    ) {
      return true;
    }

    // 素材已被某个帖子引用，但那个帖子不允许当前访问者看：不再回落到科室规则。
    return false;
  }

  if (!viewer) {
    return false;
  }

  if (viewer.role === "root") {
    return true;
  }

  if (viewer.organizationId !== row.organizationId) {
    return false;
  }

  // 挂在患者档案下的素材服从「谁的患者归谁」：非创建者且非管理员不可读。
  if (row.patientId) {
    const [owner] = await db
      .select({ createdBy: patient.createdBy })
      .from(patient)
      .where(eq(patient.id, row.patientId));

    const isAdmin = viewer.role === "dept_admin";

    if (!isAdmin && owner?.createdBy !== viewer.id) {
      return false;
    }
  }

  // 学习会议资料与科室素材一致：本科室登录用户可读（只读），编辑权另算。

  if (viewer.role === "individual") {
    return row.ownerId === viewer.id;
  }

  return row.visibility === "org" || row.ownerId === viewer.id;
};

const asyncSome = async <T>(
  items: T[],
  predicate: (item: T) => Promise<boolean>
) => {
  for (const item of items) {
    if (await predicate(item)) {
      return true;
    }
  }

  return false;
};

const contentDisposition = (type: "inline" | "attachment", name: string) => {
  const fallback = name
    .replaceAll(/[^\u0020-\u007E]/g, "_")
    .replaceAll('"', "'");

  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

const parseRange = (header: string | null, size: number) => {
  if (!header) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

  if (!match) {
    return "invalid" as const;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start > end ||
    start >= size
  ) {
    return "invalid" as const;
  }

  return { end: Math.min(end, size - 1), start };
};

const sendAsset = async (
  c: Context,
  options: { disposition: "inline" | "attachment" }
) => {
  const id = c.req.param("id");

  if (!id) {
    return c.json({ error: "缺少素材 id" }, 400);
  }

  const [row] = await db.select().from(asset).where(eq(asset.id, id));

  if (!row) {
    return c.json({ error: "素材不存在" }, 404);
  }

  const viewer = await viewerOf(c.req.raw);

  if (!(await canReadAsset(row, viewer, c.req.query("access")))) {
    return c.json({ error: "没有访问该文件的权限" }, 403);
  }

  const [target] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.id, row.storageTargetId));

  if (!target) {
    return c.json({ error: "素材的存储目标已被删除" }, 410);
  }

  const driver: StorageDriver = driverOf(target);
  const info = await driver.stat(row.storageKey);

  if (!info) {
    return c.json({ error: "文件已从存储中移除" }, 410);
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": contentDisposition(
      options.disposition,
      row.originalName
    ),
    "Content-Type": row.mimeType,
    ETag: `"${row.checksum}"`,
  });

  const range = parseRange(c.req.header("range") ?? null, info.size);

  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${info.size}`);

    return new Response(null, { headers, status: 416 });
  }

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${info.size}`
    );

    return new Response(await driver.get(row.storageKey, range), {
      headers,
      status: 206,
    });
  }

  headers.set("Content-Length", String(info.size));

  return new Response(await driver.get(row.storageKey), {
    headers,
    status: 200,
  });
};

export const filesRoute = new Hono()
  .get("/:id", async (c) => await sendAsset(c, { disposition: "inline" }))
  .get(
    "/:id/download",
    async (c) => await sendAsset(c, { disposition: "attachment" })
  )
  .post("/upload", async (c) => {
    const viewer = await viewerOf(c.req.raw);

    if (!viewer) {
      return c.json({ error: "请先登录" }, 401);
    }

    // 没有归属科室的账号不允许上传任何文件（临床资料与科室资料库都需要科室归属）。
    if (viewer.role === "individual") {
      return c.json(
        {
          error: "当前账号没有归属科室，不能上传文件；请联系管理员分配科室",
        },
        403
      );
    }

    const organizationId = await uploadOrganizationId(
      viewer,
      c.req.header("x-org-scope")
    );

    if (!organizationId) {
      return c.json({ error: "当前账号没有可用的工作空间" }, 400);
    }

    const declaredSize = Number(c.req.header("content-length") ?? 0);

    if (declaredSize > env.UPLOAD_MAX_BYTES) {
      return c.json(
        {
          error: `文件超过上限 ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)}MB`,
        },
        413
      );
    }

    const fileName = decodeURIComponent(c.req.header("x-file-name") ?? "");

    if (!fileName) {
      return c.json({ error: "缺少 x-file-name 头" }, 400);
    }

    const body = new Uint8Array(await c.req.arrayBuffer());

    if (body.byteLength === 0) {
      return c.json({ error: "文件内容为空" }, 400);
    }

    if (body.byteLength > env.UPLOAD_MAX_BYTES) {
      return c.json(
        {
          error: `文件超过上限 ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)}MB`,
        },
        413
      );
    }

    const mimeType = c.req.header("content-type") || "application/octet-stream";
    const kind = detectAssetKind(mimeType, fileName);
    const stageParam = c.req.query("stage");
    const visibilityParam = c.req.query("visibility");
    const capturedAtParam = c.req.query("capturedAt");

    const target = await resolveTarget(
      organizationId,
      c.req.query("targetId") || undefined
    );

    const driver = driverOf(target);

    {
      const quota = await checkUploadQuota({
        byteSize: body.byteLength,
        db,
        organizationId,
        storage,
        target,
      });

      if (!quota.ok) {
        return c.json({ error: quota.message }, quota.status);
      }
    }

    const storageKey = buildStorageKey(organizationId, mimeType, fileName);

    await driver.put(storageKey, body);

    const checksum = createHash("sha256").update(body).digest("hex");

    const [created] = await db
      .insert(asset)
      .values({
        admissionId: c.req.query("admissionId") || null,
        byteSize: body.byteLength,
        capturedAt: capturedAtParam ? new Date(capturedAtParam) : new Date(),
        checksum,
        collectionId: c.req.query("collectionId") || null,
        description: c.req.query("description") || null,
        kind,
        mimeType,
        organizationId,
        originalName: fileName,
        ownerId: viewer.id,
        patientId: c.req.query("patientId") || null,
        postId: c.req.query("postId") || null,
        sessionId: c.req.query("sessionId") || null,
        stage:
          stageParam && clinicalStage.includes(stageParam as never)
            ? (stageParam as (typeof clinicalStage)[number])
            : null,
        storageKey,
        storageTargetId: target.id,
        visibility:
          visibilityParam === "private"
            ? ("private" as const)
            : ("org" as const),
      })
      .returning();

    if (!created) {
      return c.json({ error: "保存素材失败" }, 500);
    }

    return c.json({
      admissionId: created.admissionId,
      byteSize: created.byteSize,
      capturedAt: created.capturedAt,
      id: created.id,
      kind: created.kind,
      mimeType: created.mimeType,
      originalName: created.originalName,
      stage: created.stage,
      url: `/api/files/${created.id}`,
      visibility: created.visibility,
    });
  })
  .post("/:id/replace", async (c) => {
    const viewer = await viewerOf(c.req.raw);

    if (!viewer) {
      return c.json({ error: "请先登录" }, 401);
    }

    const [row] = await db
      .select()
      .from(asset)
      .where(eq(asset.id, c.req.param("id")));

    if (!row || row.deletedAt) {
      return c.json({ error: "素材不存在" }, 404);
    }

    const isAdmin = viewer.role === "dept_admin";
    const isOwner = row.ownerId === viewer.id;

    if (viewer.role !== "root" && !isAdmin && !isOwner) {
      return c.json({ error: "只能替换自己上传的素材" }, 403);
    }

    // 患者素材还要求患者归属一致。
    if (row.patientId && viewer.role !== "root" && !isAdmin) {
      const [owner] = await db
        .select({ createdBy: patient.createdBy })
        .from(patient)
        .where(eq(patient.id, row.patientId));

      if (owner?.createdBy !== viewer.id) {
        return c.json({ error: "没有替换该素材的权限" }, 403);
      }
    }

    const declaredSize = Number(c.req.header("content-length") ?? 0);

    if (declaredSize > env.UPLOAD_MAX_BYTES) {
      return c.json(
        {
          error: `文件超过上限 ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)}MB`,
        },
        413
      );
    }

    const fileName = decodeURIComponent(
      c.req.header("x-file-name") ?? row.originalName
    );

    const body = new Uint8Array(await c.req.arrayBuffer());

    if (body.byteLength === 0) {
      return c.json({ error: "文件内容为空" }, 400);
    }

    if (body.byteLength > env.UPLOAD_MAX_BYTES) {
      return c.json(
        {
          error: `文件超过上限 ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)}MB`,
        },
        413
      );
    }

    const mimeType = c.req.header("content-type") || row.mimeType;
    const widthHeader = Number(c.req.header("x-asset-width") ?? 0);
    const heightHeader = Number(c.req.header("x-asset-height") ?? 0);

    const [target] = await db
      .select()
      .from(storageTarget)
      .where(eq(storageTarget.id, row.storageTargetId));

    if (!target) {
      return c.json({ error: "素材的存储目标已被删除" }, 410);
    }

    // 覆盖保存只占用增量空间：按新文件与旧文件的差值检查配额与磁盘余量。
    const deltaBytes = body.byteLength - row.byteSize;

    if (deltaBytes > 0) {
      const quota = await checkUploadQuota({
        byteSize: deltaBytes,
        db,
        organizationId: row.organizationId,
        storage,
        target,
      });

      if (!quota.ok) {
        return c.json({ error: quota.message }, quota.status);
      }
    }

    const driver = driverOf(target);
    const storageKey = buildStorageKey(row.organizationId, mimeType, fileName);

    await driver.put(storageKey, body);

    const checksum = createHash("sha256").update(body).digest("hex");

    const [updated] = await db
      .update(asset)
      .set({
        byteSize: body.byteLength,
        checksum,
        height: heightHeader > 0 ? heightHeader : row.height,
        kind: detectAssetKind(mimeType, fileName),
        mimeType,
        originalName: fileName,
        storageKey,
        width: widthHeader > 0 ? widthHeader : row.width,
      })
      .where(eq(asset.id, row.id))
      .returning();

    if (!updated) {
      return c.json({ error: "保存素材失败" }, 500);
    }

    // 旧文件尽力清理；失败不影响替换结果。
    if (row.storageKey !== storageKey) {
      try {
        await driver.delete(row.storageKey);
      } catch {
        // 保留旧对象最多多占一份空间，不阻塞用户。
      }
    }

    return c.json({
      byteSize: updated.byteSize,
      id: updated.id,
      kind: updated.kind,
      mimeType: updated.mimeType,
      originalName: updated.originalName,
      url: `/api/files/${updated.id}`,
    });
  });

// 兼容部分反向代理/WAF 对 `/replace` 路径的拦截：与 replace 完全相同，
// 只是路径不同；前端优先走这个地址。
filesRoute.post("/:id/overwrite", async (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/\/overwrite$/u, "/replace");

  return await filesRoute.fetch(new Request(url, c.req.raw));
});
