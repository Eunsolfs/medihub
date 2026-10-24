import { expect, test } from "@playwright/test";

import { createPatient, signInThroughUi, signUp } from "../support/api.ts";

/** 1×1 透明 PNG：够小，浏览器也能真正解码，预览组件的 onError 不会把它降级成占位图。 */
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("科室成员上传照片后，时间线出现缩略图并能打开预览", async ({ page }) => {
  const { client, email } = await signUp();

  const { patientId, admissionId } = await createPatient(client, "时间线患者", {
    withAdmission: true,
  });

  expect(admissionId).toBeTruthy();
  await signInThroughUi(page, email);
  await page.goto(`/patients/${patientId}`, { waitUntil: "networkidle" });

  await page.getByTestId("upload-button-input").setInputFiles({
    buffer: pngBytes,
    mimeType: "image/png",
    name: "术后照片.png",
  });

  const card = page.getByTestId("asset-timeline-card").first();
  await expect(card).toBeVisible();

  const thumbnail = card.locator('img[src^="/api/files/"]');
  await expect(thumbnail).toBeVisible();

  await card.click();

  const dialog = page.getByTestId("asset-preview");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("asset-preview-image")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("未登录直接访问患者档案会被重定向到登录页", async ({ page }) => {
  await page.goto("/patients", { waitUntil: "networkidle" });

  await expect(page).toHaveURL(/\/login\?redirect=%2Fpatients/u);
  await expect(page.getByLabel("邮箱")).toBeVisible();
});
