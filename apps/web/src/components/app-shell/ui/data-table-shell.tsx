import type { ReactNode } from "react";

import { cn } from "@medihub/ui/lib/utils";

import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { SkeletonTable } from "#src/components/app-shell/ui/skeletons.tsx";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
  /** 移动端卡片里隐藏该列（如操作列、长文本列） */
  mobileHidden?: boolean;
}

interface DataTableShellProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** 工具栏内容：搜索框、筛选器、批量操作 */
  toolbar?: ReactNode;
  /** 工具栏右侧主操作：新建、导出 */
  actions?: ReactNode;
  emptyState?: ReactNode;
  /** 分页条，通常传入 PaginationBar */
  footer?: ReactNode;
  isLoading?: boolean;
  skeletonRows?: number;
  className?: string;
}

/**
 * 列表页统一容器：工具栏 + 表格 + 分页。
 * 桌面（≥768px）渲染表格，窄屏自动降级为卡片列表——移动端不出现横向滚动。
 * 行内跳转请把链接放在第一列（首列即移动端卡片标题），不要给整行加点击。
 */
export const DataTableShell = <T,>({
  columns,
  rows,
  rowKey,
  toolbar,
  actions,
  emptyState,
  footer,
  isLoading = false,
  skeletonRows,
  className,
}: DataTableShellProps<T>) => {
  const [primaryColumn] = columns;

  const detailColumns = columns
    .slice(1)
    .filter((column) => column.mobileHidden !== true);

  return (
    <section
      className={cn(
        "bg-card text-card-foreground ring-foreground/10 overflow-hidden rounded-xl text-sm ring-1",
        className
      )}
    >
      {toolbar === undefined && actions === undefined ? null : (
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">{toolbar}</div>
          {actions === undefined ? null : (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="p-4">
          <SkeletonTable columns={columns.length} rows={skeletonRows} />
        </div>
      ) : null}

      {!isLoading && rows.length === 0 ? (
        <div className="p-4">
          {emptyState ?? (
            <EmptyState
              compact
              description="调整筛选条件，或新建一条记录。"
              title="暂无数据"
            />
          )}
        </div>
      ) : null}

      {!isLoading && rows.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b">
                  {columns.map((column) => (
                    <th
                      className={cn(
                        "text-muted-foreground h-10 px-4 text-xs font-medium whitespace-nowrap",
                        column.align === "right" ? "text-right" : "text-left"
                      )}
                      key={column.key}
                      scope="col"
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    className="hover:bg-muted/40 border-b transition-colors last:border-0"
                    key={rowKey(row)}
                  >
                    {columns.map((column) => (
                      <td
                        className={cn(
                          "px-4 py-3 align-middle",
                          column.align === "right" ? "text-right" : "text-left",
                          column.className
                        )}
                        key={column.key}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-border divide-y md:hidden">
            {rows.map((row) => (
              <li key={rowKey(row)}>
                <div className="grid gap-2 px-4 py-3.5">
                  <div className="text-sm font-medium">
                    {primaryColumn?.cell(row)}
                  </div>
                  {detailColumns.length > 0 ? (
                    <dl className="grid gap-1.5">
                      {detailColumns.map((column) => (
                        <div
                          className="flex items-start justify-between gap-4"
                          key={column.key}
                        >
                          <dt className="text-muted-foreground shrink-0 text-xs">
                            {column.header}
                          </dt>
                          <dd className="min-w-0 text-right text-sm">
                            {column.cell(row)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {footer === undefined ? null : (
        <div className="border-t px-4 py-2.5">{footer}</div>
      )}
    </section>
  );
};
