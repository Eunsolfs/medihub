import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { createAuth } from "@medihub/auth";
import { user } from "@medihub/db/schema/auth";
import type { UserRole } from "@medihub/db/schema/auth";
import { asset } from "@medihub/db/schema/content";
import { organization } from "@medihub/db/schema/organization";
import { admission, patient } from "@medihub/db/schema/patients";
import { storageTarget } from "@medihub/db/schema/system";
import { createTestDatabase } from "@medihub/db/testing";
import {
  createStorageDriver,
  decryptConfig,
  encryptConfig,
} from "@medihub/storage";

import type { Context, StorageAccess } from "#src/context.ts";
import { appRouter } from "#src/index.ts";

const { db, remove } = await createTestDatabase();

afterAll(remove);

const SECRET = "test-secret-that-is-at-least-32-characters";
const PASSWORD = "correct-horse-battery";

const storageRoot = await mkdtemp(
  path.join(tmpdir(), "medihub-export-storage-")
);

/** 与 apps/server 同构：真实本地磁盘 + 真实加解密。 */
const storage: StorageAccess = {
  decrypt: <T>(payload: string) => decryptConfig<T>(payload, SECRET),
  driverFor: (target) => createStorageDriver(target, SECRET),
  encrypt: (value) => encryptConfig(value, SECRET),
};

const auth = createAuth({
  baseURL: "http://localhost",
  db,
  secret: SECRET,
});

// 走真实 appRouter：中间件、校验与路由注册都和线上一致。
const createClientFor = (session: Context["session"] = null) =>
  createRouterClient(appRouter, { context: { db, session, storage } });

const createOrganization = async (name: string) => {
  const [row] = await db
    .insert(organization)
    .values({ code: `dept-${crypto.randomUUID().slice(0, 8)}`, name })
    .returning();

  if (!row) {
    throw new Error("无法创建科室");
  }

  return row;
};

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
    id: refreshed.user.id,
  };
};

const createTarget = async (organizationId: string) => {
  const [row] = await db
    .insert(storageTarget)
    .values({
      config: encryptConfig({ rootPath: storageRoot }, SECRET),
      driver: "local",
      isDefault: true,
      name: "导出测试存储",
      organizationId,
    })
    .returning();

  if (!row) {
    throw new Error("无法创建存储目标");
  }

  return row;
};

/** 一次患者就诊 + 两张素材：素材文件真实写进本地存储。 */
const seedPatient = async (organizationId: string, ownerId: string) => {
  const [patientRow] = await db
    .insert(patient)
    .values({
      gender: "female",
      medicalRecordNo: "MR-0001",
      name: "张三",
      organizationId,
      summary: "面部瘢痕",
    })
    .returning();

  if (!patientRow) {
    throw new Error("无法创建患者");
  }

  const [admissionRow] = await db
    .insert(admission)
    .values({
      admissionNo: "AD-0001",
      admittedAt: new Date("2026-01-02T00:00:00.000Z"),
      diagnosis: "面部瘢痕挛缩",
      organizationId,
      patientId: patientRow.id,
    })
    .returning();

  if (!admissionRow) {
    throw new Error("无法创建就诊");
  }

  const target = await createTarget(organizationId);
  const driver = storage.driverFor(target);

  const files = [
    { bytes: "first", name: "术前正面.jpg" },
    { bytes: "second-photo", name: "术后正面.jpg" },
  ];

  for (const [index, file] of files.entries()) {
    const storageKey = `${organizationId}/2026-01/${index + 1}.jpg`;

    await driver.put(storageKey, new TextEncoder().encode(file.bytes));
    await db.insert(asset).values({
      admissionId: admissionRow.id,
      byteSize: file.bytes.length,
      checksum: `checksum-${index}`,
      kind: "image",
      mimeType: "image/jpeg",
      organizationId,
      originalName: file.name,
      ownerId,
      patientId: patientRow.id,
      storageKey,
      storageTargetId: target.id,
    });
  }

  return { admissionId: admissionRow.id, patientId: patientRow.id, target };
};

describe("exports", () => {
  it("创建患者导出：生成 zip、写入默认存储、记录素材数", async () => {
    const department = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", department.id);
    const { patientId } = await seedPatient(department.id, admin.id);

    const job = await admin.client.exports.create({
      includeFiles: true,
      kind: "patient",
      patientId,
    });

    expect(job.status).toBe("ready");
    expect(job.assetCount).toBe(2);
    expect(job.byteSize).toBeGreaterThan(0);
    expect(job.fileName).toMatch(/^patient-.*\.zip$/u);
    expect(job.storageKey).toBe(`${department.id}/exports/${job.id}.zip`);
    expect(job.error).toBeNull();

    const zip = await readFile(path.join(storageRoot, job.storageKey ?? ""));

    const names = [
      "README.md",
      "manifest.json",
      "data.csv",
      "files/术前正面.jpg",
      "files/术后正面.jpg",
    ];

    // zip 的条目名以明文写在头部，转成字符串后能直接读出目录内容。
    const directory = zip.toString("utf-8");

    for (const name of names) {
      expect(directory).toContain(name);
    }
  });

  it("includeFiles=false 时只导出结构化数据", async () => {
    const department = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", department.id);
    const { admissionId } = await seedPatient(department.id, admin.id);

    const job = await admin.client.exports.create({
      admissionId,
      includeFiles: false,
      kind: "admission",
    });

    expect(job.status).toBe("ready");
    expect(job.assetCount).toBe(0);

    const zip = await readFile(path.join(storageRoot, job.storageKey ?? ""));

    const directory = zip.toString("utf-8");

    expect(directory).not.toContain("files/术前正面.jpg");
    expect(directory).toContain("data.csv");
  });

  it("只能导出本组织的患者", async () => {
    const departmentA = await createOrganization("整形外科");
    const departmentB = await createOrganization("口腔科");
    const adminA = await signInAs("dept_admin", departmentA.id);
    const adminB = await signInAs("dept_admin", departmentB.id);
    const { patientId } = await seedPatient(departmentA.id, adminA.id);

    await expect(
      adminB.client.exports.create({
        includeFiles: false,
        kind: "patient",
        patientId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("普通成员只能看到并删除自己创建的导出", async () => {
    const department = await createOrganization("整形外科");
    const admin = await signInAs("dept_admin", department.id);
    const member = await signInAs("member", department.id);
    const { patientId } = await seedPatient(department.id, admin.id);

    const job = await member.client.exports.create({
      includeFiles: false,
      kind: "patient",
      patientId,
    });

    expect(job.requestedBy).toBe(member.id);

    // 科室管理员能看到同科室的导出任务。
    const adminList = await admin.client.exports.list({});

    expect(adminList.items.map((row) => row.id)).toContain(job.id);

    // 另一个普通成员既看不到也删不掉。
    const other = await signInAs("member", department.id);
    const otherList = await other.client.exports.list({});

    expect(otherList.total).toBe(0);
    await expect(
      other.client.exports.get({ id: job.id })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      other.client.exports.remove({ id: job.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await member.client.exports.remove({ id: job.id });
    await expect(
      member.client.exports.get({ id: job.id })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
