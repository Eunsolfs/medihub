import { useRouterState } from "@tanstack/react-router";
import { ChevronRightIcon, SearchIcon } from "lucide-react";

import { findActiveNav } from "#src/components/app-shell/nav.ts";
import { OrgScopeSelect } from "#src/components/app-shell/org-scope-select.tsx";
import { ThemeMenu } from "#src/components/app-shell/theme-menu.tsx";
import { UserMenu } from "#src/components/app-shell/user-menu.tsx";

const Breadcrumbs = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const match = findActiveNav(pathname);

  return (
    <nav
      aria-label="面包屑"
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      <span className="text-muted-foreground hidden truncate lg:inline">
        医档通
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="text-muted-foreground/60 hidden size-3.5 shrink-0 lg:block"
      />
      <span className="text-muted-foreground hidden truncate md:inline">
        {match?.group.label ?? "工作区"}
      </span>
      <ChevronRightIcon
        aria-hidden="true"
        className="text-muted-foreground/60 size-3.5 shrink-0"
      />
      <span
        aria-current="page"
        className="text-foreground truncate font-medium"
      >
        {match?.item.label ?? "工作台"}
      </span>
    </nav>
  );
};

interface AppTopbarProps {
  onOpenSearch: () => void;
}

/** 平板及以上顶栏：面包屑 + 搜索入口 + 主题切换 + 用户菜单。 */
export const AppTopbar = ({ onOpenSearch }: AppTopbarProps) => (
  <header className="bg-background/85 sticky top-0 z-20 hidden h-14 items-center gap-4 border-b px-4 backdrop-blur-md md:flex lg:px-6">
    <Breadcrumbs />
    <div className="ml-auto flex items-center gap-1">
      <button
        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 border-input bg-background flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors outline-none focus-visible:ring-3"
        onClick={onOpenSearch}
        type="button"
      >
        <SearchIcon aria-hidden="true" className="size-4" />
        <span className="hidden lg:inline">搜索或跳转</span>
        <kbd className="border-border bg-muted text-muted-foreground ml-1 hidden rounded border px-1 font-sans text-xs font-medium lg:inline">
          Ctrl K
        </kbd>
      </button>
      <OrgScopeSelect />
      <ThemeMenu />
      <UserMenu />
    </div>
  </header>
);
