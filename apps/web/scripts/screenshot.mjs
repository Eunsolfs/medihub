import { chromium } from "@playwright/test";

const base = "http://localhost:5173";

const routes = [
  ["login", "/login"],
  ["dashboard", "/dashboard"],
  ["patients", "/patients"],
  ["posts", "/posts"],
  ["library", "/library"],
  ["sessions", "/sessions"],
  ["exports", "/exports"],
  ["admin", "/admin"],
  ["me", "/me"],
];

const viewports = [
  ["desktop", { height: 900, width: 1440 }],
  ["mobile", { height: 812, width: 375 }],
];

const browser = await chromium.launch();

for (const [sizeName, viewport] of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  // 用真实表单登录，顺带验证登录页。
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.screenshot({
    path: `.design/shots/lead-${sizeName}-login.png`,
    fullPage: true,
  });

  await page.getByLabel("邮箱").fill("root@medihub.local");
  await page.getByLabel("密码").fill("Medihub@2026");
  await page.getByRole("button", { name: "登录" }).click();
  await page
    .waitForURL(/dashboard|patients/, { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  for (const [name, path] of routes) {
    if (path === "/login") {
      continue;
    }

    try {
      await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      await page.screenshot({
        path: `.design/shots/lead-${sizeName}-${name}.png`,
        fullPage: true,
      });
      const body = await page.locator("body").textContent();

      const hasError =
        /Application error|Uncaught|Cannot read|undefined is not/i.test(body);

      console.log(`${sizeName} ${path} ok${hasError ? " (ERROR TEXT)" : ""}`);
    } catch (error) {
      console.log(`${sizeName} ${path} FAILED ${error.message}`);
    }
  }

  // 患者详情：从列表里点进第一条
  try {
    await page.goto(`${base}/patients`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const first = page.locator('a[href^="/patients/"]').first();

    if (await first.count()) {
      await first.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: `.design/shots/lead-${sizeName}-patient-detail.png`,
        fullPage: true,
      });
      console.log(`${sizeName} patient detail ok`);
    }
  } catch (error) {
    console.log(`${sizeName} patient detail FAILED ${error.message}`);
  }

  console.log(`--- ${sizeName} console errors (${errors.length}) ---`);
  errors.slice(0, 12).forEach((line) => {
    console.log(`  ${line.slice(0, 220)}`);
  });
  await context.close();
}

await browser.close();
