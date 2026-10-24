import { ORPCError } from "@orpc/server";
import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@medihub/db";
import { asset } from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";
import { storageDriver, storageTarget } from "@medihub/db/schema/system";
import type { StorageTarget } from "@medihub/db/schema/system";
import type {
  LocalStorageConfig,
  S3StorageConfig,
  StorageConfig,
  StorageDriverKind,
} from "@medihub/storage";

import type { Viewer } from "#src/access.ts";
import type { StorageAccess } from "#src/context.ts";
import { adminProcedure } from "#src/procedures.ts";
import { recordAudit } from "#src/routers/audit.ts";

const scopeValues = z.enum(["global", "organization"] as const);

interface ConfigFields {
  accessKeyId?: string;
  bucket?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  region?: string;
  rootPath?: string;
  secretAccessKey?: string;
}

const configInput = {
  accessKeyId: z.string().trim().max(200).optional(),
  bucket: z.string().trim().max(120).optional(),
  endpoint: z.string().trim().max(300).optional(),
  forcePathStyle: z.boolean().optional(),
  region: z.string().trim().max(80).optional(),
  rootPath: z.string().trim().max(500).optional(),
  secretAccessKey: z.string().trim().max(400).optional(),
};

const requireStorage = (storage: StorageAccess | undefined): StorageAccess => {
  if (!storage) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "服务端未配置存储访问器",
    });
  }

  return storage;
};

/** 只回前 4 后 4：密钥本身和密文都不出网络。 */
const maskAccessKey = (accessKeyId: string) =>
  accessKeyId.length <= 8
    ? "*".repeat(accessKeyId.length)
    : `${accessKeyId.slice(0, 4)}****${accessKeyId.slice(-4)}`;

type TargetSummary =
  | { kind: "local" | "nas"; rootPath: string }
  | {
      accessKeyIdMasked: string;
      bucket: string;
      endpoint?: string;
      kind: "s3";
      region: string;
    };

const summarizeConfig = (
  target: { config: string; driver: StorageDriverKind },
  decrypt: <T>(payload: string) => T
): TargetSummary => {
  if (target.driver === "s3") {
    const config = decrypt<S3StorageConfig>(target.config);

    return {
      accessKeyIdMasked: maskAccessKey(config.accessKeyId),
      bucket: config.bucket,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      kind: "s3",
      region: config.region,
    };
  }

  return {
    kind: target.driver,
    rootPath: decrypt<LocalStorageConfig>(target.config).rootPath,
  };
};

const targetColumns = {
  config: storageTarget.config,
  createdAt: storageTarget.createdAt,
  driver: storageTarget.driver,
  enabled: storageTarget.enabled,
  id: storageTarget.id,
  isDefault: storageTarget.isDefault,
  name: storageTarget.name,
  organizationId: storageTarget.organizationId,
  organizationName: organization.name,
  updatedAt: storageTarget.updatedAt,
};

interface TargetRow {
  config: string;
  createdAt: Date;
  driver: StorageDriverKind;
  enabled: boolean;
  id: string;
  isDefault: boolean;
  name: string;
  organizationId: string | null;
  organizationName: string | null;
  updatedAt: Date;
}

const presentTarget = (row: TargetRow, decrypt: <T>(payload: string) => T) => ({
  createdAt: row.createdAt,
  driver: row.driver,
  enabled: row.enabled,
  id: row.id,
  isDefault: row.isDefault,
  name: row.name,
  organizationId: row.organizationId,
  organizationName: row.organizationName,
  scope: row.organizationId ? ("organization" as const) : ("global" as const),
  summary: summarizeConfig(row, decrypt),
  updatedAt: row.updatedAt,
});

/** 科室级目标只能由本科室管理员管理；全局目标只有 root 能管理。 */
const loadTarget = async (
  db: Database,
  viewer: Viewer,
  id: string
): Promise<StorageTarget> => {
  const [target] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.id, id));

  if (!target) {
    throw new ORPCError("NOT_FOUND", { message: "存储目标不存在" });
  }

  if (
    viewer.role !== "root" &&
    (!target.organizationId || target.organizationId !== viewer.organizationId)
  ) {
    throw new ORPCError("NOT_FOUND", { message: "存储目标不存在" });
  }

  return target;
};

