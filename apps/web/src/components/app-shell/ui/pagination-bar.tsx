import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const PaginationBar = ({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: PaginationBarProps) => {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 sm:flex-row",
        className
      )}
    >
      <p className="text-muted-foreground text-xs">
        共{" "}
        <span className="text-foreground font-medium tabular-nums">
          {total}
        </span>{" "}
        条 · 第{" "}
        <span className="text-foreground font-medium tabular-nums">{page}</span>
        /<span className="tabular-nums">{pageCount}</span> 页
      </p>
      <div className="flex items-center gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => {
            onPageChange(page - 1);
          }}
          size="sm"
          variant="outline"
        >
          <ChevronLeftIcon />
          上一页
        </Button>
        <Button
          disabled={page >= pageCount}
          onClick={() => {
            onPageChange(page + 1);
          }}
          size="sm"
          variant="outline"
        >
          下一页
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
};
