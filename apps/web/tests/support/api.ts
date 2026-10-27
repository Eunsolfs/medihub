import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { Page } from "@playwright/test";

import type { AppRouterClient } from "@medihub/api";

import { e2eAdmin } from "./e2e-admin.ts";
import { e2eBaseURL } from "./server.ts";

export const password = "correct-horse-battery";

export const uniqueEmail = () => `${crypto.randomUUID()}@example.com`;

const signInForCookie = async (email: string, signInPassword: string) => {
  const response = await fetch(`${e2eBaseURL}/api/auth/sign-in/email`, {
    body: JSON.stringify({ email, password: signInPassword }),
    headers: { "content-type": "application/json", origin: e2eBaseURL },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Sign in failed with ${response.status}`);
  }

  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");
};

const clientWithCookie = (cookie: string): AppRouterClient =>
  createORPCClient(
    new RPCLink({ headers: { cookie }, url: `${e2eBaseURL}/rpc` })
  );

/**
 * Signs up through the running server, then gets the new account claimed into
 * the E2E department by its admin (the same flow the product offers in
 * 系统管理 → 待分配用户). Only department members may create patient records.
 */
export const signUp = async (email = uniqueEmail()) => {
  const response = await fetch(`${e2eBaseURL}/api/auth/sign-up/email`, {
    body: JSON.stringify({ email, name: "Test User", password }),
    headers: { "content-type": "application/json", origin: e2eBaseURL },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Sign up failed with ${response.status}`);
  }

  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0])
    .join("; ");

  const client = clientWithCookie(cookie);
  const profile = await client.me.profile();

  if (!profile) {
    throw new Error("新账号缺少会话");
  }

  const adminCookie = await signInForCookie(e2eAdmin.email, e2eAdmin.password);
  await clientWithCookie(adminCookie).users.claim({
    userId: profile.viewer.id,
  });

  // 认领后会话里的角色与科室已变化，重新登录一次拿新会话。
  const memberCookie = await signInForCookie(email, password);

  return { client: clientWithCookie(memberCookie), email };
};

/** 轻量验证码：读取当前已渲染 SVG 的字符节点，填入表单（测试专用）。 */
export const fillCaptcha = async (page: Page) => {
  const chars = await page
    .locator('button[aria-label="刷新验证码"] svg text')
    .allTextContents();

  const answer = chars.join("");

  if (answer.length !== 4) {
    throw new Error("验证码未加载");
  }

  await page.locator("#captcha").fill(answer);
};

/** Signs in through the real form and waits until the app leaves `/login`. */
export const signInThroughUi = async (page: Page, email: string) => {
  await page.goto(`${e2eBaseURL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await fillCaptcha(page);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
};

/** Seeds a patient (and optionally one admission) for a journey under test. */
export const createPatient = async (
  client: AppRouterClient,
  name: string,
  options: { withAdmission?: boolean } = {}
) => {
  const patient = await client.patients.create({ name });

  if (!options.withAdmission) {
    return { patientId: patient.id };
  }

  const admission = await client.admissions.create({
    admittedAt: new Date("2026-10-01T09:00:00+08:00"),
    diagnosis: "术后复查",
    patientId: patient.id,
  });

  return { admissionId: admission.id, patientId: patient.id };
};
