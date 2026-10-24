import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";
import { Checkbox } from "@medihub/ui/components/checkbox";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { cn } from "@medihub/ui/lib/utils";

import { visibilityOptions } from "./post-utils.ts";

export interface PostFiltersState {
  mine: boolean;
  q: string;
  status: string;
  visibility: string;
}

export const defaultPostFilters: PostFiltersState = {
  mine: false,
  q: "",
  status: "all",
  visibility: "all",
};

const STATUS_ITEMS = [
  { label: "全部状态", value: "all" },
  { label: "草稿", value: "draft" },
  { label: "已发布", value: "published" },
] as const;

const VISIBILITY_ITEMS = [
  { label: "全部范围", value: "all" },
  ...visibilityOptions.map((option) => ({
    label: option.label,
    value: option.value,
  })),
] as const;

interface PostFiltersProps {
  className?: string;
  onChange: (patch: Partial<PostFiltersState>) => void;
  value: PostFiltersState;
}

/** 列表筛选：关键词、状态、可见范围、只看我的。 */
export const PostFilters = ({
  className,
  onChange,
  value,
}: PostFiltersProps) => {
  const hasFilters =
    value.mine ||
    value.q.trim().length > 0 ||
    value.status !== "all" ||
    value.visibility !== "all";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center",
        className
      )}
    >
      <div className="relative min-w-0 flex-1 sm:min-w-56">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          aria-label="搜索文章"
          className="pl-8"
          onChange={(event) => {
            onChange({ q: event.target.value });
          }}
          placeholder="搜索标题或摘要"
          value={value.q}
        />
        {value.q.length > 0 ? (
          <button
            aria-label="清空搜索"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm transition-colors"
            onClick={() => {
              onChange({ q: "" });
            }}
            type="button"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      <Select
        items={STATUS_ITEMS}
        onValueChange={(next) => {
          if (next) {
            onChange({ status: next });
          }
        }}
        value={value.status}
      >
        <SelectTrigger aria-label="按状态筛选" className="w-full sm:w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={VISIBILITY_ITEMS}
        onValueChange={(next) => {
          if (next) {
            onChange({ visibility: next });
          }
        }}
        value={value.visibility}
      >
        <SelectTrigger aria-label="按可见范围筛选" className="w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VISIBILITY_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="text-muted-foreground flex h-8 items-center gap-2 text-sm whitespace-nowrap">
        <Checkbox
          checked={value.mine}
          onCheckedChange={(checked) => {
            onChange({ mine: checked });
          }}
        />
        只看我的
      </label>

      {hasFilters ? (
        <Button
          onClick={() => {
            onChange(defaultPostFilters);
          }}
          size="sm"
          variant="ghost"
        >
          <SlidersHorizontalIcon />
          清除筛选
        </Button>
      ) : null}
    </div>
  );
};
