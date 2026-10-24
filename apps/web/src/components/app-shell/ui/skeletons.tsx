import { Skeleton } from "@medihub/ui/components/skeleton";
import { cn } from "@medihub/ui/lib/utils";

const buildIndexes = (length: number): number[] =>
  Array.from({ length }, (_, index) => index);

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/**
 * 列表加载态：桌面骨架表格，窄屏自动切换为卡片骨架，
 * 与 DataTableShell 的降级形态保持一致，避免加载完成时布局跳动。
 */
export const SkeletonTable = ({
  rows = 6,
  columns = 4,
  className,
}: SkeletonTableProps) => {
  const columnIndexes = buildIndexes(columns);
  const rowIndexes = buildIndexes(rows);

  return (
    <div aria-busy="true" className={cn("grid gap-2", className)}>
      <span className="sr-only">正在加载数据</span>
      <div className="bg-muted/50 hidden h-9 items-center gap-4 rounded-md px-4 md:flex">
        {columnIndexes.map((index) => (
          <Skeleton className="h-3 max-w-16 flex-1" key={index} />
        ))}
      </div>
      {rowIndexes.map((row) => (
        <div
          className="hidden items-center gap-4 border-b px-4 py-3 last:border-0 md:flex"
          key={`row-${row}`}
        >
          {columnIndexes.map((column) => (
            <Skeleton
              className={cn(
                "h-4 flex-1",
                column === 0 ? "max-w-40" : "max-w-24"
              )}
              key={`cell-${row}-${column}`}
            />
          ))}
        </div>
      ))}
      {rowIndexes.map((row) => (
        <div className="rounded-xl border p-4 md:hidden" key={`card-${row}`}>
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="grid gap-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface LoadingRowsProps {
  rows?: number;
  className?: string;
}

export const LoadingRows = ({ rows = 3, className }: LoadingRowsProps) => (
  <div aria-busy="true" className={cn("grid gap-2", className)}>
    <span className="sr-only">正在加载</span>
    {buildIndexes(rows).map((index) => (
      <Skeleton className="h-10 w-full" key={index} />
    ))}
  </div>
);
