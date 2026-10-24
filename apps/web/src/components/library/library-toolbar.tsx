import { LayoutGridIcon, ListIcon, SlidersHorizontalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@medihub/ui/components/sheet";

import {
  LIBRARY_KIND_FILTERS,
  LIBRARY_SORT_OPTIONS,
  LIBRARY_STAGE_OPTIONS,
  sourceLabel,
} from "#src/components/library/library-source.ts";
import type {
  LibraryKindFilter,
  LibrarySort,
  LibrarySource,
  LibraryStageFilter,
  LibraryViewMode,
} from "#src/components/library/library-source.ts";

interface LibraryToolbarProps {
  kind: LibraryKindFilter;
  onKindChange: (kind: LibraryKindFilter) => void;
  onQChange: (q: string) => void;
  onSortChange: (sort: LibrarySort) => void;
  onStageChange: (stage: LibraryStageFilter) => void;
  onViewChange: (view: LibraryViewMode) => void;
  q: string;
  sort: LibrarySort;
  source: LibrarySource;
  stage: LibraryStageFilter;
  upload: ReactNode;
  view: LibraryViewMode;
}

const ViewToggle = ({
  onChange,
  value,
}: {
  onChange: (view: LibraryViewMode) => void;
  value: LibraryViewMode;
}) => (
  <div className="flex shrink-0 items-center gap-1">
    <Button
      aria-label="网格视图"
      aria-pressed={value === "grid"}
      onClick={() => {
        onChange("grid");
      }}
      size="icon-sm"
      variant={value === "grid" ? "secondary" : "ghost"}
    >
      <LayoutGridIcon />
    </Button>
    <Button
      aria-label="列表视图"
      aria-pressed={value === "list"}
      onClick={() => {
        onChange("list");
      }}
      size="icon-sm"
      variant={value === "list" ? "secondary" : "ghost"}
    >
      <ListIcon />
    </Button>
  </div>
);

const KindChips = ({
  onChange,
  value,
}: {
  onChange: (kind: LibraryKindFilter) => void;
  value: LibraryKindFilter;
}) => (
  <div className="flex flex-wrap items-center gap-1">
    {LIBRARY_KIND_FILTERS.map((filter) => (
      <Button
        aria-pressed={value === filter.value}
        key={filter.value}
        onClick={() => {
          onChange(filter.value);
        }}
        size="sm"
        variant={value === filter.value ? "secondary" : "ghost"}
      >
        {filter.label}
      </Button>
    ))}
  </div>
);

const SortSelect = ({
  onChange,
  value,
}: {
  onChange: (sort: LibrarySort) => void;
  value: LibrarySort;
}) => (
  <Select
    items={LIBRARY_SORT_OPTIONS.map((option) => ({
      label: option.label,
      value: option.value,
    }))}
    onValueChange={(next) => {
      const option = LIBRARY_SORT_OPTIONS.find((item) => item.value === next);

      if (option) {
        onChange(option.value);
      }
    }}
    value={value}
  >
    <SelectTrigger aria-label="排序方式" className="w-28" size="sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {LIBRARY_SORT_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const StageSelect = ({
  onChange,
  value,
}: {
  onChange: (stage: LibraryStageFilter) => void;
  value: LibraryStageFilter;
}) => (
  <Select
    items={LIBRARY_STAGE_OPTIONS.map((option) => ({
      label: option.label,
      value: option.value,
    }))}
    onValueChange={(next) => {
      const option = LIBRARY_STAGE_OPTIONS.find((item) => item.value === next);

      if (option) {
        onChange(option.value);
      }
    }}
    value={value}
  >
    <SelectTrigger aria-label="诊疗分期" className="w-28" size="sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {LIBRARY_STAGE_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const SearchInput = ({
  onChange,
  placeholder,
  value,
}: {
  onChange: (q: string) => void;
  placeholder: string;
  value: string;
}) => (
  <Input
    aria-label="搜索素材"
    className="min-w-0 flex-1"
    onChange={(event) => {
      onChange(event.target.value);
    }}
    placeholder={placeholder}
    type="search"
    value={value}
  />
);

/**
 * 资料库工具条。桌面两行（搜索/排序/视图 + 类型/分期/上传），
 * 移动端收成一行：搜索 + 视图切换 + 筛选抽屉。
 */
export const LibraryToolbar = ({
  kind,
  onKindChange,
  onQChange,
  onSortChange,
  onStageChange,
  onViewChange,
  q,
  sort,
  source,
  stage,
  upload,
  view,
}: LibraryToolbarProps) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilters =
    (kind === "all" ? 0 : 1) +
    (stage === "all" ? 0 : 1) +
    (sort === "recent" ? 0 : 1);

  const showStage = source === "patients";

  return (
    <>
      <div className="hidden flex-col gap-2 md:flex">
        <div className="flex items-center gap-2">
          <SearchInput
            onChange={onQChange}
            placeholder="搜索文件名、描述、标签或部位…"
            value={q}
          />
          <SortSelect onChange={onSortChange} value={sort} />
          <ViewToggle onChange={onViewChange} value={view} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KindChips onChange={onKindChange} value={kind} />
          {showStage ? (
            <StageSelect onChange={onStageChange} value={stage} />
          ) : null}
          <div className="ml-auto">{upload}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <SearchInput onChange={onQChange} placeholder="搜索素材…" value={q} />
        <ViewToggle onChange={onViewChange} value={view} />
        <Button
          onClick={() => {
            setFiltersOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          <SlidersHorizontalIcon />
          筛选
          {activeFilters > 0 ? (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.65rem] tabular-nums">
              {activeFilters}
            </span>
          ) : null}
        </Button>
      </div>

      <Sheet onOpenChange={setFiltersOpen} open={filtersOpen}>
        <SheetContent className="max-h-[85svh] overflow-y-auto" side="bottom">
          <SheetHeader>
            <SheetTitle>筛选与上传</SheetTitle>
            <SheetDescription>当前分类：{sourceLabel(source)}</SheetDescription>
          </SheetHeader>

          <div className="grid gap-4 px-4">
            <div className="grid gap-2">
              <p className="text-sm font-medium">类型</p>
              <KindChips onChange={onKindChange} value={kind} />
            </div>

            {showStage ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">诊疗分期</p>
                <StageSelect onChange={onStageChange} value={stage} />
              </div>
            ) : null}

            <div className="grid gap-2">
              <p className="text-sm font-medium">排序</p>
              <SortSelect onChange={onSortChange} value={sort} />
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-medium">上传</p>
              {upload}
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={() => {
                setFiltersOpen(false);
              }}
            >
              完成
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
