import { useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@medihub/ui/components/avatar";
import { Button } from "@medihub/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@medihub/ui/components/dropdown-menu";
import { cn } from "@medihub/ui/lib/utils";

import {
  getSessionRole,
  isAdminRole,
} from "#src/components/app-shell/roles.ts";
import { authClient } from "#src/lib/auth.ts";
import { initials, roleLabel } from "#src/lib/format.ts";

interface UserMenuProps {
  variant?: "icon" | "sidebar";
  className?: string;
}

export const UserMenu = ({ variant = "icon", className }: UserMenuProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useRouteContext({ from: "__root__" });
  const user = session?.user;

  if (!user) {
    return null;
  }

  const role = getSessionRole(session);

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  };

  const avatar = (
    <Avatar size="sm">
      <AvatarImage alt="" src={user.image ?? undefined} />
      <AvatarFallback>{initials(user.name)}</AvatarFallback>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "icon" ? (
            <Button aria-label="账号菜单" size="icon-lg" variant="ghost" />
          ) : (
            <button
              aria-label="账号菜单"
              className={cn(
                "hover:bg-sidebar-accent/60 focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors outline-none focus-visible:ring-3",
                className
              )}
              type="button"
            />
          )
        }
      >
        {avatar}
        {variant === "sidebar" ? (
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-sidebar-foreground truncate text-sm font-medium">
              {user.name}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {roleLabel(role)}
            </span>
          </span>
        ) : null}
        {variant === "sidebar" ? (
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="grid gap-0.5">
              <span className="text-foreground truncate text-sm font-medium">
                {user.name}
              </span>
              <span className="text-muted-foreground truncate text-xs font-normal">
                {user.email}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<a aria-label="我的资料" href="/me" />}>
          <UserRoundIcon />
          我的资料
        </DropdownMenuItem>
        {isAdminRole(role) ? (
          <DropdownMenuItem render={<a aria-label="系统管理" href="/admin" />}>
            <SettingsIcon />
            系统管理
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void handleSignOut();
          }}
          variant="destructive"
        >
          <LogOutIcon />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
