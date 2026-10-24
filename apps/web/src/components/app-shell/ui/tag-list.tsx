import { cn } from "@medihub/ui/lib/utils";

interface TagListProps {
  tags: readonly string[];
  /** 最多展示几个，超出显示 +N */
  max?: number;
  emptyText?: string;
  className?: string;
}

export const TagList = ({
  tags,
  max = 3,
  emptyText = "无标签",
  className,
}: TagListProps) => {
  if (tags.length === 0) {
    return <span className="text-muted-foreground text-xs">{emptyText}</span>;
  }

  const visibleTags = tags.slice(0, max);
  const restCount = tags.length - visibleTags.length;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visibleTags.map((tag) => (
        <span
          className="bg-secondary text-secondary-foreground inline-flex h-5 items-center rounded-md px-1.5 text-xs whitespace-nowrap"
          key={tag}
        >
          {tag}
        </span>
      ))}
      {restCount > 0 ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          +{restCount}
        </span>
      ) : null}
    </div>
  );
};
