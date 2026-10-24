import { Skeleton } from "@medihub/ui/components/skeleton";

/**
 * 路由切换时的占位：保持页面的基本骨架（标题 + 卡片），
 * 避免「先整块空白、再突然出现」的闪烁。
 */
export const PageSkeleton = () => (
  <div aria-busy="true" aria-live="polite" className="grid gap-6">
    <div className="grid gap-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton className="h-24 w-full rounded-xl" key={index} />
      ))}
    </div>
    <div className="grid gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton className="h-12 w-full rounded-lg" key={index} />
      ))}
    </div>
    <span className="sr-only">页面加载中</span>
  </div>
);
