import {
  BookOpenIcon,
  FolderTreeIcon,
  ImagesIcon,
  CalendarDaysIcon,
  StethoscopeIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

import { LIBRARY_SOURCES } from "#src/components/library/library-source.ts";
import type { LibrarySource } from "#src/components/library/library-source.ts";

const SOURCE_ICONS: Record<LibrarySource, LucideIcon> = {
  all: ImagesIcon,
  collections: FolderTreeIcon,
  patients: StethoscopeIcon,
  posts: BookOpenIcon,
  sessions: CalendarDaysIcon,
};

interface SourceTabsProps {
  onChange: (source: LibrarySource) => void;
  value: LibrarySource;
}

/** 来源分类切换：桌面是分段控件，窄屏换行，保证每个分类都可见。 */
export const SourceTabs = ({ onChange, value }: SourceTabsProps) => (
  <div
    aria-label="素材来源"
    className="bg-muted/50 flex flex-wrap gap-1 rounded-lg p-1"
    role="tablist"
  >
    {LIBRARY_SOURCES.map((source) => {
      const Icon = SOURCE_ICONS[source.value];
      const active = source.value === value;

      return (
        <Button
          aria-selected={active}
          className="shrink-0"
          key={source.value}
          onClick={() => {
            onChange(source.value);
          }}
          role="tab"
          size="sm"
          variant={active ? "default" : "ghost"}
        >
          <Icon />
          {source.label}
        </Button>
      );
    })}
  </div>
);
