import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth } from "@medihub/auth";

/**
 * 业务字段（role / organizationId / status / title）由服务端 `additionalFields`
 * 扩展在会话用户上；客户端用同一个类型推导，避免页面到处 `as` 断言。
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export type Session = typeof authClient.$Infer.Session;

export const getSession = async (): Promise<Session | null> => {
  const { data, error } = await authClient.getSession();

  if (error) {
    throw new Error(error.message ?? error.statusText);
  }

  return data;
};
