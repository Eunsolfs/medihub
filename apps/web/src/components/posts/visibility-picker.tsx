import { cn } from "@medihub/ui/lib/utils";

import type { VisibilityKey } from "#src/lib/format.ts";

import { visibilityOptions } from "./post-utils.ts";

interface VisibilityPickerProps {
  disabled?: boolean;
  onChange: (value: VisibilityKey) => void;
  value: VisibilityKey;
}

/** 四种可见范围，每项配一句说明，让作者清楚链接发出去谁能看。 */
export const VisibilityPicker = ({
  disabled = false,
  onChange,
  value,
}: VisibilityPickerProps) => (
  <fieldset className="grid gap-2" disabled={disabled}>
    <legend className="sr-only">可见范围</legend>
    {visibilityOptions.map((option) => {
      const Icon = option.icon;
      const checked = value === option.value;

      return (
        <label
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
            checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
            disabled && "cursor-not-allowed opacity-60"
          )}
          key={option.value}
        >
          <input
            checked={checked}
            className="accent-primary mt-0.5 size-3.5 shrink-0"
            name="post-visibility"
            onChange={() => {
              onChange(option.value);
            }}
            type="radio"
            value={option.value}
          />
          <span className="grid gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Icon
                aria-hidden="true"
                className="text-muted-foreground size-3.5"
              />
              {option.label}
            </span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {option.description}
            </span>
          </span>
        </label>
      );
    })}
  </fieldset>
);
