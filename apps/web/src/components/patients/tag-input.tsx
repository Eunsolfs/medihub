import { XIcon } from "lucide-react";
import { useState } from "react";

import { Input } from "@medihub/ui/components/input";

interface TagInputProps {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  /** 与后端一致：最多 20 个标签，单个标签最长 20 字。 */
  max?: number;
  ariaLabel?: string;
}

/** 可增删的标签 chip 输入：回车或逗号提交，退格删除最后一个。 */
export const TagInput = ({
  value,
  onChange,
  placeholder = "输入标签后回车",
  max = 20,
  ariaLabel = "标签",
}: TagInputProps) => {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim().slice(0, 20);

    if (!tag) {
      return;
    }

    if (value.includes(tag) || value.length >= max) {
      setDraft("");

      return;
    }

    onChange([...value, tag]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li
              className="bg-secondary text-secondary-foreground inline-flex h-6 items-center gap-1 rounded-md pr-1 pl-2 text-xs"
              key={tag}
            >
              {tag}
              <button
                aria-label={`移除标签 ${tag}`}
                className="hover:text-destructive focus-visible:ring-ring/50 rounded p-0.5 focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => {
                  removeTag(tag);
                }}
                type="button"
              >
                <XIcon aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        aria-label={ariaLabel}
        maxLength={20}
        onBlur={() => {
          addTag(draft);
        }}
        onChange={(event) => {
          const next = event.target.value;

          if (next.includes(",") || next.includes("，")) {
            for (const segment of next.split(/[,，]/u)) {
              addTag(segment);
            }

            return;
          }

          setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();

            if (!event.nativeEvent.isComposing) {
              addTag(draft);
            }

            return;
          }

          if (event.key === "Backspace" && draft === "" && value.length > 0) {
            const lastTag = value.at(-1);

            if (lastTag) {
              removeTag(lastTag);
            }
          }
        }}
        placeholder={placeholder}
        value={draft}
      />
    </div>
  );
};
