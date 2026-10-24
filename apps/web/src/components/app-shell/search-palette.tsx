import { CornerDownLeftIcon, SearchIcon } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@medihub/ui/components/dialog";

import { visibleNavGroups } from "#src/components/app-shell/nav.ts";

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string | undefined;
}

/**
 * 快速跳转面板（Ctrl/⌘ + K）。外壳阶段只索引导航入口，
 * 不冒充业务搜索；输入即筛选，Enter 进入第一条结果。
 */
export const SearchPalette = ({
  open,
  onOpenChange,
  role,
}: SearchPaletteProps) => {
  const [query, setQuery] = useState("");

  const keyword = query.trim().toLowerCase();

  const matches = visibleNavGroups(role).flatMap((group) =>
    group.items
      .filter(
        (item) =>
          keyword.length === 0 ||
          item.label.toLowerCase().includes(keyword) ||
          item.description.toLowerCase().includes(keyword) ||
          item.href.toLowerCase().includes(keyword)
      )
      .map((item) => ({ groupLabel: group.label, item }))
  );

  const [firstMatch] = matches;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="top-24 translate-y-0 sm:max-w-lg"
        showCloseButton={false}
        variant="flush"
      >
        <div className="sr-only">
          <DialogTitle>搜索与跳转</DialogTitle>
          <DialogDescription>
            输入页面或功能名称，回车进入第一条结果。
          </DialogDescription>
        </div>
        <form
          className="flex items-center gap-2 border-b px-3"
          onSubmit={(event) => {
            event.preventDefault();

            if (firstMatch) {
              window.location.href = firstMatch.item.href;
            }
          }}
        >
          <SearchIcon
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            aria-label="搜索页面或功能"
            className="placeholder:text-muted-foreground h-12 w-full min-w-0 bg-transparent text-sm outline-none"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="搜索页面或功能…"
            value={query}
          />
          <kbd className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-1 font-sans text-xs font-medium">
            ESC
          </kbd>
        </form>
        <div className="max-h-80 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              没有匹配的页面，试试「患者」「资料库」。
            </p>
          ) : (
            <ul className="grid gap-0.5">
              {matches.map(({ item, groupLabel }) => {
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <a
                      className="hover:bg-muted focus-visible:bg-muted flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none"
                      href={item.href}
                      onClick={() => {
                        onOpenChange(false);
                      }}
                    >
                      <Icon
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {groupLabel}
                      </span>
                      <CornerDownLeftIcon
                        aria-hidden="true"
                        className="text-muted-foreground/60 size-3.5 shrink-0"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="text-muted-foreground bg-muted/50 flex items-center justify-between border-t px-3 py-2 text-xs">
          <span>输入关键词筛选页面</span>
          <span>按 Enter 进入</span>
        </div>
      </DialogContent>
    </Dialog>
  );
};
