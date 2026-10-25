import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import { mirrorJob, storageTarget } from "@medihub/db/schema/system";
import type { StorageTarget } from "@medihub/db/schema/system";

import type { StorageAccess } from "#src/context.ts";
import { protectedProcedure } from "#src/procedures.ts";

const requireRoot = (viewer: { role: string } | null) => {
  if (!viewer) {
    throw new ORPCError("UNAUTHORIZED");
  }

  if (viewer.role !== "root") {
    throw new ORPCError("FORBIDDEN", {
      message: "只有超级管理员可以执行镜像备份",
    });
  }
};

const requireStorage = (storage: StorageAccess | undefined): StorageAccess => {
  if (!storage) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "服务端未配置存储访问器",
    });
  }

  return storage;
};

const KEEP_MIRRORS = 2;

interface MirrorManifestFile {
  assetId: string;
  byteSize: number;
  key: string;
  originalStorageKey: string;
  targetId: string;
}

const manifestFiles = async (
  storage: StorageAccess,
  target: StorageTarget,
  manifestKey: string | null
): Promise<MirrorManifestFile[]> => {
  if (!manifestKey) {
    return [];
  }

  try {
    const stream = await storage
      .driverFor({ config: target.config, driver: target.driver })
      .get(manifestKey);

    const parsed = JSON.parse(await new Response(stream).text()) as {
      files?: Partial<MirrorManifestFile>[];
    };

    return (parsed.files ?? []).filter(
      (file): file is MirrorManifestFile =>
        typeof file?.key === "string" &&
        typeof file.originalStorageKey === "string" &&
        typeof file.targetId === "string"
    );
  } catch {
    // 旧镜像没有 files 清单，只能清掉快照与 manifest。
    return [];
  }
};

/** 每个目标只保留最近两份；更早的删除对象并标记 pruned。 */
const pruneOldMirrors = async (
  db: Database,
  storage: StorageAccess,
  target: StorageTarget
) => {
  const ready = await db
    .select()
    .from(mirrorJob)
    .where(
      and(eq(mirrorJob.targetId, target.id), eq(mirrorJob.status, "ready"))
    )
    .orderBy(desc(mirrorJob.createdAt));

  const driver = storage.driverFor({
    config: target.config,
    driver: target.driver,
  });

  for (const job of ready.slice(KEEP_MIRRORS)) {
    const files = await manifestFiles(storage, target, job.manifestKey);

    const keys = [
      job.dbKey,
      job.manifestKey,
      ...files.map((file) => file.key),
    ].filter((key): key is string => Boolean(key));

    for (const key of keys) {
      await driver.delete(key).catch(() => {});
    }

    await db
      .update(mirrorJob)
      .set({ dbKey: null, manifestKey: null, status: "pruned" })
      .where(eq(mirrorJob.id, job.id));
  }
};

const resolveMirrorTarget = async (db: Database, targetId?: string) => {
  const [target] = targetId
    ? await db
        .select()
        .from(storageTarget)
        .where(eq(storageTarget.id, targetId))
    : await db
        .select()
        .from(storageTarget)
        .where(eq(storageTarget.isDefault, true))
        .limit(1);

  if (!target) {
    throw new ORPCError("NOT_FOUND", {
      message: targetId ? "存储目标不存在" : "没有默认存储目标，请先配置",
    });
  }

  return target;
};

