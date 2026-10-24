import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouterClient } from "@medihub/api";

import { scopeHeaders } from "#src/lib/org-scope-storage.ts";

/**
 * 请求时动态带上 `x-org-scope`：root 通过顶部科室切换器改变作用域后，
 * 后续所有请求（以及缓存失效后的重新取数）都会落到新科室。
 */
const withScope = (request: Request) => {
  const headers = new Headers(request.headers);

  for (const [key, value] of Object.entries(scopeHeaders())) {
    headers.set(key, value);
  }

  return new Request(request, { headers });
};

const link = new RPCLink({
  fetch: async (request, init) => await fetch(withScope(request), init),
  url: `${window.location.origin}/rpc`,
});

const client: AppRouterClient = createORPCClient(link);

export const api = createTanstackQueryUtils(client);
