import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { user } from "@medihub/db/schema/auth";
import { asset } from "@medihub/db/schema/content";
import { patient } from "@medihub/db/schema/patients";

import {
  clientForEmail,
  createClient,
  signUp,
  signUpAccount,
  testDb,
} from "../support/api.ts";

/**
 * 临床数据的组织隔离与权限。验收标准来自产品要求：
 * 「跨科室访问一律视为不存在」「只有管理员或创建者可以删除」。
 */
describe("患者与就诊", () => {
  it("创建后能在自己的科室里看到，跨科室看不到", async () => {
    const doctor = await signUp();
    const other = await signUp();

    const created = await doctor.patients.create({
      gender: "female",
      medicalRecordNo: "MRN-T-001",
      name: "测试患者",
      status: "active",
      summary: "瘢痕修复",
      tags: ["瘢痕"],
    });

    const list = await doctor.patients.list({ page: 1, pageSize: 20 });
    expect(list.total).toBe(1);
    expect(list.items[0]?.id).toBe(created.id);

    const otherList = await other.patients.list({ page: 1, pageSize: 20 });
    expect(otherList.total).toBe(0);

    await expect(other.patients.get({ id: created.id })).rejects.toThrow();
  });

  it("就诊记录按入院时间倒序返回", async () => {
    const doctor = await signUp();
    const created = await doctor.patients.create({ name: "时间线患者" });

    await doctor.admissions.create({
      admittedAt: new Date("2026-01-05"),
      diagnosis: "第一次入院",
      patientId: created.id,
    });
    await doctor.admissions.create({
      admittedAt: new Date("2026-03-05"),
      diagnosis: "第二次入院",
      patientId: created.id,
    });

    const detail = await doctor.patients.get({ id: created.id });
    expect(detail.admissions.map((row) => row.diagnosis)).toEqual([
      "第二次入院",
      "第一次入院",
    ]);
    expect(detail.admissions[0]?.assetCount).toBe(0);
  });

  it("同科室成员不能删除别人创建的患者", async () => {
    const owner = await signUp();
    const colleague = await signUp();
    const profile = await owner.me.profile();

    if (!profile?.viewer.organizationId) {
      throw new Error("缺少组织");
    }

    const colleagueProfile = await colleague.me.profile();

    if (!colleagueProfile) {
      throw new Error("缺少新用户");
    }

    // 把第二个账号放进同一个科室，模拟真实的同事关系。
    await testDb
      .update(user)
      .set({
        organizationId: profile.viewer.organizationId,
        role: "member",
      })
      .where(eq(user.id, colleagueProfile.viewer.id));

    const created = await owner.patients.create({ name: "同事患者" });

    await expect(
      colleague.patients.remove({ id: created.id })
    ).rejects.toThrow();
    await expect(owner.patients.remove({ id: created.id })).resolves.toEqual({
      id: created.id,
    });
  });

  it("同科室成员看不到别人建档的患者，管理员可以看到", async () => {
    const ownerAccount = await signUpAccount();
    const colleagueAccount = await signUpAccount();
    const owner = ownerAccount.client;
    const profile = await owner.me.profile();
    const colleagueProfile = await colleagueAccount.client.me.profile();

    if (!(profile?.viewer.organizationId && colleagueProfile)) {
      throw new Error("缺少组织");
    }

    await testDb
      .update(user)
      .set({
        organizationId: profile.viewer.organizationId,
        role: "member",
      })
      .where(eq(user.id, colleagueProfile.viewer.id));

    const created = await owner.patients.create({ name: "小王建档患者" });

    // 同事看不到，也打不开（重新登录以拿到更新后的角色与科室）。
    const colleague = await clientForEmail(colleagueAccount.email);

    const colleagueList = await colleague.patients.list({
      page: 1,
      pageSize: 20,
    });

    expect(colleagueList.total).toBe(0);
    await expect(colleague.patients.get({ id: created.id })).rejects.toThrow();

    // 同一个人升成科室管理员后可见（需要重新登录，客户端会缓存会话里的角色）。
    await testDb
      .update(user)
      .set({ role: "dept_admin" })
      .where(eq(user.id, colleagueProfile.viewer.id));

    const colleagueAdmin = await clientForEmail(colleagueAccount.email);

    const adminList = await colleagueAdmin.patients.list({
      page: 1,
      pageSize: 20,
    });

    expect(adminList.total).toBe(1);
    await expect(
      colleagueAdmin.patients.get({ id: created.id })
    ).resolves.toBeTruthy();
  });

  it("科室管理员可以把未分配科室的注册用户认领进科室", async () => {
    const adminAccount = await signUpAccount();
    const candidateAccount = await signUpAccount();
    const adminProfile = await adminAccount.client.me.profile();
    const candidateProfile = await candidateAccount.client.me.profile();

    if (!(adminProfile?.viewer.organizationId && candidateProfile)) {
      throw new Error("缺少组织");
    }

    await testDb
      .update(user)
      .set({
        organizationId: adminProfile.viewer.organizationId,
        role: "dept_admin",
      })
      .where(eq(user.id, adminProfile.viewer.id));

    const admin = await clientForEmail(adminAccount.email);

    const pending = await admin.users.candidates({ page: 1, pageSize: 20 });
    expect(
      pending.items.some((row) => row.id === candidateProfile.viewer.id)
    ).toBe(true);

    const claimed = await admin.users.claim({
      userId: candidateProfile.viewer.id,
    });

    expect(claimed?.role).toBe("member");
    expect(claimed?.organizationId).toBe(adminProfile.viewer.organizationId);

    const after = await admin.users.candidates({ page: 1, pageSize: 20 });
    expect(
      after.items.some((row) => row.id === candidateProfile.viewer.id)
    ).toBe(false);
  });
});

