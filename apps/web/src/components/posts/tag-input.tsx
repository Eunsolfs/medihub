import { XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@medihub/ui/components/input";
import { cn } from "@medihub/ui/lib/utils";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 20;
const TAG_SEPARATOR = /[,，;；\s]+/u;

interface TagInputProps {
  className?: string;
  disabled?: boolean;
  onChange: (tags: string[]) => void;
  value: readonly string[];
}

/** 标签 chip：回车 / 逗号 / 空格分隔，点 × 删除。 */
export const TagInput = ({
  className,
  disabled = false,
  onChange,
  value,
}: TagInputProps) => {
  const [input, setInput] = useState("");

  const addTags = (raw: string) => {
    const parts = raw
      .split(TAG_SEPARATOR)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      return;
    }

    const next = [...value];

    for (const part of parts) {
      if (next.length >= MAX_TAGS) {
        toast.error(`最多添加 ${MAX_TAGS} 个标签`);
        break;
      }

      const tag = part.slice(0, MAX_TAG_LENGTH);

      if (!next.includes(tag)) {
        next.push(tag);
      }
    }

    onChange(next);
    setInput("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-ring/50 flex flex-wrap items-center gap-1.5 rounded-lg border p-1.5 transition-colors focus-within:ring-3",
        className
      )}
    >
      {value.map((tag) => (
        <span
          className="bg-secondary text-secondary-foreground inline-flex h-6 items-center gap-1 rounded-md pr-1 pl-2 text-xs"
          key={tag}
        >
          {tag}
          <button
            aria-label={`移除标签 ${tag}`}
            className="hover:bg-foreground/10 grid size-4 place-items-center rounded-sm transition-colors disabled:opacity-50"
            disabled={disabled}
            onClick={() => {
              removeTag(tag);
            }}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}
      <Input
        aria-label="添加标签"
        className="h-6 min-w-24 flex-1 border-0 bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
        disabled={disabled}
        onChange={(event) => {
          setInput(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            addTags(input);

            return;
          }

          if (
            event.key === "Backspace" &&
            input.length === 0 &&
            value.length > 0
          ) {
            const lastTag = value.at(-1);

            if (lastTag) {
              removeTag(lastTag);
            }
          }
        }}
        placeholder={value.length === 0 ? "输入后回车，如：皮瓣 / 瘢痕" : ""}
        value={input}
      />
    </div>
  );
};
