import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { createAuth } from "@medihub/auth";
import { user } from "@medihub/db/schema/auth";
import type { UserRole } from "@medihub/db/schema/auth";
import { asset } from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";
import { storageTarget } from "@medihub/db/schema/system";
import { createTestDatabase } from "@medihub/db/testing";
import {
  createStorageDriver,
  decryptConfig,
  encryptConfig,
} from "@medihub/storage";

import type { Context, StorageAccess } from "#src/context.ts";
import { appRouter } from "#src/index.ts";
import { planArchiveChunks } from "#src/services/archive.ts";
import type { UpdaterAccess } from "#src/update.ts";

const { db, remove } = await createTestDatabase();

afterAll(remove);

const SECRET = "test-secret-that-is-at-least-32-characters";

const auth = createAuth({ baseURL: "http://localhost", db, secret: SECRET });

/** 与 apps/server 同构：真实本地磁盘 + 真实加解密。 */
const storage: StorageAccess = {
  decrypt: <T>(payload: string) => decryptConfig<T>(payload, SECRET),
  driverFor: (target) => createStorageDriver(target, SECRET),
  encrypt: (value) => encryptConfig(value, SECRET),
};

// 走真实 appRouter：中间件、校验与路由注册都和线上一致。
const createClientFor = (session: Context["session"] = null) =>
  createRouterClient(appRouter, { context: { db, session, storage } });

const PASSWORD = "correct-horse-battery";

/** 建科室（root 才有权创建，测试里直接写库）。 */
const createOrganization = async (name: string) => {
  const [row] = await db
    .insert(organization)
    .values({
      code: `dept-${crypto.randomUUID().slice(0, 8)}`,
      name,
    })
    .returning();

  if (!row) {
    throw new Error("无法创建科室");
  }

  return row;
};

/** 用 Better Auth 注册一个真实会话，再把角色 / 科室改成测试需要的形状。 */
const signInAs = async (role: UserRole, organizationId: string | null) => {
  const email = `${crypto.randomUUID()}@example.com`;

  const { headers } = await auth.api.signUpEmail({
    body: { email, name: `${role} 用户`, password: PASSWORD },
    returnHeaders: true,
  });

  const cookie = headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });

  if (!session) {
    throw new Error("注册后拿不到会话");
  }

  await db
    .update(user)
    .set({ organizationId, role, status: "active" })
    .where(eq(user.id, session.user.id));

  const refreshed = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });

  if (!refreshed) {
    throw new Error("改角色后拿不到会话");
  }

  return {
    client: createClientFor(refreshed),
    cookie,
    email,
    id: refreshed.user.id,
  };
};

