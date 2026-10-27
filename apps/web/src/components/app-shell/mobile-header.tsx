import {
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { ChevronLeftIcon, SearchIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

import { Brand } from "#src/components/app-shell/brand.tsx";
import { findActiveNav } from "#src/components/app-shell/nav.ts";
import { OrgScopeSelect } from "#src/components/app-shell/org-scope-select.tsx";
import { getSessionRole } from "#src/components/app-shell/roles.ts";
import { UserMenu } from "#src/components/app-shell/user-menu.tsx";

interface MobileHeaderProps {
  onOpenSearch: () => void;
}

/** 工作台是「首页」：这里不显示返回按钮，其余页面只要有历史就显示。 */
const HOME_HREF = "/dashboard";

/** 移动端顶栏：返回 + 品牌 + 搜索入口 + 科室切换（root）+ 账号菜单。 */
export const MobileHeader = ({ onOpenSearch }: MobileHeaderProps) => {
  const router = useRouter();

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const { session } = useRouteContext({ from: "/_authenticated" });
  const active = findActiveNav(pathname, getSessionRole(session));
  const isHome = active === undefined || active.item.href === HOME_HREF;
  const showBack = !isHome && router.history.canGoBack();

  return (
    <header className="bg-background/90 pt-safe sticky top-0 z-20 border-b backdrop-blur-md md:hidden">
      <div className="flex h-14 items-center gap-1 px-2.5">
        {showBack ? (
          <Button
            aria-label="返回上一页"
            onClick={() => {
              router.history.back();
            }}
            size="icon-lg"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
        ) : null}
        <Brand compact={showBack} />
        <div className="ml-auto flex items-center gap-0.5">
          <OrgScopeSelect compact />
          <Button
            aria-label="搜索或跳转"
            onClick={onOpenSearch}
            size="icon-lg"
            variant="ghost"
          >
            <SearchIcon />
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
};
