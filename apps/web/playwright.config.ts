import { defineConfig, devices } from "@playwright/test";

import { e2eBaseURL } from "./tests/support/server.ts";

const ci = process.env.CI !== undefined;

export default defineConfig({
  // The dev server compiles a route on its first request, which is slow on a shared CI runner.
  // 首次编译（尤其同时跑多个用例）会超过 30s，这里给冷启动留出余量。
  expect: { timeout: 20_000 },
  forbidOnly: ci,
  fullyParallel: true,
  globalSetup: "./tests/e2e/global-setup.ts",
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 90_000,
  use: {
    baseURL: e2eBaseURL,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
});
