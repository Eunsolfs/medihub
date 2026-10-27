import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "#src/components/app-shell/app-shell.tsx";
import { useIdleLogout } from "#src/components/app-shell/use-idle-logout.ts";

const AuthenticatedLayout = () => {
  useIdleLogout();

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }

    return { session: context.session };
  },
  component: AuthenticatedLayout,
});
