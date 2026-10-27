import { eq } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import { user } from "@medihub/db/schema/auth";
import { asset } from "@medihub/db/schema/content";
import { patient } from "@medihub/db/schema/patients";

import {
  clientForEmail,
  signUpDepartment,
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
    const department = await signUpDepartment();
    const doctor = department.client;
    const otherDepartment = await signUpDepartment();
    const other = otherDepartment.client;

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
    const department = await signUpDepartment();
    const doctor = department.client;
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
    const department = await signUpDepartment();
    const owner = department.client;
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
    const ownerAccount = await signUpDepartment();
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
    const department = await signUpDepartment();
    const doctor = department.client;
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
    const department = await signUpDepartment();
    const author = department.client;

    const created = await author.posts.create({
      content: "# 标题",
      title: "公开教学帖",
      visibility: "public",
    });

    await author.posts.publish({ id: created.id, published: true });

    const anonymous = createClient(null);
    const found = await anonymous.posts.bySlug({ slug: created.slug });

    expect(found.gated).toBe(false);

    if (found.gated) {
      throw new Error("公开帖不应被门禁拦下");
    }

    expect(found.post.title).toBe("公开教学帖");
    expect(found.post.viewCount).toBe(1);
  });

  it("可见范围严格生效：仅科室内部需要同科室登录，仅登录用户跨科室也可读", async () => {
    const authorAccount = await signUpAccount();
    const outsiderAccount = await signUpAccount();
    const outsider = outsiderAccount.client;
    const authorProfile = await authorAccount.client.me.profile();

    if (!authorProfile) {
      throw new Error("缺少组织");
    }

    // 「全系统登录用户」是管理员的发布档位，先把作者提到科室管理员。
    await testDb
      .update(user)
      .set({ role: "dept_admin" })
      .where(eq(user.id, authorProfile.viewer.id));

    const author = await clientForEmail(authorAccount.email);

    const orgPost = await author.posts.create({
      content: "# 科室内部内容",
      title: "仅科室内部",
      visibility: "org",
    });

    const loginPost = await author.posts.create({
      content: "# 任意登录用户可见",
      title: "任意登录用户",
      visibility: "logged_in",
    });

    const privatePost = await author.posts.create({
      content: "# 仅作者",
      title: "仅作者可见",
      visibility: "private",
    });

    for (const item of [orgPost, loginPost, privatePost]) {
      await author.posts.publish({
        id: item.id,
        published: true,
      });
    }

    const anonymous = createClient(null);

    // 未登录：三种范围都被拦下，且拿不到正文。
    const anonymousOrg = await anonymous.posts.bySlug({ slug: orgPost.slug });
    expect(anonymousOrg.gated).toBe(true);
    expect(anonymousOrg.reason).toBe("login");

    const anonymousLogin = await anonymous.posts.bySlug({
      slug: loginPost.slug,
    });

    expect(anonymousLogin.gated).toBe(true);

    // 另一个科室的登录用户：只会看到「任意登录用户」的那篇。
    const outsiderLogin = await outsider.posts.bySlug({ slug: loginPost.slug });
    expect(outsiderLogin.gated).toBe(false);

    const outsiderOrg = await outsider.posts.bySlug({ slug: orgPost.slug });
    expect(outsiderOrg.gated).toBe(true);
    expect(outsiderOrg.reason).toBe("organization");

    const outsiderPrivate = await outsider.posts.bySlug({
      slug: privatePost.slug,
    });

    expect(outsiderPrivate.gated).toBe(true);
    expect(outsiderPrivate.reason).toBe("owner");

    // 作者本人三种都能读。
    for (const item of [orgPost, loginPost, privatePost]) {
      const own = await author.posts.bySlug({ slug: item.slug });
      expect(own.gated).toBe(false);
    }
  });
});