/**
 * 创建时的作用域：scope=organization 落在「当前生效的科室」。
 * root 没有归属科室，因此用顶部科室切换器传来的 `x-org-scope`。
 */
const resolveOrganizationId = (
  viewer: Viewer,
  scope: "global" | "organization",
  scopedOrganizationId?: string
): string | null => {
  if (scope === "global") {
    if (viewer.role !== "root") {
      throw new ORPCError("FORBIDDEN", {
        message: "只有超级管理员可以管理全局存储",
      });
    }

    return null;
  }

  const organizationId = scopedOrganizationId ?? viewer.organizationId;

  if (!organizationId) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message:
        viewer.role === "root"
          ? "请先在顶部选择科室，再创建科室级存储"
          : "当前账号没有归属科室，无法创建科室级存储",
    });
  }

  return organizationId;
};

/** 合并式构造配置：更新时传部分字段，未传的沿用旧值。 */
const buildConfig = (
  driver: StorageDriverKind,
  values: ConfigFields,
  previous?: StorageConfig
): StorageConfig => {
  if (driver === "s3") {
    const base = previous && "bucket" in previous ? previous : undefined;
    const endpoint = values.endpoint ?? base?.endpoint;
    const forcePathStyle = values.forcePathStyle ?? base?.forcePathStyle;

    return {
      accessKeyId: values.accessKeyId ?? base?.accessKeyId ?? "",
      bucket: values.bucket ?? base?.bucket ?? "",
      ...(endpoint ? { endpoint } : {}),
      ...(forcePathStyle === undefined ? {} : { forcePathStyle }),
      region: values.region ?? base?.region ?? "",
      secretAccessKey: values.secretAccessKey ?? base?.secretAccessKey ?? "",
    };
  }

  const base = previous && "rootPath" in previous ? previous : undefined;

  return { rootPath: values.rootPath ?? base?.rootPath ?? "" };
};

const assertConfigComplete = (
  driver: StorageDriverKind,
  config: StorageConfig
) => {
  if (driver === "s3") {
    const values = config as S3StorageConfig;

    if (
      !values.region ||
      !values.bucket ||
      !values.accessKeyId ||
      !values.secretAccessKey
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: "S3 存储需要 region / bucket / accessKeyId / secretAccessKey",
      });
    }

    return;
  }

  if (!(config as LocalStorageConfig).rootPath) {
    throw new ORPCError("BAD_REQUEST", {
      message: "本地存储需要 rootPath（本地磁盘或 NAS 挂载路径）",
    });
  }
};

/** 同一作用域内只能有一个默认目标。 */
const applyDefault = (
  db: Database,
  target: Pick<StorageTarget, "id" | "organizationId">
) => {
  db.transaction((tx) => {
    tx.update(storageTarget)
      .set({ isDefault: false })
      .where(
        target.organizationId
          ? eq(storageTarget.organizationId, target.organizationId)
          : isNull(storageTarget.organizationId)
      )
      .run();

    tx.update(storageTarget)
      .set({ isDefault: true })
      .where(eq(storageTarget.id, target.id))
      .run();
  });
};

const selectTargetRow = (db: Database, id: string) =>
  db
    .select(targetColumns)
    .from(storageTarget)
    .leftJoin(organization, eq(storageTarget.organizationId, organization.id))
    .where(eq(storageTarget.id, id));

