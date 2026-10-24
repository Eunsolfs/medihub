import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { hashPassword } from "@medihub/auth";
import { migrateDatabase } from "@medihub/db/migrate";
import { account, user } from "@medihub/db/schema/auth";
import {
  asset,
  collection,
  post as contentPost,
  postMedia,
} from "@medihub/db/schema/content";
import { learningSession } from "@medihub/db/schema/learning";
import { organization } from "@medihub/db/schema/organization";
import { admission, patient } from "@medihub/db/schema/patients";
import { storageTarget } from "@medihub/db/schema/system";
import { buildStorageKey } from "@medihub/storage";

import { db, storage, storageRoot } from "#src/context.ts";
import { env } from "#src/env.ts";

const here = import.meta.dirname;
const seedAssetsDir = path.resolve(here, "../seed-assets");

const ROOT_EMAIL = env.SEED_ROOT_EMAIL ?? "root@medihub.local";
const ROOT_PASSWORD = env.SEED_ROOT_PASSWORD ?? "Medihub@2026";
const STAFF_PASSWORD = "Medihub@2026";

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const createAccount = async (input: {
  email: string;
  name: string;
  password: string;
  role: "root" | "dept_admin" | "member" | "individual";
  organizationId: string | null;
  title?: string;
}) => {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, input.email));

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();

  await db.insert(user).values({
    email: input.email,
    emailVerified: true,
    id,
    name: input.name,
    organizationId: input.organizationId,
    role: input.role,
    title: input.title ?? null,
  });

  await db.insert(account).values({
    accountId: id,
    id: crypto.randomUUID(),
    password: await hashPassword(input.password),
    providerId: "credential",
    userId: id,
  });

  return id;
};

