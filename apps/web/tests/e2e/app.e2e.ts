import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { createPatient, signInThroughUi, signUp } from "../support/api.ts";

const visit = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: "networkidle" });
};

test("visitors are sent to sign in before seeing the patient archive", async ({
  page,
}) => {
  await visit(page, "/patients");

  await expect(page).toHaveURL(/\/login\?redirect=/u);
  await expect(
    page.getByRole("button", { name: "登录", exact: true })
  ).toBeVisible();
});

test("a signed-in member sees their patients and opens one", async ({
  page,
}) => {
  const { client, email } = await signUp();
  const { patientId } = await createPatient(client, "端到端患者");

  await signInThroughUi(page, email);
  await visit(page, "/patients");

  await expect(page.getByText("端到端患者").first()).toBeVisible();

  await visit(page, `/patients/${patientId}`);
  await expect(page.getByRole("heading", { name: "端到端患者" })).toBeVisible();
  // 就诊记录区块在桌面与移动两种布局里各渲染一次，取当前可见的那个。
  await expect(page.getByText("就诊记录").last()).toBeVisible();
});

test("creating a patient through the form adds it to the archive", async ({
  page,
}) => {
  const { email } = await signUp();

  await signInThroughUi(page, email);
  await visit(page, "/patients");

  await page.getByRole("button", { name: "新建患者" }).first().click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("姓名").fill("表单患者");
  await dialog.getByLabel("病案号").fill("MRN-E2E-01");
  await dialog.getByRole("button", { name: "新建患者" }).click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText("表单患者").first()).toBeVisible();
});

test("a wrong password is rejected", async ({ page }) => {
  const { email } = await signUp();

  await visit(page, "/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByText("邮箱或密码不正确")).toBeVisible();
  await expect(page).toHaveURL(/\/login/u);
});

test("the account menu signs out and ends the session", async ({ page }) => {
  const { email } = await signUp();
  await signInThroughUi(page, email);
  await visit(page, "/dashboard");

  await page.getByRole("button", { name: "账号菜单" }).first().click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();

  await visit(page, "/dashboard");
  await expect(page).toHaveURL(/\/login/u);
});
