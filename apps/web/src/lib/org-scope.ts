import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useCallback, useSyncExternalStore } from "react";

import { getSessionRole } from "#src/components/app-shell/roles.ts";
import { api } from "#src/lib/api.ts";
import {
  scopeOrganizationId,
  setScopeOrganizationId,
  subscribeScope,
} from "#src/lib/org-scope-storage.ts";

/**
 * root 的「当前科室」作用域。
 *
 * 非 root 用户永远拿不到可切换的列表：服务端只认自己的科室，客户端不参与决定。
 */
export const useOrgScope = () => {
  const { session } = useRouteContext({ from: "__root__" });
  const role = getSessionRole(session);
  const isRoot = role === "root";

  const value = useSyncExternalStore(
    subscribeScope,
    scopeOrganizationId,
    () => ""
  );

  const router = useRouter();
  const queryClient = useQueryClient();

  const organizationsQuery = useQuery({
    ...api.orgs.list.queryOptions({
      input: { page: 1, pageSize: 100, kind: "department" },
    }),
    enabled: isRoot,
  });

  const organizations = isRoot ? (organizationsQuery.data?.items ?? []) : [];

  const changeScope = useCallback(
    async (id: string) => {
      setScopeOrganizationId(id);
      // 查询键不区分科室：切科室后把已有结果重置并重新取数，
      // 用 reset 而不是 clear，保证已挂载的 suspense 组件仍能收到新数据。
      await queryClient.cancelQueries();
      await queryClient.resetQueries();
      await router.invalidate();
    },
    [queryClient, router]
  );

  return {
    changeScope,
    currentOrganization:
      organizations.find((row) => row.id === value) ?? organizations[0] ?? null,
    isRoot,
    organizations,
    organizationId: value || undefined,
  };
};
