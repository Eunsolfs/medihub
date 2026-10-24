import {
  DownloadIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@medihub/ui/components/button";
import { Progress } from "@medihub/ui/components/progress";

import { uploadFile } from "#src/lib/upload.ts";
import type { UploadedAsset } from "#src/lib/upload.ts";

import type { MediaAsset } from "./types.ts";
import { assetDownloadUrl, uploadTargetFromAsset } from "./types.ts";
import { useAssetArrayBuffer } from "./use-file-resource.ts";

interface SheetData {
  name: string;
  rows: string[][];
}

/** 只渲染前若干行列，避免超大表格卡死；保存时仍写回完整数据。 */
const VISIBLE_ROWS = 300;
const VISIBLE_COLS = 40;

/** 单元格值转文本：只接受可读标量，避免对象被 String() 成 "[object Object]"。 */
const cellText = (cell: unknown) => {
  if (typeof cell === "string") {
    return cell;
  }

  if (typeof cell === "number" || typeof cell === "boolean") {
    return String(cell);
  }

  if (cell instanceof Date) {
    return cell.toLocaleDateString("zh-CN");
  }

  return "";
};

const toMatrix = (sheet: XLSX.WorkSheet): string[][] => {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    blankrows: false,
    defval: "",
    header: 1,
    raw: false,
  });

  return raw.map((row) => row.map(cellText));
};

const parseWorkbook = (data: ArrayBuffer): SheetData[] | null => {
  try {
    const workbook = XLSX.read(new Uint8Array(data), {
      cellDates: true,
      type: "array",
    });

    return workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];

      return { name, rows: sheet ? toMatrix(sheet) : [] };
    });
  } catch {
    return null;
  }
};

const xlsxName = (name: string) =>
  /\.(?<ext>xlsx|xlsm)$/iu.test(name)
    ? name
    : `${name.replace(/\.[^.]+$/u, "") || "表格"}.xlsx`;

const inlineInputClass =
  "h-8 w-full min-w-24 border-0 bg-transparent px-1.5 text-sm outline-none focus:bg-background";

export interface SpreadsheetViewerProps {
  asset: MediaAsset;
  enabled: boolean;
  onUploaded?: (asset: UploadedAsset) => void;
}

/** 下载整份表格，交给下面的可交互内容组件解析；解析结果与编辑状态都随组件挂载初始化。 */
export const SpreadsheetViewer = ({
  asset,
  enabled,
  onUploaded,
}: SpreadsheetViewerProps) => {
  const buffer = useAssetArrayBuffer(asset.id, enabled);

  if (buffer.status === "loading") {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        正在解析表格…
      </div>
    );
  }

  if (buffer.status === "error") {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        {buffer.message}
      </div>
    );
  }

  return (
    <SpreadsheetContent
      asset={asset}
      data={buffer.data}
      key={asset.id}
      onUploaded={onUploaded}
    />
  );
};

interface SpreadsheetContentProps {
  asset: MediaAsset;
  data: ArrayBuffer;
  onUploaded?: (asset: UploadedAsset) => void;
}

