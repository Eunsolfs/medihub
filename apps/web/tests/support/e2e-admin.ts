import { DatabaseSync } from "node:sqlite";

export const e2eAdmin = {
  email: "e2e-admin@example.com",
  password: "e2e-admin-password",
};

/**
 * 端到端用例注册的新账号需要一个归属科室，否则不能建患者档案。
 * 用真实接口注册一个管理员，再把它放进一个测试科室，供用例通过
 * `users.claim` 把新账号认领进科室（与产品里的流程一致）。
 */
export const seedDepartmentAdmin = async (baseURL: string, dbPath: string) => {
  await fetch(`${baseURL}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: e2eAdmin.email,
      name: "E2E 科室管理员",
      password: e2eAdmin.password,
    }),
    headers: { "content-type": "application/json", origin: baseURL },
    method: "POST",
  });

  // 只做测试数据准备：直接用 SQLite 写组织与角色，避免给 apps/web 增加 ORM 依赖。
  const db = new DatabaseSync(dbPath);

  try {
    // SAFETY: Better Auth 的 user 表主键 `id` 非空，查不到时 `get` 返回 undefined。
    const admin = db
      .prepare("SELECT id FROM user WHERE email = ?")
      .get(e2eAdmin.email) as { id?: string } | undefined;

    if (!admin?.id) {
      throw new Error("创建 E2E 管理员失败");
    }

    const departmentId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO organization (id, code, kind, name) VALUES (?, ?, 'department', ?)"
    ).run(departmentId, "E2E", "端到端测试科室");
    db.prepare(
      "UPDATE user SET organization_id = ?, role = 'dept_admin' WHERE id = ?"
    ).run(departmentId, admin.id);
  } finally {
    db.close();
  }
};
