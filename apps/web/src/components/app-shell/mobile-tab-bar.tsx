import { useRouterState } from "@tanstack/react-router";
import { MoreHorizontalIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@medihub/ui/components/sheet";
import { cn } from "@medihub/ui/lib/utils";

import { SidebarNav } from "#src/components/app-shell/app-sidebar.tsx";
import { isNavActive, MOBILE_TABS } from "#src/components/app-shell/nav.ts";
import { ThemeMenu } from "#src/components/app-shell/theme-menu.tsx";
import { UserMenu } from "#src/components/app-shell/user-menu.tsx";

const tabClassName = (active: boolean) =>
  cn(
    "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
    active ? "text-primary" : "text-muted-foreground"
  );

interface MobileTabBarProps {
  role: string | undefined;
  onOpenSearch: () => void;
}

export const MobileTabBar = ({ role, onOpenSearch }: MobileTabBarProps) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const moreActive = !MOBILE_TABS.some((tab) =>
    isNavActive(pathname, tab.href)
  );

  return (
    <>
      <nav
        aria-label="底部导航"
        className="bg-background/95 pb-safe fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isNavActive(pathname, tab.href);

            return (
              <a
                aria-current={active ? "page" : undefined}
                className={tabClassName(active)}
                href={tab.href}
                key={tab.href}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span>{tab.label}</span>
              </a>
            );
          })}
          <button
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={tabClassName(moreActive)}
            onClick={() => {
              setMoreOpen(true);
            }}
            type="button"
          >
            <MoreHorizontalIcon aria-hidden="true" className="size-5" />
            <span>更多</span>
          </button>
        </div>
      </nav>

      <Sheet onOpenChange={setMoreOpen} open={moreOpen}>
        <SheetContent className="max-h-[85svh]" side="bottom" variant="flush">
          <div className="flex h-14 shrink-0 items-center border-b px-4 pr-14">
            <SheetTitle>全部功能</SheetTitle>
            <div className="sr-only">
              <SheetDescription>
                资料库、学习会议、导出中心与系统管理入口
              </SheetDescription>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNav
              onNavigate={() => {
                setMoreOpen(false);
              }}
              role={role}
            />
          </div>
          <div className="pb-safe-3 grid shrink-0 gap-2 border-t p-3">
            <div className="flex items-center gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenSearch();
                }}
                variant="outline"
              >
                <SearchIcon />
                搜索与跳转
              </Button>
              <ThemeMenu />
            </div>
            <UserMenu variant="sidebar" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