/** xlsx 只读表格（可切 sheet）；「在线编辑」切到可编辑网格，保存时写回 xlsx 并上传为新版本。 */
const SpreadsheetContent = ({
  asset,
  data,
  onUploaded,
}: SpreadsheetContentProps) => {
  const parsed = useMemo(() => parseWorkbook(data), [data]);
  const [sheets, setSheets] = useState<SheetData[]>(() => parsed ?? []);

  const [activeName, setActiveName] = useState<string | null>(
    () => parsed?.[0]?.name ?? null
  );

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [savePercent, setSavePercent] = useState(0);

  const activeSheet = useMemo(
    () =>
      sheets.find((sheet) => sheet.name === activeName) ?? sheets[0] ?? null,
    [activeName, sheets]
  );

  const visibleRows = activeSheet?.rows.slice(0, VISIBLE_ROWS) ?? [];

  const columnCount = Math.min(
    VISIBLE_COLS,
    Math.max(1, ...visibleRows.map((row) => row.length))
  );

  const truncated =
    (activeSheet?.rows.length ?? 0) > VISIBLE_ROWS ||
    (activeSheet?.rows.some((row) => row.length > VISIBLE_COLS) ?? false);

  const setCell = (rowIndex: number, columnIndex: number, value: string) => {
    setSheets((current) =>
      current.map((sheet) =>
        sheet.name === activeSheet?.name
          ? {
              ...sheet,
              rows: sheet.rows.map((row, r) =>
                r === rowIndex
                  ? row.map((cell, c) => (c === columnIndex ? value : cell))
                  : row
              ),
            }
          : sheet
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSavePercent(0);
      const workbook = XLSX.utils.book_new();

      for (const sheet of sheets) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet(sheet.rows),
          sheet.name
        );
      }

      // xlsx 的 write 声明为 any；type=array 实际返回 ArrayBuffer，运行时逐个判断。
      const output: unknown = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      const bytes =
        output instanceof ArrayBuffer
          ? output
          : output instanceof Uint8Array && output.buffer instanceof ArrayBuffer
            ? output.buffer
            : null;

      if (!bytes) {
        throw new Error("生成表格文件失败");
      }

      const type =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      const file = new File([bytes], xlsxName(asset.originalName), { type });

      const uploaded = await uploadFile(
        file,
        uploadTargetFromAsset(asset),
        setSavePercent
      );

      toast.success("已保存为新版本");
      onUploaded?.(uploaded);
      setMode("view");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "保存新版本失败，请重试"
      );
    } finally {
      setSaving(false);
      setSavePercent(0);
    }
  };

  // handleSave 内部已提示错误；这里再挂一个 catch，避免按钮点击产生未处理的 rejection。
  const handleSaveClick = () => {
    handleSave().catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "保存新版本失败，请重试"
      );
    });
  };

  if (!parsed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">无法解析该表格文件</p>
        <p className="text-muted-foreground text-xs">
          请下载后用本地 Excel 打开。
        </p>
        <a
          className="text-primary text-sm underline underline-offset-2"
          download={asset.originalName}
          href={assetDownloadUrl(asset.id)}
        >
          下载原文件
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {sheets.map((sheet) => (
            <Button
              key={sheet.name}
              type="button"
              variant={sheet.name === activeSheet?.name ? "secondary" : "ghost"}
              size="xs"
              onClick={() => {
                setActiveName(sheet.name);
              }}
            >
              {sheet.name}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMode("edit");
              }}
            >
              <PencilIcon />
              在线编辑
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setMode("view");
                }}
              >
                <XIcon />
                取消编辑
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={handleSaveClick}
              >
                {saving ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <SaveIcon />
                )}
                {saving ? `保存中 ${savePercent}%` : "保存为新版本"}
              </Button>
            </>
          )}
        </div>
      </div>

      {mode === "edit" ? (
        <div className="border-border bg-muted/40 text-muted-foreground border-b px-3 py-1.5 text-xs">
          编辑单元格后保存会生成一个新素材版本（原文件保留）。
        </div>
      ) : null}

      {saving ? (
        <div className="px-3 py-2">
          <Progress value={savePercent} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="border-border text-muted-foreground w-12 border-b px-2 py-1.5 text-center text-xs font-medium">
                #
              </th>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <th
                  key={columnIndex}
                  className="border-border min-w-24 border-b px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap"
                >
                  {XLSX.utils.encode_col(columnIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  className="text-muted-foreground p-6 text-center text-sm"
                  colSpan={2}
                >
                  这个工作表没有内容
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rowIndex) => (
                <tr className="border-border/60 border-b" key={rowIndex}>
                  <td className="bg-muted/40 text-muted-foreground border-border/60 border-r px-2 py-1.5 text-center text-xs tabular-nums">
                    {rowIndex + 1}
                  </td>
                  {Array.from({ length: columnCount }, (_, columnIndex) => (
                    <td
                      key={columnIndex}
                      className="border-border/40 max-w-64 border-r p-0 align-top"
                    >
                      {mode === "edit" ? (
                        <input
                          value={row[columnIndex] ?? ""}
                          onChange={(event) => {
                            setCell(rowIndex, columnIndex, event.target.value);
                          }}
                          className={inlineInputClass}
                          aria-label={`单元格 ${XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex })}`}
                        />
                      ) : (
                        <span
                          title={row[columnIndex] ?? ""}
                          className="block max-w-64 truncate px-2 py-1.5"
                        >
                          {row[columnIndex] ?? ""}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-border text-muted-foreground flex flex-wrap items-center gap-2 border-t px-3 py-1.5 text-xs">
        {truncated ? (
          <span>
            仅显示前 {VISIBLE_ROWS} 行 × {VISIBLE_COLS} 列，保存时保留其余内容。
          </span>
        ) : (
          <span>
            {visibleRows.length} 行 · {sheets.length} 个工作表
          </span>
        )}
        <a
          href={assetDownloadUrl(asset.id)}
          className="text-primary ml-auto inline-flex items-center gap-1 hover:underline"
          download
        >
          <DownloadIcon className="size-3" />
          下载原文件
        </a>
      </div>
    </div>
  );
};
