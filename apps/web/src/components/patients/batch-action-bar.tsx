import { DownloadIcon, FolderInputIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

interface BatchActionBarProps {
  count: number;
  onClear: () => void;
  onMove: () => void;
  onDownload: () => void;
  onDelete: () => void;
}

/**
 * 批量选择后的操作条：移动端固定在底部导航之上，桌面端作为内容区的一行。
 */
export const BatchActionBar = ({
  count,
  onClear,
  onMove,
  onDownload,
  onDelete,
}: BatchActionBarProps) => (
  <div
    className="bg-popover fixed inset-x-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center gap-2 rounded-xl border p-2 shadow-lg md:static md:inset-auto md:z-auto md:shadow-none"
    role="toolbar"
    aria-label="批量操作"
  >
    <p className="px-1 text-sm font-medium">
      已选 <span className="tabular-nums">{count}</span> 项
    </p>
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      <Button onClick={onDownload} size="sm" variant="outline">
        <DownloadIcon />
        下载
      </Button>
      <Button onClick={onMove} size="sm" variant="outline">
        <FolderInputIcon />
        移动
      </Button>
      <Button onClick={onDelete} size="sm" variant="destructive">
        <Trash2Icon />
        删除
      </Button>
      <Button
        aria-label="取消选择"
        onClick={onClear}
        size="icon-sm"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  </div>
);
