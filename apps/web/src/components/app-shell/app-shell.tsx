import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  DesktopSidebar,
  IconRail,
} from "#src/components/app-shell/app-sidebar.tsx";
import { AppTopbar } from "#src/components/app-shell/app-topbar.tsx";
import { MobileHeader } from "#src/components/app-shell/mobile-header.tsx";
import { MobileTabBar } from "#src/components/app-shell/mobile-tab-bar.tsx";
import { getSessionRole } from "#src/components/app-shell/roles.ts";
import { SearchPalette } from "#src/components/app-shell/search-palette.tsx";
import { useNativeBackButton } from "#src/lib/native-back.ts";

interface AppShellProps {
  children: ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { session } = useRouteContext({ from: "__root__" });
  const role = getSessionRole(session);
  const [searchOpen, setSearchOpen] = useState(false);
  useNativeBackButton();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const openSearch = () => {
    setSearchOpen(true);
  };

  return (
    <div className="bg-background min-h-svh">
      <DesktopSidebar role={role} />
      <IconRail role={role} />
      <MobileHeader onOpenSearch={openSearch} />
      <div className="md:pl-17 lg:pl-64">
        <AppTopbar onOpenSearch={openSearch} />
        <main className="pb-safe-nav mx-auto w-full max-w-[1400px] px-4 pt-6 md:px-6 md:pt-6 md:pb-6 lg:px-8 lg:pt-8 lg:pb-8">
          {children}
        </main>
      </div>
      <MobileTabBar onOpenSearch={openSearch} role={role} />
      <SearchPalette
        onOpenChange={setSearchOpen}
        open={searchOpen}
        role={role}
      />
    </div>
  );
};