const main = async () => {
  migrateDatabase(db);

  const [existingOrg] = await db
    .select()
    .from(organization)
    .where(eq(organization.code, "plastic-surgery"));

  const [insertedOrg] = existingOrg
    ? [existingOrg]
    : await db
        .insert(organization)
        .values({
          code: "plastic-surgery",
          description: "演示科室：整形外科 / 创面修复中心",
          kind: "department",
          name: "整形外科",
        })
        .returning();

  const organizationId = insertedOrg?.id;

  if (!organizationId) {
    throw new Error("创建科室失败");
  }

  // 第二个科室：用来演示「科室资料互相独立」与 root 的科室切换/筛选。
  const [existingBurns] = await db
    .select()
    .from(organization)
    .where(eq(organization.code, "burns"));

  const [insertedBurns] = existingBurns
    ? [existingBurns]
    : await db
        .insert(organization)
        .values({
          code: "burns",
          description: "演示科室：烧伤科",
          kind: "department",
          name: "烧伤科",
        })
        .returning();

  const burnsOrganizationId = insertedBurns?.id;

  if (!burnsOrganizationId) {
    throw new Error("创建烧伤科失败");
  }

  // root 不隶属于任何科室：作为全局管理员，通过顶部科室切换器查看各科室资料。
  await createAccount({
    email: ROOT_EMAIL,
    name: "系统管理员",
    organizationId: null,
    password: ROOT_PASSWORD,
    role: "root",
    title: "信息科",
  });

  const adminId = await createAccount({
    email: "admin@medihub.local",
    name: "李主任",
    organizationId,
    password: STAFF_PASSWORD,
    role: "dept_admin",
    title: "科室主任",
  });

  const memberId = await createAccount({
    email: "doctor@medihub.local",
    name: "王医生",
    organizationId,
    password: STAFF_PASSWORD,
    role: "member",
    title: "主治医师",
  });

  const [existingTarget] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.isDefault, true));

  if (!existingTarget) {
    await db.insert(storageTarget).values({
      config: storage.encrypt({ rootPath: path.join(storageRoot, "default") }),
      driver: "local",
      isDefault: true,
      name: "服务器本地磁盘（演示）",
      organizationId: null,
    });
  }

  const [target] = await db
    .select()
    .from(storageTarget)
    .where(eq(storageTarget.isDefault, true));

  if (!target) {
    throw new Error("创建默认存储目标失败");
  }

  const driver = storage.driverFor(target);
  const seedFiles = await readdir(seedAssetsDir).catch(() => [] as string[]);

  const [existingPatient] = await db
    .select({ id: patient.id })
    .from(patient)
    .where(eq(patient.organizationId, organizationId));

  if (existingPatient) {
    console.log("演示数据已存在，跳过患者与素材的写入。");
    console.log(`root: ${ROOT_EMAIL} / ${ROOT_PASSWORD}`);
    console.log(`科室管理员: admin@medihub.local / ${STAFF_PASSWORD}`);
    console.log(`科室成员: doctor@medihub.local / ${STAFF_PASSWORD}`);

    return;
  }

  const patients = [
    {
      admissions: [
        {
          admittedAt: daysAgo(120),
          diagnosis: "右前臂瘢痕挛缩",
          kind: "surgery" as const,
          stages: ["preop", "intraop", "postop"],
          treatment: "瘢痕切除 + 全厚皮片移植",
        },
        {
          admittedAt: daysAgo(12),
          diagnosis: "右前臂皮片成活良好，瘢痕复发倾向",
          kind: "follow_up" as const,
          stages: ["follow_up"],
          treatment: "随访观察 + 压力治疗",
        },
      ],
      gender: "male" as const,
      name: "张建国",
      phone: "138****2041",
      summary: "右前臂烧伤后瘢痕挛缩",
      tags: ["瘢痕", "皮片移植"],
    },
    {
      admissions: [
        {
          admittedAt: daysAgo(64),
          diagnosis: "鼻部基底细胞癌",
          kind: "surgery" as const,
          stages: ["imaging", "preop", "intraop", "postop"],
          treatment: "扩大切除 + 局部皮瓣修复",
        },
      ],
      gender: "female" as const,
      name: "李秀兰",
      phone: "139****7782",
      summary: "鼻部基底细胞癌术后",
      tags: ["肿瘤", "皮瓣"],
    },
    {
      admissions: [
        {
          admittedAt: daysAgo(30),
          diagnosis: "糖尿病足溃疡（Wagner 2 级）",
          kind: "inpatient" as const,
          stages: ["preop", "postop"],
          treatment: "清创 + 负压引流 + 植皮",
        },
      ],
      gender: "male" as const,
      name: "陈国强",
      phone: "137****3310",
      summary: "糖尿病足溃疡",
      tags: ["创面", "糖尿病足"],
    },
  ];

  const stageDates: Record<string, number> = {
    follow_up: 2,
    imaging: 1,
    intraop: 1,
    postop: 3,
    preop: 0,
  };

  for (const [patientIndex, seed] of patients.entries()) {
    const [createdPatient] = await db
      .insert(patient)
      .values({
        createdBy: memberId,
        gender: seed.gender,
        medicalRecordNo: `MRN-2026-${String(patientIndex + 1).padStart(4, "0")}`,
        name: seed.name,
        organizationId,
        phone: seed.phone,
        status: "active",
        summary: seed.summary,
        tags: seed.tags,
      })
      .returning();

    if (!createdPatient) {
      continue;
    }

    for (const [admissionIndex, entry] of seed.admissions.entries()) {
      const [createdAdmission] = await db
        .insert(admission)
        .values({
          admittedAt: entry.admittedAt,
          admissionNo: `ZY2026${String(patientIndex * 10 + admissionIndex + 1).padStart(4, "0")}`,
          attendingDoctor: "李主任",
          createdBy: adminId,
          department: "整形外科",
          diagnosis: entry.diagnosis,
          dischargedAt: new Date(entry.admittedAt.getTime() + 7 * 86_400_000),
          kind: entry.kind,
          organizationId,
          patientId: createdPatient.id,
          summary: [
            "## 入院情况",
            "",
            `${seed.name}，因「${entry.diagnosis}」入院。入院查体见局部皮肤缺损，血运良好，无明显渗出。`,
            "",
            "## 手术经过",
            "",
            entry.treatment,
            "术中止血彻底，皮瓣血运良好，放置引流一条。",
            "",
            "## 术后与随访",
            "",
            "- 术后 24 小时内重点观察皮瓣颜色、温度与毛细血管反应。",
            "- 按时间线归档术前、术中、术后与随访照片。",
            "",
            "> 本段为演示用病历摘要，不是真实病历。",
          ].join("\n"),
          tags: [],
          treatment: entry.treatment,
        })
        .returning();

      if (!createdAdmission) {
        continue;
      }

      let fileIndex = 0;

      for (const stage of entry.stages) {
        for (let copy = 0; copy < 2; copy += 1) {
          const fileName = seedFiles[fileIndex % seedFiles.length];
          fileIndex += 1;

          if (!fileName) {
            continue;
          }

          const buffer = await readFile(path.join(seedAssetsDir, fileName));

          const storageKey = buildStorageKey(
            organizationId,
            "image/png",
            fileName
          );

          await driver.put(storageKey, buffer);

          await db.insert(asset).values({
            admissionId: createdAdmission.id,
            byteSize: buffer.byteLength,
            capturedAt: new Date(
              entry.admittedAt.getTime() + (stageDates[stage] ?? 0) * 86_400_000
            ),
            checksum: createHash("sha256").update(buffer).digest("hex"),
            description: `${stage === "preop" ? "术前" : stage === "intraop" ? "术中" : stage === "postop" ? "术后" : "随访"}记录`,
            kind: "image",
            mimeType: "image/png",
            organizationId,
            originalName: `${stage}-${patientIndex + 1}-${copy + 1}.png`,
            ownerId: memberId,
            patientId: createdPatient.id,
            stage: stage as "preop",
            storageKey,
            storageTargetId: target.id,
            tags: [...seed.tags, stage],
            timelineOrder: fileIndex,
            visibility: "org",
          });
        }
      }
    }
  }

  // 由科室管理员建档：普通成员看不到，用于演示「谁的患者归谁」。
  const [adminPatient] = await db
    .insert(patient)
    .values({
      createdBy: adminId,
      gender: "female",
      medicalRecordNo: "MRN-2026-0004",
      name: "周敏",
      organizationId,
      phone: "135****6621",
      status: "follow_up",
      summary: "面部色素痣切除术后随访",
      tags: ["色素痣", "随访"],
    })
    .returning();

  if (adminPatient) {
    await db.insert(admission).values({
      admittedAt: daysAgo(45),
      admissionNo: "ZY20260031",
      attendingDoctor: "李主任",
      createdBy: adminId,
      department: "整形外科",
      diagnosis: "面部色素痣（交界痣）",
      dischargedAt: daysAgo(41),
      kind: "surgery",
      organizationId,
      patientId: adminPatient.id,
      summary: [
        "## 入院情况",
        "",
        "左面颊色素痣约 0.8cm，边界清楚，门诊建议手术切除。",
        "",
        "## 手术经过",
        "",
        "局麻下行梭形切除 + 美容缝合。",
      ].join("\n"),
      tags: ["色素痣"],
      treatment: "梭形切除 + 美容缝合",
    });
  }

  // 烧伤科：一位患者 + 一次入院 + 两张照片，用于验证科室之间的数据隔离。
  const [burnPatient] = await db
    .insert(patient)
    .values({
      createdBy: adminId,
      gender: "male",
      medicalRecordNo: "MRN-2026-9001",
      name: "赵明",
      organizationId: burnsOrganizationId,
      phone: "136****8890",
      status: "active",
      summary: "双下肢火焰烧伤 25% TBSA",
      tags: ["烧伤", "植皮"],
    })
    .returning();

  if (burnPatient) {
    const [burnAdmission] = await db
      .insert(admission)
      .values({
        admittedAt: daysAgo(18),
        admissionNo: "ZY20269001",
        attendingDoctor: "周主任",
        createdBy: adminId,
        department: "烧伤科",
        diagnosis: "双下肢深二度烧伤 25% TBSA",
        dischargedAt: daysAgo(4),
        kind: "inpatient",
        organizationId: burnsOrganizationId,
        patientId: burnPatient.id,
        summary: [
          "## 入院情况",
          "",
          "火焰烧伤总面积约 25% TBSA，其中深二度约 12%。",
          "",
          "## 治疗经过",
          "",
          "补液抗休克、创面清创、分次削痂植皮。",
        ].join("\n"),
        tags: ["烧伤"],
        treatment: "削痂 + 自体薄中厚皮片移植",
      })
      .returning();

    if (burnAdmission) {
      for (const [index, stage] of (["preop", "postop"] as const).entries()) {
        const fileName = seedFiles[index % Math.max(seedFiles.length, 1)];

        if (!fileName) {
          continue;
        }

        const buffer = await readFile(path.join(seedAssetsDir, fileName));

        const storageKey = buildStorageKey(
          burnsOrganizationId,
          "image/png",
          fileName
        );

        await driver.put(storageKey, buffer);

        await db.insert(asset).values({
          admissionId: burnAdmission.id,
          byteSize: buffer.byteLength,
          capturedAt: new Date(
            burnAdmission.admittedAt.getTime() + (index + 1) * 86_400_000
          ),
          checksum: createHash("sha256").update(buffer).digest("hex"),
          description: stage === "preop" ? "烧伤创面入院时" : "植皮术后",
          kind: "image",
          mimeType: "image/png",
          organizationId: burnsOrganizationId,
          originalName: `burns-${stage}.png`,
          ownerId: adminId,
          patientId: burnPatient.id,
          stage,
          storageKey,
          storageTargetId: target.id,
          tags: ["烧伤", stage],
          timelineOrder: index,
          visibility: "org",
        });
      }
    }
  }

  const [sessionRow] = await db
    .insert(learningSession)
    .values({
      createdBy: adminId,
      description:
        "围绕皮瓣选择、供区处理与术后随访的病例讨论，含术中视频与术后照片。",
      heldAt: daysAgo(9),
      kind: "case_review",
      location: "科室示教室",
      organizationId,
      speaker: "李主任",
      tags: ["病例讨论", "皮瓣"],
      title: "2026 年 10 月科室病例讨论：鼻部缺损修复",
    })
    .returning();

  const [training] = await db
    .insert(collection)
    .values({
      createdBy: adminId,
      description: "科室培训课件、指南与讲课材料",
      name: "培训课件",
      organizationId,
    })
    .returning();

  const [cases] = await db
    .insert(collection)
    .values({
      createdBy: adminId,
      description: "病例汇报与科研用图的汇总",
      name: "病例资料",
      organizationId,
    })
    .returning();

  /** 把 seed-assets 里的文档放进资料库，用于演示在线预览。 */
  const attachDocument = async (
    file: string,
    mimeType: string,
    collectionId: string,
    sessionId?: string
  ) => {
    const buffer = await readFile(path.join(seedAssetsDir, file));
    const storageKey = buildStorageKey(organizationId, mimeType, file);

    await driver.put(storageKey, buffer);

    const [row] = await db
      .insert(asset)
      .values({
        byteSize: buffer.byteLength,
        checksum: createHash("sha256").update(buffer).digest("hex"),
        collectionId,
        description: "演示文档，可在浏览器内直接预览",
        kind: "document",
        mimeType,
        organizationId,
        originalName: file,
        ownerId: adminId,
        sessionId: sessionId ?? null,
        storageKey,
        storageTargetId: target.id,
        tags: ["培训"],
        visibility: "org",
      })
      .returning();

    return row;
  };

  if (training?.id) {
    await attachDocument(
      "科室培训-皮瓣修复要点.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      training.id
    );
  }

  if (cases?.id) {
    await attachDocument(
      "2026-10-科室学习-病例讨论.pptx",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      cases.id,
      sessionRow?.id
    );
  }

  const [coverAsset] = await db
    .select({ id: asset.id })
    .from(asset)
    .where(
      and(eq(asset.organizationId, organizationId), eq(asset.kind, "image"))
    )
    .limit(1);

  const [post] = await db
    .insert(contentPost)
    .values({
      authorId: adminId,
      content: [
        "# 皮瓣危象的早期识别与处理",
        "",
        "> 本科室内部教学材料，用于住院医师规范化培训。",
        "",
        "## 一、什么是皮瓣危象",
        "",
        "皮瓣危象指皮瓣血运障碍导致的缺血或淤血状态，**术后 24 小时内**是高峰。",
        "",
        "## 二、床旁四步观察法",
        "",
        "1. **颜色**：苍白提示动脉缺血，暗紫提示静脉回流障碍。",
        "2. **温度**：与健侧对比，低于 2℃ 以上需警惕。",
        "3. **充盈**：毛细血管反应时间 > 3 秒为异常。",
        "4. **针刺**：出血鲜红、迅速为佳；暗红缓慢提示淤血。",
        "",
        "## 三、处理流程",
        "",
        "| 判断 | 首选处理 | 备注 |",
        "| --- | --- | --- |",
        "| 动脉危象 | 解除压迫、保暖、罂粟碱 | 30 分钟无改善立即探查 |",
        "| 静脉危象 | 拆除部分缝线、水蛭疗法 | 警惕血肿压迫 |",
        "",
        "## 四、参考视频",
        "",
        "见文末附件中的 B 站教学视频。",
        "",
        "---",
        "",
        "*本文为演示数据，不构成诊疗建议。*",
      ].join("\n"),
      coverAssetId: coverAsset?.id ?? null,
      excerpt:
        "术后 24 小时是关键窗口：颜色、温度、充盈、针刺四步法，以及动脉/静脉危象的处理优先级。",
      organizationId,
      slug: "flap-crisis-early-recognition",
      status: "published",
      tags: ["皮瓣", "教学", "围手术期"],
      title: "皮瓣危象的早期识别与处理",
      publishedAt: daysAgo(6),
      visibility: "public",
    })
    .returning();

  if (post?.id) {
    await db.insert(postMedia).values([
      {
        kind: "video" as const,
        postId: post.id,
        provider: "bilibili" as const,
        sortOrder: 0,
        title: "皮瓣血液循环观察示范（B 站）",
        url: "https://www.bilibili.com/video/BV1xx411c7mD",
      },
      ...(coverAsset?.id
        ? [
            {
              assetId: coverAsset.id,
              kind: "image" as const,
              postId: post.id,
              provider: "asset" as const,
              sortOrder: 1,
              title: "典型病例：术后 7 天皮瓣成活",
            },
          ]
        : []),
    ]);
  }

  const [draft] = await db
    .insert(contentPost)
    .values({
      authorId: memberId,
      content:
        "# 糖尿病足溃疡的清创时机\n\n待补充：Wagner 分级与清创窗口的对应关系。\n",
      excerpt: "草稿：整理 Wagner 分级与清创时机的对应关系。",
      organizationId,
      slug: "diabetic-foot-debridement",
      status: "draft",
      tags: ["创面", "糖尿病足"],
      title: "糖尿病足溃疡的清创时机（草稿）",
      visibility: "org",
    })
    .returning();

  console.log("演示数据写入完成。");
  console.log(`root: ${ROOT_EMAIL} / ${ROOT_PASSWORD}`);
  console.log(`科室管理员: admin@medihub.local / ${STAFF_PASSWORD}`);
  console.log(`科室成员: doctor@medihub.local / ${STAFF_PASSWORD}`);
  console.log(`公开教学帖: /p/${post?.slug ?? "-"}（已发布，任何人可读）`);
  console.log(`草稿帖: ${draft?.title ?? "-"}`);
  console.log(`资料库: ${training?.name ?? "-"} / ${cases?.name ?? "-"}`);
};

await main();

db.$client.close();
