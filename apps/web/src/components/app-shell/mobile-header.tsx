import { SearchIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

import { Brand } from "#src/components/app-shell/brand.tsx";
import { OrgScopeSelect } from "#src/components/app-shell/org-scope-select.tsx";
import { UserMenu } from "#src/components/app-shell/user-menu.tsx";

interface MobileHeaderProps {
  onOpenSearch: () => void;
}

/** 移动端顶栏：品牌 + 搜索入口 + 科室切换（root）+ 账号菜单。 */
export const MobileHeader = ({ onOpenSearch }: MobileHeaderProps) => (
  <header className="bg-background/90 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-md md:hidden">
    <Brand />
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
  </header>
);
