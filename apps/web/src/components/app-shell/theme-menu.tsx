import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

const THEME_OPTIONS = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
] as const;

interface ThemeMenuProps {
  className?: string;
  /** 移动端底部 tab 向上弹，避免菜单超出屏幕。 */
  placement?: "bottom" | "top";
}

export const ThemeMenu = ({
  className,
  placement = "bottom",
}: ThemeMenuProps) => {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = (event: Event) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="切换主题"
        className={className}
        onClick={() => setOpen((value) => !value)}
        size="icon-lg"
        variant="ghost"
      >
        <SunIcon className="dark:hidden" />
        <MoonIcon className="hidden dark:block" />
      </Button>

      {open ? (
        <div
          className={cn(
            "bg-popover text-popover-foreground ring-foreground/10 absolute right-0 z-50 w-40 rounded-lg p-1 shadow-md ring-1",
            placement === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
          )}
          role="menu"
        >
          <p className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
            主题
          </p>
          <div className="bg-border my-1 h-px" />
          {THEME_OPTIONS.map((option) => {
            const active = (theme ?? "system") === option.value;

            return (
              <button
                aria-checked={active}
                className={cn(
                  "hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-sm",
                  active && "bg-accent/60"
                )}
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                role="menuitemradio"
                type="button"
              >
                {option.label}
                {active ? <span aria-hidden="true">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