const safeName = (name: string) =>
  name.replaceAll(/[\\/:*?"<>|]/gu, "_").slice(-120);

/** 一致性快照：VACUUM INTO 包含 WAL 中已提交的数据。 */
const sqliteSnapshot = async (db: Database) => {
  const dir = await mkdtemp(path.join(tmpdir(), "medihub-mirror-"));
  const file = path.join(dir, "medihub.sqlite");

  try {
    db.$client.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);

    return { bytes: await readFile(file), dir };
  } catch (error) {
    await rm(dir, { force: true, recursive: true });
    throw error;
  }
};

const runMirror = async (input: {
  db: Database;
  includeAssets: boolean;
  jobId: string;
  storage: StorageAccess;
  storagePrefix: string;
  target: StorageTarget;
}) => {
  const driver = input.storage.driverFor({
    config: input.target.config,
    driver: input.target.driver,
  });

  const snapshot = await sqliteSnapshot(input.db);
  let copiedAssets = 0;
  let copiedBytes = snapshot.bytes.byteLength;

  const fileEntries: {
    assetId: string;
    byteSize: number;
    key: string;
    originalStorageKey: string;
    targetId: string;
  }[] = [];

  try {
    const dbKey = `${input.storagePrefix}/medihub.sqlite`;
    await driver.put(dbKey, snapshot.bytes);

    if (input.includeAssets) {
      const rows = await input.db.select().from(asset);
      const sourceCache = new Map<string, StorageTarget>();

      for (const row of rows) {
        if (row.deletedAt) {
          continue;
        }

        let source = sourceCache.get(row.storageTargetId);

        if (!source) {
          const [found] = await input.db
            .select()
            .from(storageTarget)
            .where(eq(storageTarget.id, row.storageTargetId));

          if (!found) {
            continue;
          }

          source = found;
          sourceCache.set(found.id, found);
        }

        try {
          const stream = await input.storage
            .driverFor({ config: source.config, driver: source.driver })
            .get(row.storageKey);

          const buffer = Buffer.from(await new Response(stream).arrayBuffer());

          const fileKey = `${input.storagePrefix}/files/${row.id}-${safeName(row.originalName)}`;

          await driver.put(fileKey, buffer);
          copiedAssets += 1;
          copiedBytes += buffer.byteLength;
          fileEntries.push({
            assetId: row.id,
            byteSize: buffer.byteLength,
            key: fileKey,
            originalStorageKey: row.storageKey,
            targetId: row.storageTargetId,
          });
        } catch {
          // 单个素材缺失不阻塞镜像，manifest 记录实际复制数量。
        }
      }
    }

    const manifest = Buffer.from(
      JSON.stringify(
        {
          assetCount: copiedAssets,
          byteSize: copiedBytes,
          checksum: createHash("sha256").update(snapshot.bytes).digest("hex"),
          createdAt: new Date().toISOString(),
          files: fileEntries,
          includeAssets: input.includeAssets,
          jobId: input.jobId,
          schema: "medihub.mirror/v1",
          snapshot: dbKey,
        },
        null,
        2
      )
    );

    await driver.put(`${input.storagePrefix}/manifest.json`, manifest);

    await input.db
      .update(mirrorJob)
      .set({
        assetCount: copiedAssets,
        byteSize: copiedBytes + manifest.byteLength,
        completedAt: new Date(),
        dbKey,
        manifestKey: `${input.storagePrefix}/manifest.json`,
        status: "ready",
      })
      .where(eq(mirrorJob.id, input.jobId));

    await pruneOldMirrors(input.db, input.storage, input.target);
  } catch (error) {
    await input.db
      .update(mirrorJob)
      .set({
        completedAt: new Date(),
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          1000
        ),
        status: "failed",
      })
      .where(eq(mirrorJob.id, input.jobId));
  } finally {
    await rm(snapshot.dir, { force: true, recursive: true });
  }
};

