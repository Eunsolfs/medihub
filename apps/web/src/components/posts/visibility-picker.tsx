import { cn } from "@medihub/ui/lib/utils";

import { visibilityOptionOf, visibilityOptionsForRole } from "./post-utils.ts";
import type { PostVisibility } from "./post-utils.ts";

interface VisibilityPickerProps {
  disabled?: boolean;
  onChange: (value: PostVisibility) => void;
  role: string | null | undefined;
  value: PostVisibility;
}

/**
 * 五档可见范围，按角色收敛可选项；「指定对象」的具体名单由 AudienceSelector 展开。
 * 若当前文章的范围超出当前角色（例如 root 指定的跨科室帖子被科室管理员打开），
 * 仍把当前值显示出来但置灰，避免静默改成别的范围。
 */
export const VisibilityPicker = ({
  disabled = false,
  onChange,
  role,
  value,
}: VisibilityPickerProps) => {
  const allowedOptions = visibilityOptionsForRole(role);
  const current = visibilityOptionOf(value);

  const outOfScope =
    current !== undefined &&
    !allowedOptions.some((option) => option.value === current.value);

  const options =
    outOfScope && current ? [...allowedOptions, current] : allowedOptions;

  return (
    <div className="grid gap-2">
      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="sr-only">可见范围</legend>
        {options.map((option) => {
          const Icon = option.icon;
          const checked = value === option.value;
          const locked = outOfScope && option.value === value;

          return (
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                checked ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                (disabled || locked) && "cursor-not-allowed opacity-60"
              )}
              key={option.value}
            >
              <input
                checked={checked}
                className="accent-primary mt-0.5 size-3.5 shrink-0"
                disabled={locked}
                name="post-visibility"
                onChange={() => {
                  onChange(option.value);
                }}
                type="radio"
                value={option.value}
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <Icon
                    aria-hidden="true"
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                  {option.label}
                </span>
                <span className="text-muted-foreground text-xs leading-relaxed break-words">
                  {locked
                    ? "当前设置超出你的角色范围，改选其他范围后才能保存。"
                    : option.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
        「指定对象」可以精确到科室或成员；角色权限越高，可选范围越大。
      </p>
    </div>
  );
};