describe("素材", () => {
  it("软删除后不再出现在列表里", async () => {
    const doctor = await signUp();
    const profile = await doctor.me.profile();

    if (!profile?.viewer.organizationId) {
      throw new Error("缺少组织");
    }

    const created = await doctor.patients.create({ name: "素材患者" });

    const visit = await doctor.admissions.create({
      admittedAt: new Date("2026-02-01"),
      patientId: created.id,
    });

    const [row] = await testDb
      .insert(asset)
      .values({
        admissionId: visit.id,
        byteSize: 1024,
        checksum: "checksum",
        kind: "image",
        mimeType: "image/png",
        organizationId: profile.viewer.organizationId,
        originalName: "before.png",
        ownerId: profile.viewer.id,
        patientId: created.id,
        stage: "preop",
        storageKey: "test/before.png",
        storageTargetId: "target",
      })
      .returning();

    if (!row) {
      throw new Error("插入素材失败");
    }

    const before = await doctor.assets.list({
      admissionId: visit.id,
      page: 1,
      pageSize: 20,
    });

    expect(before.total).toBe(1);

    const removed = await doctor.assets.remove({ ids: [row.id] });
    expect(removed.deleted).toBe(1);

    const after = await doctor.assets.list({
      admissionId: visit.id,
      page: 1,
      pageSize: 20,
    });

    expect(after.total).toBe(0);
  });
});

describe("匿名访问", () => {
  it("未登录不能读取科室数据", async () => {
    const anonymous = createClient(null);

    await expect(
      anonymous.patients.list({ page: 1, pageSize: 20 })
    ).rejects.toThrow();
  });

  it("公开帖子接口不需要登录", async () => {
    const author = await signUp();

    const created = await author.posts.create({
      content: "# 标题",
      title: "公开教学帖",
      visibility: "public",
    });

    await author.posts.publish({ id: created.id, published: true });

    const anonymous = createClient(null);
    const found = await anonymous.posts.bySlug({ slug: created.slug });
    expect(found.post.title).toBe("公开教学帖");
    expect(found.post.viewCount).toBe(1);
  });
});

describe("帖子与学习会议的归属", () => {
  it("同科室成员只能看到并编辑自己撰写的帖子", async () => {
    const authorAccount = await signUpAccount();
    const otherAccount = await signUpAccount();
    const authorProfile = await authorAccount.client.me.profile();
    const otherProfile = await otherAccount.client.me.profile();

    if (!(authorProfile?.viewer.organizationId && otherProfile)) {
      throw new Error("缺少组织");
    }

    await testDb
      .update(user)
      .set({
        organizationId: authorProfile.viewer.organizationId,
        role: "member",
      })
      .where(eq(user.id, otherProfile.viewer.id));

    const created = await authorAccount.client.posts.create({
      content: "# 归属测试",
      title: "同事写的文章",
      visibility: "org",
    });

    const other = await clientForEmail(otherAccount.email);
    const otherList = await other.posts.list({ page: 1, pageSize: 20 });
    expect(otherList.total).toBe(0);
    await expect(other.posts.get({ id: created.id })).rejects.toThrow();
    await expect(
      other.posts.update({ id: created.id, title: "改标题" })
    ).rejects.toThrow();

    // 管理员（科室管理员）可以看到并编辑。
    await testDb
      .update(user)
      .set({ role: "dept_admin" })
      .where(eq(user.id, otherProfile.viewer.id));

    const otherAdmin = await clientForEmail(otherAccount.email);
    const adminList = await otherAdmin.posts.list({ page: 1, pageSize: 20 });
    expect(adminList.total).toBe(1);
    await expect(
      otherAdmin.posts.update({ id: created.id, title: "管理员改的标题" })
    ).resolves.toBeTruthy();
  });

  it("同科室成员只能看到自己创建的学习会议", async () => {
    const authorAccount = await signUpAccount();
    const otherAccount = await signUpAccount();
    const authorProfile = await authorAccount.client.me.profile();
    const otherProfile = await otherAccount.client.me.profile();

    if (!(authorProfile?.viewer.organizationId && otherProfile)) {
      throw new Error("缺少组织");
    }

    await testDb
      .update(user)
      .set({
        organizationId: authorProfile.viewer.organizationId,
        role: "member",
      })
      .where(eq(user.id, otherProfile.viewer.id));

    const created = await authorAccount.client.learning.create({
      heldAt: new Date("2026-10-01"),
      title: "同事创建的会议",
    });

    const other = await clientForEmail(otherAccount.email);
    const otherList = await other.learning.list({ page: 1, pageSize: 20 });
    expect(otherList.total).toBe(0);
    await expect(other.learning.get({ id: created.id })).rejects.toThrow();

    await testDb
      .update(user)
      .set({ role: "dept_admin" })
      .where(eq(user.id, otherProfile.viewer.id));

    const otherAdmin = await clientForEmail(otherAccount.email);

    const adminList = await otherAdmin.learning.list({
      page: 1,
      pageSize: 20,
    });

    expect(adminList.total).toBe(1);
  });
});

describe("数据库约束", () => {
  it("就诊出院时间早于入院时间会被拒绝", async () => {
    const doctor = await signUp();
    const created = await doctor.patients.create({ name: "约束患者" });

    await expect(
      doctor.admissions.create({
        admittedAt: new Date("2026-05-10"),
        dischargedAt: new Date("2026-05-01"),
        patientId: created.id,
      })
    ).rejects.toThrow();
  });
});

void patient;