describe("users", () => {
  it("科室管理员只能看到本组织成员", async () => {
    const organizationA = await createOrganization("整形外科");
    const organizationB = await createOrganization("口腔科");
    const admin = await signInAs("dept_admin", organizationA.id);
    const outsider = await signInAs("member", organizationB.id);

    await admin.client.users.create({
      email: `member-${crypto.randomUUID()}@example.com`,
      name: "本组织成员",
      password: PASSWORD,
      role: "member",
    });

    const own = await admin.client.users.list({});

    const other = await admin.client.users.list({
      organizationId: organizationB.id,
    });

    expect(own.items.map((row) => row.id)).toContain(admin.id);
    expect(
      own.items.every((row) => row.organizationId === organizationA.id)
    ).toBe(true);
    // 显式查询其它科室时也不能看到任何行。
    expect(other.total).toBe(0);
    expect(own.total).toBeGreaterThanOrEqual(2);
    expect(own.items.some((row) => row.id === outsider.id)).toBe(false);
  });

  it("科室管理员不能创建管理员账号，也不能跨组织建人", async () => {
    const organizationA = await createOrganization("整形外科");
    const organizationB = await createOrganization("口腔科");
    const admin = await signInAs("dept_admin", organizationA.id);

    await expect(
      admin.client.users.create({
        email: `admin-${crypto.randomUUID()}@example.com`,
        name: "想提权",
        password: PASSWORD,
        role: "dept_admin",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      admin.client.users.create({
        email: `cross-${crypto.randomUUID()}@example.com`,
        name: "跨科室",
        organizationId: organizationB.id,
        password: PASSWORD,
        role: "member",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("管理员创建的账号可以用初始密码登录", async () => {
    const organizationA = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", organizationA.id);
    const email = `login-${crypto.randomUUID()}@example.com`;

    await admin.client.users.create({
      email,
      name: "新同事",
      password: "initial-password",
      role: "member",
    });

    const result = await auth.api.signInEmail({
      body: { email, password: "initial-password" },
    });

    expect(result.user.email).toBe(email);
  });

  it("科室管理员改不了别的科室成员，也提不了权", async () => {
    const organizationA = await createOrganization("整形外科");
    const organizationB = await createOrganization("口腔科");
    const admin = await signInAs("dept_admin", organizationA.id);
    const other = await signInAs("member", organizationB.id);

    const own = await admin.client.users.create({
      email: `own-${crypto.randomUUID()}@example.com`,
      name: "本科室成员",
      password: PASSWORD,
      role: "member",
    });

    await expect(
      admin.client.users.update({ id: other.id, name: "改名" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      admin.client.users.update({ id: own.id, role: "dept_admin" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      admin.client.users.update({
        id: own.id,
        organizationId: organizationB.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      admin.client.users.remove({ id: other.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("root 可以跨组织改人，但不能删自己或最后一个 root", async () => {
    const organizationA = await createOrganization("整形外科");
    const root = await signInAs("root", null);
    const member = await signInAs("member", organizationA.id);

    const updated = await root.client.users.update({
      id: member.id,
      organizationId: organizationA.id,
      role: "dept_admin",
    });

    expect(updated?.role).toBe("dept_admin");

    await expect(
      root.client.users.remove({ id: root.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // 只剩一个 root 时不允许把它降级 / 禁用，否则系统再没人能管理系统。
    const roots = await root.client.users.list({ role: "root" });

    expect(roots.total).toBe(1);

    await expect(
      root.client.users.update({ id: root.id, status: "disabled" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("orgs", () => {
  it("只有 root 能管理科室", async () => {
    const organizationA = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", organizationA.id);

    await expect(admin.client.orgs.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("有成员或患者时不能删除科室", async () => {
    const root = await signInAs("root", null);
    const organizationA = await createOrganization("整形外科");
    await signInAs("member", organizationA.id);

    const row = await root.client.orgs.get({ id: organizationA.id });

    expect(row.memberCount).toBe(1);

    await expect(
      root.client.orgs.remove({ id: organizationA.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const empty = await root.client.orgs.create({
      code: `dept-${crypto.randomUUID().slice(0, 8)}`,
      name: "空科室",
    });

    expect(empty.memberCount).toBe(0);
    await root.client.orgs.remove({ id: empty.id });
    await expect(root.client.orgs.get({ id: empty.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("科室短码不能重复", async () => {
    const root = await signInAs("root", null);
    const code = `dept-${crypto.randomUUID().slice(0, 8)}`;

    await root.client.orgs.create({ code, name: "科室一" });

    await expect(
      root.client.orgs.create({ code, name: "科室二" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("audit", () => {
  it("管理员操作会留痕，且按组织隔离", async () => {
    const organizationA = await createOrganization("整形外科");
    const organizationB = await createOrganization("口腔科");
    const adminA = await signInAs("dept_admin", organizationA.id);
    const adminB = await signInAs("dept_admin", organizationB.id);

    await adminA.client.users.create({
      email: `audited-${crypto.randomUUID()}@example.com`,
      name: "被审计的成员",
      password: PASSWORD,
      role: "member",
    });

    const logs = await adminA.client.audit.list({ action: "user.create" });
    const otherLogs = await adminB.client.audit.list({ action: "user.create" });

    expect(logs.total).toBeGreaterThanOrEqual(1);
    expect(
      logs.items.every((row) => row.organizationId === organizationA.id)
    ).toBe(true);
    expect(otherLogs.total).toBe(0);
  });
});

describe("storage", () => {
  it("root 建全局目标：config 加密入库，列表只回掩码摘要", async () => {
    const root = await signInAs("root", null);
    const rootPath = await mkdtemp(path.join(tmpdir(), "medihub-target-"));

    const created = await root.client.storage.create({
      driver: "local",
      isDefault: true,
      name: "全局本地存储",
      rootPath,
      scope: "global",
    });

    expect(created.organizationId).toBeNull();
    expect(created.scope).toBe("global");
    expect(created.isDefault).toBe(true);
    expect(created.summary).toEqual({ kind: "local", rootPath });

    const [row] = await db
      .select({ config: storageTarget.config })
      .from(storageTarget)
      .where(eq(storageTarget.id, created.id));

    expect(row?.config).not.toContain(rootPath);
    expect(row?.config.startsWith("v1:")).toBe(true);

    const list = await root.client.storage.list();
    const serialized = JSON.stringify(list);

    expect(serialized).not.toContain(row?.config ?? "never-matches");
    expect(serialized).not.toContain(SECRET);
  });

  it("科室管理员只能建本组织目标，且同一作用域只有一个默认", async () => {
    const department = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", department.id);
    const rootPath = await mkdtemp(path.join(tmpdir(), "medihub-target-"));

    await expect(
      admin.client.storage.create({
        driver: "local",
        name: "想做全局",
        rootPath,
        scope: "global",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await admin.client.storage.create({
      driver: "local",
      isDefault: true,
      name: "科室存储 A",
      rootPath,
      scope: "organization",
    });

    const second = await admin.client.storage.create({
      driver: "local",
      name: "科室存储 B",
      rootPath,
      scope: "organization",
    });

    expect(first.organizationId).toBe(department.id);
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    await admin.client.storage.setDefault({ id: second.id });

    const list = await admin.client.storage.list();
    const defaults = list.filter((row) => row.isDefault);

    expect(defaults.map((row) => row.id)).toEqual([second.id]);

    const tested = await admin.client.storage.test({ id: second.id });

    expect(tested.ok).toBe(true);
  });

  it("被素材引用时不能删除存储目标", async () => {
    const department = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", department.id);
    const rootPath = await mkdtemp(path.join(tmpdir(), "medihub-target-"));

    const target = await admin.client.storage.create({
      driver: "local",
      isDefault: true,
      name: "科室存储",
      rootPath,
      scope: "organization",
    });

    await db.insert(asset).values({
      byteSize: 3,
      checksum: crypto.randomUUID(),
      kind: "image",
      mimeType: "image/jpeg",
      organizationId: department.id,
      originalName: "占用.jpg",
      ownerId: admin.id,
      storageKey: `${department.id}/2026-01/1.jpg`,
      storageTargetId: target.id,
    });

    await expect(
      admin.client.storage.remove({ id: target.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

const withUpdater = (
  updater: UpdaterAccess | undefined,
  session: Context["session"] = null,
  version = "1.0.0"
) =>
  createRouterClient(appRouter, {
    context: {
      db,
      session,
      storage,
      updater,
      version,
    },
  });

const fakeUpdater = (
  options: {
    canRollback?: boolean;
    phase?: "idle" | "succeeded" | "failed";
  } = {}
): UpdaterAccess => ({
  canRollback: async () => {
    await Promise.resolve();

    return options.canRollback ?? false;
  },
  checkLatest: async () => {
    await Promise.resolve();

    return {
      latestVersion: "9.9.9",
      url: "https://example.com/release",
    };
  },
  rollback: async () => {
    await Promise.resolve();

    return {
      mode: "rollback" as const,
      phase: "running" as const,
      startedAt: Date.now(),
    };
  },
  start: async (targetVersion) => {
    await Promise.resolve();

    return {
      mode: "upgrade" as const,
      phase: "running" as const,
      startedAt: Date.now(),
      targetVersion,
    };
  },
  state: async () => {
    await Promise.resolve();

    return { phase: options.phase ?? "idle" };
  },
});

const sessionOf = async (cookie: string) =>
  await auth.api.getSession({ headers: new Headers({ cookie }) });

describe("system.update", () => {
  it("只有 root 能查看升级状态", async () => {
    const root = await signInAs("root", null);
    const department = await createOrganization("升级测试科室");
    const admin = await signInAs("dept_admin", department.id);
    const anonymous = withUpdater(fakeUpdater());

    const status = await withUpdater(
      fakeUpdater(),
      await sessionOf(root.cookie)
    ).system.updateStatus();

    expect(status.enabled).toBe(true);
    expect(status.currentVersion).toBe("1.0.0");
    expect(status.latest.latestVersion).toBe("9.9.9");

    await expect(admin.client.system.updateStatus()).rejects.toThrow();
    await expect(anonymous.system.updateStatus()).rejects.toThrow();
  });

  it("未配置升级时状态显示 enabled=false", async () => {
    const root = await signInAs("root", null);

    const status = await withUpdater(
      undefined,
      await sessionOf(root.cookie)
    ).system.updateStatus();

    expect(status.enabled).toBe(false);
    expect(status.canRollback).toBe(false);
  });

  it("root 可以发起升级与回滚，非 root 被拒绝", async () => {
    const root = await signInAs("root", null);
    const department = await createOrganization("升级操作科室");
    const admin = await signInAs("dept_admin", department.id);

    const client = withUpdater(
      fakeUpdater({ canRollback: true }),
      await sessionOf(root.cookie)
    );

    await expect(
      client.system.startUpdate({ targetVersion: "1.1.0" })
    ).resolves.toMatchObject({ phase: "running", targetVersion: "1.1.0" });

    await expect(client.system.rollbackUpdate()).resolves.toMatchObject({
      phase: "running",
    });

    await expect(
      admin.client.system.startUpdate({ targetVersion: "1.1.0" })
    ).rejects.toThrow();
    await expect(admin.client.system.rollbackUpdate()).rejects.toThrow();
  });

  it("拒绝升级到当前版本，且没有备份时不能回滚", async () => {
    const root = await signInAs("root", null);
    const client = withUpdater(fakeUpdater(), await sessionOf(root.cookie));

    await expect(
      client.system.startUpdate({ targetVersion: "1.0.0" })
    ).rejects.toThrow();
    await expect(client.system.rollbackUpdate()).rejects.toThrow();
  });

  it("未注入 updater 时启动与回滚都被拒绝", async () => {
    const root = await signInAs("root", null);
    const client = withUpdater(undefined, await sessionOf(root.cookie));

    await expect(
      client.system.startUpdate({ targetVersion: "1.1.0" })
    ).rejects.toThrow();
    await expect(client.system.rollbackUpdate()).rejects.toThrow();
  });
});

describe("storage quota & archive chunk planning", () => {
  it("科室与全站配额可设置，usage 返回已用与磁盘信息", async () => {
    const department = await createOrganization("配额科室");
    const admin = await signInAs("dept_admin", department.id);

    const target = await admin.client.storage.create({
      driver: "local",
      isDefault: true,
      name: "配额存储",
      rootPath: await mkdtemp(path.join(tmpdir(), "medihub-quota-")),
      scope: "organization",
    });

    await db.insert(asset).values({
      byteSize: 3 * 1024 * 1024,
      checksum: crypto.randomUUID(),
      kind: "image",
      mimeType: "image/jpeg",
      organizationId: department.id,
      originalName: "占用.jpg",
      ownerId: admin.id,
      storageKey: `${department.id}/2026-10/1.jpg`,
      storageTargetId: target.id,
    });

    await admin.client.storage.setQuota({
      organizationId: department.id,
      quotaBytes: 10 * 1024 * 1024,
    });

    const usage = await admin.client.storage.usage();

    expect(usage.organizations[0]?.usedBytes).toBe(3 * 1024 * 1024);
    expect(usage.organizations[0]?.quotaBytes).toBe(10 * 1024 * 1024);
    expect(usage.disks.some((disk) => disk.targetId === target.id)).toBe(true);
  });

  it("科室管理员不能设置全站配额", async () => {
    const department = await createOrganization("配额科室2");
    const admin = await signInAs("dept_admin", department.id);

    await expect(
      admin.client.storage.setQuota({ quotaBytes: 1024 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("归档分片按素材边界累积，大文件独占一片", () => {
    const sizes = [300, 300, 300, 2000, 100];

    // chunk 上限 1000：前三个一组，2000 独占，最后 100 一组。
    expect(
      planArchiveChunks(
        sizes.map((byteSize) => ({ byteSize })),
        1000
      )
    ).toEqual([900, 2000, 100]);
  });
});

describe("archive job", () => {
  it("把素材打包成分片并标记为已归档", async () => {
    const department = await createOrganization("归档科室");
    const admin = await signInAs("dept_admin", department.id);
    const rootPath = await mkdtemp(path.join(tmpdir(), "medihub-archive-"));

    await admin.client.storage.create({
      driver: "local",
      isDefault: true,
      name: "归档存储",
      rootPath,
      scope: "organization",
    });

    const [target] = await db
      .select()
      .from(storageTarget)
      .where(eq(storageTarget.organizationId, department.id))
      .limit(1);

    if (!target) {
      throw new Error("缺少存储目标");
    }

    const assetId = crypto.randomUUID();
    const storageKey = `${department.id}/old-1.jpg`;
    await mkdir(path.join(rootPath, department.id), { recursive: true });
    await writeFile(
      path.join(rootPath, storageKey),
      Buffer.from("fake-jpeg-bytes")
    );

    await db.insert(asset).values({
      byteSize: 15,
      checksum: crypto.randomUUID(),
      id: assetId,
      kind: "image",
      mimeType: "image/jpeg",
      organizationId: department.id,
      originalName: "旧素材.jpg",
      ownerId: admin.id,
      storageKey,
      storageTargetId: target.id,
    });

    const job = await admin.client.archive.create({
      beforeAt: new Date(Date.now() + 60_000),
      chunkBytes: 64 * 1024 * 1024,
      deleteSource: false,
      organizationId: department.id,
    });

    expect(job.status).toBe("running");

    let detail = await admin.client.archive.get({ id: job.id });

    for (
      let attempt = 0;
      attempt < 60 && detail.status === "running";
      attempt += 1
    ) {
      await delay(100);
      detail = await admin.client.archive.get({ id: job.id });
    }

    expect(detail.status, detail.error ?? "").toBe("ready");
    expect(detail.chunkCount).toBe(1);
    expect(detail.assetCount).toBe(1);

    const [archived] = await db
      .select({ archiveId: asset.archiveId, archivedAt: asset.archivedAt })
      .from(asset)
      .where(eq(asset.id, assetId));

    expect(archived?.archiveId).toBe(job.id);
    expect(archived?.archivedAt).toBeInstanceOf(Date);

    const chunkPath = path.join(
      rootPath,
      detail.chunks[0]?.key ?? "missing.zip"
    );

    const stats = await stat(chunkPath).catch(() => null);

    expect(stats?.size).toBeGreaterThan(0);
  });
});

describe("mirror backup", () => {
  it("root 可把数据库快照镜像到存储目标", async () => {
    const root = await signInAs("root", null);
    const rootPath = await mkdtemp(path.join(tmpdir(), "medihub-mirror-"));

    await root.client.storage.create({
      driver: "local",
      isDefault: true,
      name: "镜像目标",
      rootPath,
      scope: "global",
    });

    const job = await root.client.mirror.run({ includeAssets: false });

    expect(job.status).toBe("running");

    let list = await root.client.mirror.list({});

    for (
      let attempt = 0;
      attempt < 60 && list.items[0]?.status === "running";
      attempt += 1
    ) {
      await delay(100);
      list = await root.client.mirror.list({});
    }

    const ready = list.items.find((item) => item.id === job.id);

    expect(ready?.status).toBe("ready");
    expect(ready?.byteSize ?? 0).toBeGreaterThan(0);
  });

  it("科室管理员不能执行镜像备份", async () => {
    const department = await createOrganization("镜像科室");
    const admin = await signInAs("dept_admin", department.id);

    await expect(admin.client.mirror.run({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