describe("帖子与学习会议的归属", () => {
  it("同科室成员能看到同事的帖子但不能编辑", async () => {
    const authorAccount = await signUpDepartment("member");
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

    // 同事能读到（本科室范围），但编辑被拒绝。
    const other = await clientForEmail(otherAccount.email);
    const otherList = await other.posts.list({ page: 1, pageSize: 20 });
    expect(otherList.total).toBe(1);
    await expect(other.posts.get({ id: created.id })).resolves.toMatchObject({
      canEdit: false,
    });
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

  it("公开帖可以设置访问密码，密码错误拿不到正文", async () => {
    const department = await signUpDepartment();
    const author = department.client;

    const created = await author.posts.create({
      accessPassword: "intern-2026",
      content: "# 科室制度\n\n仅供实习同学阅读。",
      title: "实习生制度",
      visibility: "public",
    });

    await author.posts.publish({ id: created.id, published: true });

    const anonymous = createClient(null);
    const locked = await anonymous.posts.bySlug({ slug: created.slug });
    expect(locked.gated).toBe(true);
    expect(locked.summary).toBeDefined();

    if (locked.gated) {
      expect(locked.reason).toBe("password");
    }

    const wrong = await anonymous.posts.bySlug({
      password: "wrong-password",
      slug: created.slug,
    });

    expect(wrong.gated).toBe(true);

    const unlocked = await anonymous.posts.bySlug({
      password: "intern-2026",
      slug: created.slug,
    });

    expect(unlocked.gated).toBe(false);

    if (!unlocked.gated) {
      expect(unlocked.post.title).toBe("实习生制度");
      expect(unlocked.accessToken).toBeTruthy();
    }
  });

  it("成员不能设置指定对象或全系统可见范围", async () => {
    const department = await signUpDepartment("member");
    const author = department.client;
    const profile = await author.me.profile();

    if (!profile?.viewer.organizationId) {
      throw new Error("缺少组织");
    }

    await expect(
      author.posts.create({
        content: "",
        title: "越权指定对象",
        visibility: "selected",
        audienceOrganizations: [profile.viewer.organizationId],
      })
    ).rejects.toThrow();

    await expect(
      author.posts.create({
        content: "",
        title: "越权全系统",
        visibility: "logged_in",
      })
    ).rejects.toThrow();
  });

  it("同科室成员能看到同事创建的学习会议但不能编辑", async () => {
    const authorAccount = await signUpDepartment("member");
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
    expect(otherList.total).toBe(1);
    expect(otherList.items[0]?.canEdit).toBe(false);
    await expect(other.learning.get({ id: created.id })).resolves.toMatchObject(
      {
        canEdit: false,
      }
    );
    await expect(
      other.learning.update({ id: created.id, title: "同事改的会议" })
    ).rejects.toThrow();

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
    await expect(
      otherAdmin.learning.update({ id: created.id, title: "管理员改的会议" })
    ).resolves.toBeTruthy();
  });
});

it("一次学习会议可以包含多门课程", async () => {
  const author = await signUpDepartment("dept_admin");

  const created = await author.client.learning.create({
    courses: [
      {
        speaker: "张三",
        startsAt: "2026-10-01T14:00:00+08:00",
        title: "创面负压治疗",
      },
      { speaker: "李四", title: "皮瓣选择" },
    ],
    heldAt: new Date("2026-10-01"),
    title: "十月业务学习",
  });

  expect(created.courses).toHaveLength(2);

  const detail = await author.client.learning.get({ id: created.id });

  expect(detail.courses.map((course) => course.title)).toEqual([
    "创面负压治疗",
    "皮瓣选择",
  ]);

  const updated = await author.client.learning.update({
    courses: [{ title: "只保留一门" }],
    id: created.id,
  });

  expect(updated.courses).toHaveLength(1);
  expect(updated.courses[0]?.title).toBe("只保留一门");
});

it("批量修改状态、统计与删除患者", async () => {
  const admin = await signUpDepartment("dept_admin");

  const first = await admin.client.patients.create({ name: "批量患者 A" });
  const second = await admin.client.patients.create({ name: "批量患者 B" });

  const updated = await admin.client.patients.bulkStatus({
    ids: [first.id, second.id],
    status: "follow_up",
  });

  expect(updated.updated).toBe(2);

  const summary = await admin.client.patients.batchSummary({
    ids: [first.id, second.id],
  });

  expect(summary.totals.patientCount).toBe(2);
  expect(summary.totals.admissionCount).toBe(0);

  const deleted = await admin.client.patients.bulkDelete({
    deleteFiles: false,
    ids: [first.id],
  });

  expect(deleted.deleted).toBe(1);

  await expect(admin.client.patients.get({ id: first.id })).rejects.toThrow();
  await expect(
    admin.client.patients.get({ id: second.id })
  ).resolves.toBeTruthy();
});

describe("无科室账号", () => {
  it("只能浏览公开内容，不能发帖或开会", async () => {
    const visitor = await signUp();

    await expect(
      visitor.posts.create({ content: "# x", title: "无科室发帖" })
    ).rejects.toThrow();
    await expect(
      visitor.learning.create({ heldAt: new Date(), title: "无科室会议" })
    ).rejects.toThrow();
    await expect(
      visitor.patients.create({ name: "无科室患者" })
    ).rejects.toThrow();

    const author = await signUpDepartment("dept_admin");

    const published = await author.client.posts.create({
      content: "# 公开课",
      title: "任何人都能看的公开课",
      visibility: "public",
    });

    await author.client.posts.publish({
      id: published.id,
      published: true,
    });

    const feed = await visitor.posts.list({ page: 1, pageSize: 20 });
    expect(feed.items.some((item) => item.id === published.id)).toBe(true);

    const sessions = await visitor.learning.list({ page: 1, pageSize: 20 });
    expect(sessions.total).toBe(0);
  });
});

describe("数据库约束", () => {
  it("就诊出院时间早于入院时间会被拒绝", async () => {
    const department = await signUpDepartment();
    const doctor = department.client;
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
