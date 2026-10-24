import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";

import { PageSkeleton } from "#src/components/app-shell/ui/page-skeleton.tsx";
import { createQueryClient } from "#src/lib/query-client.ts";
import { routeTree } from "#src/routeTree.gen.ts";

export const createAppRouter = (history?: RouterHistory) => {
  const queryClient = createQueryClient();

  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // 加载很快时不显示占位（避免闪白），需要等待时显示骨架而不是空白。
    defaultPendingMs: 200,
    defaultPendingMinMs: 240,
    defaultPendingComponent: PageSkeleton,
    scrollRestoration: true,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