export const storageRouter = {
  list: adminProcedure.handler(async ({ context }) => {
    const { viewer } = context;

    if (!viewer) {
      throw new ORPCError("UNAUTHORIZED");
    }

    const storage = requireStorage(context.storage);
    const filters: SQL[] = [];

    if (viewer.role !== "root") {
      if (!viewer.organizationId) {
        return [];
      }

      filters.push(eq(storageTarget.organizationId, viewer.organizationId));
    } else if (context.scopeOrganizationId) {
      // 全局管理员切换科室后，只看「该科室的」与「全站共用」的目标。
      const scoped = or(
        eq(storageTarget.organizationId, context.scopeOrganizationId),
        isNull(storageTarget.organizationId)
      );

      if (scoped) {
        filters.push(scoped);
      }
    }

    const rows = await context.db
      .select(targetColumns)
      .from(storageTarget)
      .leftJoin(organization, eq(storageTarget.organizationId, organization.id))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(storageTarget.createdAt));

    return rows.map((row) => presentTarget(row, storage.decrypt));
  }),

  create: adminProcedure
    .input(
      z.object({
        ...configInput,
        driver: z.enum(storageDriver),
        isDefault: z.boolean().default(false),
        name: z.string().trim().min(1).max(80),
        scope: scopeValues.default("organization"),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const storage = requireStorage(context.storage);

      const organizationId = resolveOrganizationId(
        viewer,
        input.scope,
        context.scopeOrganizationId
      );

      const config = buildConfig(input.driver, input);

      assertConfigComplete(input.driver, config);

      const [created] = await context.db
        .insert(storageTarget)
        .values({
          config: storage.encrypt(config),
          createdBy: viewer.id,
          driver: input.driver,
          name: input.name,
          organizationId,
        })
        .returning({ id: storageTarget.id });

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建存储目标失败",
        });
      }

      if (input.isDefault) {
        applyDefault(context.db, { id: created.id, organizationId });
      }

      await recordAudit(context.db, {
        action: "storage.create",
        actorId: viewer.id,
        detail: { driver: input.driver, name: input.name, scope: input.scope },
        entityId: created.id,
        entityType: "storage_target",
        organizationId,
      });

      const [row] = await selectTargetRow(context.db, created.id);

      if (!row) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "创建存储目标失败",
        });
      }

      return presentTarget(row, storage.decrypt);
    }),

  update: adminProcedure
    .input(
      z.object({
        ...configInput,
        driver: z.enum(storageDriver).optional(),
        enabled: z.boolean().optional(),
        id: z.string().min(1),
        isDefault: z.boolean().optional(),
        name: z.string().trim().min(1).max(80).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const storage = requireStorage(context.storage);
      const target = await loadTarget(context.db, viewer, input.id);
      const driver = input.driver ?? target.driver;
      const previous = storage.decrypt<StorageConfig>(target.config);
      const config = buildConfig(driver, input, previous);

      assertConfigComplete(driver, config);

      await context.db
        .update(storageTarget)
        .set({
          config: storage.encrypt(config),
          driver,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.name === undefined ? {} : { name: input.name }),
        })
        .where(eq(storageTarget.id, target.id));

      if (input.isDefault === true) {
        applyDefault(context.db, target);
      } else if (input.isDefault === false) {
        await context.db
          .update(storageTarget)
          .set({ isDefault: false })
          .where(eq(storageTarget.id, target.id));
      }

      await recordAudit(context.db, {
        action: "storage.update",
        actorId: viewer.id,
        detail: { driver, name: input.name ?? target.name },
        entityId: target.id,
        entityType: "storage_target",
        organizationId: target.organizationId,
      });

      const [row] = await selectTargetRow(context.db, target.id);

      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "存储目标不存在" });
      }

      return presentTarget(row, storage.decrypt);
    }),

  setDefault: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const target = await loadTarget(context.db, viewer, input.id);

      if (!target.enabled) {
        throw new ORPCError("BAD_REQUEST", {
          message: "请先启用该存储目标再设为默认",
        });
      }

      applyDefault(context.db, target);

      await recordAudit(context.db, {
        action: "storage.set_default",
        actorId: viewer.id,
        entityId: target.id,
        entityType: "storage_target",
        organizationId: target.organizationId,
      });

      return { id: target.id, isDefault: true as const };
    }),

  test: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const storage = requireStorage(context.storage);
      const target = await loadTarget(context.db, viewer, input.id);

      try {
        await storage.driverFor(target).test();

        return { message: "连接正常", ok: true };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : "连接失败",
          ok: false,
        };
      }
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const target = await loadTarget(context.db, viewer, input.id);

      const [referenced] = await context.db
        .select({ total: count() })
        .from(asset)
        .where(eq(asset.storageTargetId, target.id));

      if ((referenced?.total ?? 0) > 0) {
        throw new ORPCError("BAD_REQUEST", {
          message: `仍有 ${referenced?.total} 个素材存放在此目标，请先迁移素材`,
        });
      }

      await context.db
        .delete(storageTarget)
        .where(eq(storageTarget.id, target.id));

      await recordAudit(context.db, {
        action: "storage.remove",
        actorId: viewer.id,
        entityId: target.id,
        entityType: "storage_target",
        organizationId: target.organizationId,
      });

      return { id: target.id };
    }),
};
