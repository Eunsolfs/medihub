import { execFile } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { asset } from "@medihub/db/schema/content";
import { storageTarget } from "@medihub/db/schema/system";
import { buildStorageKey } from "@medihub/storage";

import { db, storage, storageRoot } from "#src/context.ts";
import { env } from "#src/env.ts";
import { viewerOf } from "#src/lib/session.ts";

const execFileAsync = promisify(execFile);

const cacheDir = path.join(storageRoot, ".office-cache");

const baseUrl = () => env.BETTER_AUTH_URL.replace(/\/+$/, "");

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return difference === 0;
};

const signatureFor = (assetId: string, expiresAt: number) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${assetId}:${expiresAt}`)
    .digest("hex");

const verifySignature = (
  assetId: string,
  expiresAt: number,
  signature: string
) =>
  expiresAt > Date.now() &&
  timingSafeEqual(signatureFor(assetId, expiresAt), signature);

/** OnlyOffice 的 JWT 是标准 HS256，自己签可以少一个依赖。 */
const signJwt = (payload: Record<string, unknown>, secret: string) => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);

  const signature = createHmac("sha256", secret)
    .update(`${head}.${body}`)
    .digest("base64url");

  return `${head}.${body}.${signature}`;
};

const loadAsset = async (id: string) => {
  const [row] = await db.select().from(asset).where(eq(asset.id, id));

  return row;
};

const targetFor = async (storageTargetId: string) => {
  const [row] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.id, storageTargetId));

  return row ?? null;
};

const isOfficeDocument = (mimeType: string, name: string) => {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";

  return (
    mimeType.includes("word") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"].includes(
      extension
    )
  );
};

const readDriverFile = async (
  driver: ReturnType<typeof storage.driverFor>,
  key: string
) => {
  const stream = await driver.get(key);
  const chunks: Uint8Array[] = [];

  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

/** 用 LibreOffice 把 Office 文档转成 PDF，结果按素材 id 缓存。 */
const convertToPdf = async (id: string, sourcePath: string) => {
  const soffice = env.SOFFICE_PATH;

  if (!soffice) {
    return null;
  }

  await mkdir(cacheDir, { recursive: true });

  const targetPath = path.join(cacheDir, `${id}.pdf`);

  try {
    const cached = await readFile(targetPath);

    if (cached.byteLength > 0) {
      return targetPath;
    }
  } catch {
    // 还没有缓存，执行转换。
  }

  const officeDir = path.dirname(sourcePath);

  await execFileAsync(soffice, [
    "--headless",
    "--norestore",
    `--outdir=${officeDir}`,
    sourcePath,
  ]);

  const produced = path.join(
    officeDir,
    `${path.basename(sourcePath).replace(/\.[^.]+$/, "")}.pdf`
  );

  await writeFile(targetPath, await readFile(produced));

  return targetPath;
};

export const officeRoute = new Hono()
  /** 在线预览：能转 PDF 的走 PDF，转不了的交给前端本地渲染。 */
  .get("/:id/pdf", async (c) => {
    const id = c.req.param("id");
    const viewer = await viewerOf(c.req.raw);

    if (!viewer) {
      return c.json({ error: "请先登录" }, 401);
    }

    const row = await loadAsset(id);

    if (!row) {
      return c.json({ error: "素材不存在" }, 404);
    }

    if (
      viewer.role !== "root" &&
      viewer.organizationId !== row.organizationId
    ) {
      return c.json({ error: "没有访问权限" }, 403);
    }

    const target = await targetFor(row.storageTargetId);

    if (!target) {
      return c.json({ error: "存储目标已失效" }, 410);
    }

    const driver = storage.driverFor(target);

    if (!(await driver.stat(row.storageKey))) {
      return c.json({ error: "文件已从存储中移除" }, 410);
    }

    const sourceDir = path.join(cacheDir, "src");
    await mkdir(sourceDir, { recursive: true });

    const sourcePath = path.join(
      sourceDir,
      `${id}-${path.basename(row.storageKey)}`
    );

    await writeFile(sourcePath, await readDriverFile(driver, row.storageKey));

    const pdfPath = await convertToPdf(id, sourcePath);

    if (!pdfPath) {
      return c.json(
        {
          error: "服务器未配置 LibreOffice，无法在线转换为 PDF",
          hint: "安装 LibreOffice 并在 .env 中设置 SOFFICE_PATH",
        },
        501
      );
    }

    const pdf = await readFile(pdfPath);

    return new Response(pdf, {
      headers: {
        "Cache-Control": "private, max-age=600",
        "Content-Length": String(pdf.byteLength),
        "Content-Type": "application/pdf",
      },
    });
  })
  /** 在线编辑：返回 OnlyOffice 需要的编辑器配置；未配置时返回 configured=false。 */
  .get("/:id/config", async (c) => {
    const id = c.req.param("id");
    const viewer = await viewerOf(c.req.raw);

    if (!viewer) {
      return c.json({ error: "请先登录" }, 401);
    }

    const row = await loadAsset(id);

    if (!row) {
      return c.json({ error: "素材不存在" }, 404);
    }

    if (
      viewer.role !== "root" &&
      viewer.organizationId !== row.organizationId
    ) {
      return c.json({ error: "没有访问权限" }, 403);
    }

    if (!(env.ONLYOFFICE_URL && env.ONLYOFFICE_JWT_SECRET)) {
      return c.json({ configured: false });
    }

    if (!isOfficeDocument(row.mimeType, row.originalName)) {
      return c.json({ configured: false });
    }

    const expiresAt = Date.now() + 60 * 60 * 1000;
    const signature = signatureFor(row.id, expiresAt);

    const extension =
      row.originalName.split(".").pop()?.toLowerCase() ?? "docx";

    const fileBase = `${baseUrl()}/api/office/${row.id}`;

    const documentType = ["xls", "xlsx", "ods", "csv"].includes(extension)
      ? "spreadsheet"
      : ["ppt", "pptx", "odp"].includes(extension)
        ? "presentation"
        : "word";

    const config = {
      document: {
        fileType: extension,
        key: `${row.id}-${row.checksum.slice(0, 8)}`,
        title: row.originalName,
        url: `${fileBase}/source?expires=${expiresAt}&signature=${signature}`,
      },
      documentType,
      editorConfig: {
        callbackUrl: `${fileBase}/callback?expires=${expiresAt}&signature=${signature}`,
        lang: "zh-CN",
        mode: "edit",
        user: { id: viewer.id, name: viewer.name },
      },
      height: "100%",
      type: "desktop",
      width: "100%",
    };

    return c.json({
      config,
      configured: true,
      editorUrl: env.ONLYOFFICE_URL,
      token: signJwt(config, env.ONLYOFFICE_JWT_SECRET),
    });
  })
  /** OnlyOffice 内网取文档：用签名代替会话，避免把登录 cookie 交给它。 */
  .get("/:id/source", async (c) => {
    const id = c.req.param("id");
    const expires = Number(c.req.query("expires") ?? 0);
    const signature = c.req.query("signature") ?? "";

    if (!verifySignature(id, expires, signature)) {
      return c.json({ error: "链接已失效" }, 403);
    }

    const row = await loadAsset(id);
    const target = row ? await targetFor(row.storageTargetId) : null;

    if (!(row && target)) {
      return c.json({ error: "素材不存在" }, 404);
    }

    const driver = storage.driverFor(target);
    const info = await driver.stat(row.storageKey);

    if (!info) {
      return c.json({ error: "文件已丢失" }, 410);
    }

    return new Response(await driver.get(row.storageKey), {
      headers: {
        "Content-Length": String(info.size),
        "Content-Type": row.mimeType,
      },
    });
  })
  /** OnlyOffice 保存回调：把编辑后的文件写回存储并更新素材。 */
  .post("/:id/callback", async (c) => {
    const id = c.req.param("id");
    const expires = Number(c.req.query("expires") ?? 0);
    const signature = c.req.query("signature") ?? "";

    if (!verifySignature(id, expires, signature)) {
      return c.json({ error: 1 });
    }

    const row = await loadAsset(id);

    if (!row) {
      return c.json({ error: 1 });
    }

    // OnlyOffice 的回调体是外部输入，先收窄再用。
    const payload = z
      .object({ status: z.number().optional(), url: z.url().optional() })
      .safeParse(await c.req.json());

    if (!payload.success) {
      return c.json({ error: 1 });
    }

    const { status, url } = payload.data;

    // 2 = 编辑完成待保存，6 = 强制保存。
    if (!(url && (status === 2 || status === 6))) {
      return c.json({ error: 0 });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return c.json({ error: 1 });
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    const target = await targetFor(row.storageTargetId);

    if (!target) {
      return c.json({ error: 1 });
    }

    const driver = storage.driverFor(target);

    const key = buildStorageKey(
      row.organizationId,
      row.mimeType,
      row.originalName
    );

    await driver.put(key, buffer);

    await db
      .update(asset)
      .set({
        byteSize: buffer.byteLength,
        checksum: createHash("sha256").update(buffer).digest("hex"),
        storageKey: key,
      })
      .where(eq(asset.id, row.id));

    return c.json({ error: 0 });
  });
