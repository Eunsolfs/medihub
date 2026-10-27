import { Link, useRouterState } from "@tanstack/react-router";
import { HardDriveIcon, PanelLeftIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import { ScrollArea } from "@medihub/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@medihub/ui/components/sheet";
import { cn } from "@medihub/ui/lib/utils";

import { Brand } from "#src/components/app-shell/brand.tsx";
import {
  isNavActive,
  visibleNavGroups,
} from "#src/components/app-shell/nav.ts";
import { isAdminRole } from "#src/components/app-shell/roles.ts";
import { UserMenu } from "#src/components/app-shell/user-menu.tsx";

interface SidebarNavProps {
  role: string | undefined;
  onNavigate?: () => void;
}

export const SidebarNav = ({ role, onNavigate }: SidebarNavProps) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <nav aria-label="主导航" className="flex flex-col gap-5 px-3 py-4">
      {visibleNavGroups(role).map((group) => (
        <div className="grid gap-1" key={group.label}>
          <p className="text-muted-foreground px-2.5 pb-0.5 text-xs font-medium">
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
                key={item.href}
                onClick={onNavigate}
                to={item.href}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

/** 存储配额入口：数据由系统管理页提供，外壳只负责入口位置与信息层级。 */
const StorageEntry = () => (
  <Link
    className="hover:bg-sidebar-accent/60 border-sidebar-border flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors"
    to="/admin"
  >
    <span
      aria-hidden="true"
      className="bg-accent text-accent-foreground mt-0.5 grid size-7 shrink-0 place-items-center rounded-md"
    >
      <HardDriveIcon className="size-3.5" />
    </span>
    <span className="grid min-w-0 gap-0.5">
      <span className="text-sidebar-foreground text-xs font-medium">
        存储与配额
      </span>
      <span className="text-muted-foreground truncate text-xs">
        管理科室存储空间
      </span>
    </span>
  </Link>
);

interface SidebarProps {
  role: string | undefined;
}

export const DesktopSidebar = ({ role }: SidebarProps) => (
  <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border pt-safe pb-safe fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
    <div className="border-sidebar-border flex h-14 shrink-0 items-center border-b px-4">
      <Brand />
    </div>
    <div className="min-h-0 flex-1">
      <ScrollArea className="h-full">
        <SidebarNav role={role} />
      </ScrollArea>
    </div>
    <div className="border-sidebar-border grid shrink-0 gap-2 border-t p-3">
      {isAdminRole(role) ? <StorageEntry /> : null}
      <UserMenu variant="sidebar" />
    </div>
  </aside>
);

export const IconRail = ({ role }: SidebarProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const items = visibleNavGroups(role).flatMap((group) => group.items);

  return (
    <>
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border pt-safe pb-safe fixed inset-y-0 left-0 z-30 hidden w-17 flex-col items-center border-r md:flex lg:hidden">
        <div className="border-sidebar-border flex h-14 shrink-0 items-center justify-center border-b">
          <Brand compact />
        </div>
        <nav
          aria-label="主导航"
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-3"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(pathname, item.href);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "grid size-11 place-items-center rounded-xl transition-colors",
                  active
                    ? "bg-sidebar-accent text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
                key={item.href}
                title={item.label}
                to={item.href}
              >
                <Icon className="size-5" />
              </Link>
            );
          })}
        </nav>
        <div className="border-sidebar-border w-full shrink-0 border-t p-2">
          <Button
            aria-label="展开完整导航"
            className="w-full"
            onClick={() => {
              setDrawerOpen(true);
            }}
            size="icon-lg"
            variant="ghost"
          >
            <PanelLeftIcon />
          </Button>
        </div>
      </aside>

      <Sheet onOpenChange={setDrawerOpen} open={drawerOpen}>
        <SheetContent className="w-72" side="left" variant="flush">
          <div className="border-sidebar-border pt-safe flex min-h-14 shrink-0 items-center border-b px-4">
            <div className="sr-only">
              <SheetTitle>主导航</SheetTitle>
              <SheetDescription>科室资料、会议与系统管理入口</SheetDescription>
            </div>
            <Brand />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNav
              onNavigate={() => {
                setDrawerOpen(false);
              }}
              role={role}
            />
          </div>
          <div className="border-sidebar-border pb-safe-3 grid shrink-0 gap-2 border-t px-3 pt-3">
            {isAdminRole(role) ? <StorageEntry /> : null}
            <UserMenu variant="sidebar" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
