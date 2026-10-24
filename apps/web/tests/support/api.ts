import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { Page } from "@playwright/test";

import type { AppRouterClient } from "@medihub/api";

import { e2eBaseURL } from "./server.ts";

export const password = "correct-horse-battery";

export const uniqueEmail = () => `${crypto.randomUUID()}@example.com`;

/**
 * Signs up through the running server, as the sign-up form does, and returns a
 * client that calls as the new user. A new account automatically owns a personal
 * workspace, so it can create patients straight away.
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

  const client: AppRouterClient = createORPCClient(
    new RPCLink({ headers: { cookie }, url: `${e2eBaseURL}/rpc` })
  );

  return { client, email };
};

/** Signs in through the real form and waits until the app leaves `/login`. */
export const signInThroughUi = async (page: Page, email: string) => {
  await page.goto(`${e2eBaseURL}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
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