export const mirrorRouter = {
  status: protectedProcedure.handler(async ({ context }) => {
    requireRoot(context.viewer ?? null);

    const targets = await context.db
      .select({
        driver: storageTarget.driver,
        id: storageTarget.id,
        name: storageTarget.name,
      })
      .from(storageTarget)
      .where(eq(storageTarget.enabled, true));

    const jobs = await context.db
      .select()
      .from(mirrorJob)
      .orderBy(desc(mirrorJob.createdAt))
      .limit(10);

    return { jobs, targets };
  }),

  list: protectedProcedure
    .input(
      z.object({
        page: z.int().positive().default(1),
        pageSize: z.int().positive().max(50).default(20),
      })
    )
    .handler(async ({ context, input }) => {
      requireRoot(context.viewer ?? null);

      const items = await context.db
        .select()
        .from(mirrorJob)
        .orderBy(desc(mirrorJob.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items, page: input.page, pageSize: input.pageSize };
    }),

  run: protectedProcedure
    .input(
      z.object({
        includeAssets: z.boolean().default(false),
        targetId: z.string().min(1).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      requireRoot(context.viewer ?? null);

      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const storage = requireStorage(context.storage);
      const target = await resolveMirrorTarget(context.db, input.targetId);
      const storagePrefix = `mirror/${crypto.randomUUID()}`;

      const [job] = await context.db
        .insert(mirrorJob)
        .values({
          includeAssets: input.includeAssets,
          requestedBy: viewer.id,
          status: "running",
          storagePrefix,
          targetId: target.id,
        })
        .returning();

      if (!job) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建镜像任务失败",
        });
      }

      void runMirror({
        db: context.db,
        includeAssets: input.includeAssets,
        jobId: job.id,
        storage,
        storagePrefix,
        target,
      });

      return job;
    }),

  /**
   * 从指定镜像恢复：全量替换数据库（不是增量），文件写入 .restore/，
   * 服务重启时由启动钩子替换；可选把素材复制回原存储位置。
   */
  restore: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        restoreAssets: z.boolean().default(true),
      })
    )
    .handler(async ({ context, input }) => {
      requireRoot(context.viewer ?? null);

      const storage = requireStorage(context.storage);

      const [job] = await context.db
        .select()
        .from(mirrorJob)
        .where(eq(mirrorJob.id, input.id));

      if (!job || job.status !== "ready" || !job.dbKey) {
        throw new ORPCError("BAD_REQUEST", {
          message: "这份镜像不可恢复（已清理或未完成）",
        });
      }

      const [target] = await context.db
        .select()
        .from(storageTarget)
        .where(eq(storageTarget.id, job.targetId));

      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "镜像的存储目标已删除" });
      }

      const driver = storage.driverFor({
        config: target.config,
        driver: target.driver,
      });

      let assetsRestored = 0;

      if (input.restoreAssets) {
        const files = await manifestFiles(storage, target, job.manifestKey);
        const targetCache = new Map<string, StorageTarget>();

        for (const file of files) {
          let fileTarget = targetCache.get(file.targetId);

          if (!fileTarget) {
            const [found] = await context.db
              .select()
              .from(storageTarget)
              .where(eq(storageTarget.id, file.targetId));

            if (!found) {
              continue;
            }

            fileTarget = found;
            targetCache.set(found.id, found);
          }

          try {
            const stream = await driver.get(file.key);

            const buffer = Buffer.from(
              await new Response(stream).arrayBuffer()
            );

            await storage
              .driverFor({
                config: fileTarget.config,
                driver: fileTarget.driver,
              })
              .put(file.originalStorageKey, buffer);
            assetsRestored += 1;
          } catch {
            // 单个素材恢复失败不阻塞数据库恢复；界面只回报成功数量。
          }
        }
      }

      const restoreDir = path.resolve(".restore");
      await mkdir(restoreDir, { recursive: true });

      const snapshotStream = await driver.get(job.dbKey);

      const snapshotBytes = Buffer.from(
        await new Response(snapshotStream).arrayBuffer()
      );

      const restoreFile = path.join(restoreDir, "medihub.restore.sqlite");

      await writeFile(restoreFile, snapshotBytes);

      const dbPath = path.resolve(context.dbPath ?? "local.db");
      const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");

      await copyFile(dbPath, `${dbPath}.pre-restore-${stamp}`).catch(() => {});

      await writeFile(
        path.join(restoreDir, "pending.json"),
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            dbPath,
            jobId: job.id,
            restoreFile,
          },
          null,
          2
        )
      );

      return { assetsRestored, ok: true, restartRequired: true };
    }),
};
