import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Checkbox } from "@medihub/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { usePatientBulkExport } from "#src/components/patients/patient-bulk-export.ts";
import { api } from "#src/lib/api.ts";
import { formatBytes } from "#src/lib/format.ts";

interface PatientBulkDeleteDialogProps {
  ids: readonly string[];
  onClose: () => void;
  onDeleted: () => void;
}

const summaryLine = (input: {
  patientCount: number;
  admissionCount: number;
  assetCount: number;
  assetBytes: number;
}) =>
  `${input.patientCount} 位患者 / ${input.admissionCount} 次就诊 / ${input.assetCount} 个媒体文件 / ${formatBytes(input.assetBytes)}`;

/** 批量删除前的确认对话框：先拉统计、可选是否删文件，并提供「先导出再删除」。 */
export const PatientBulkDeleteDialog = ({
  ids,
  onClose,
  onDeleted,
}: PatientBulkDeleteDialogProps) => {
  const queryClient = useQueryClient();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const { exportPatients, exporting } = usePatientBulkExport();

  const summaryQuery = useQuery(
    api.patients.batchSummary.queryOptions({ input: { ids: [...ids] } })
  );

  const deleteMutation = useMutation(
    api.patients.bulkDelete.mutationOptions({
      onSuccess: async (result) => {
        // 先关掉对话框，避免按选中 id 的 batchSummary 在失效时再请求一次已删除的患者。
        onClose();

        await queryClient.invalidateQueries({
          queryKey: api.patients.list.key(),
        });

        const fileSummary =
          result.files.failed > 0
            ? `；${result.files.failed} 个媒体文件删除失败`
            : result.files.deleted > 0
              ? `；已删除 ${result.files.deleted} 个媒体文件（${formatBytes(result.files.bytes)}）`
              : "；媒体文件已保留在存储中";

        toast.success(`已删除 ${result.deleted} 位患者${fileSummary}`);
        onDeleted();
      },
    })
  );

  const busy = deleteMutation.isPending || exporting;
  const totals = summaryQuery.data?.totals;
  const names = summaryQuery.data?.items.map((item) => item.name) ?? [];

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>删除 {ids.length} 位患者？</DialogTitle>
          <DialogDescription>
            患者档案、就诊记录与媒体记录都会被删除，且无法恢复。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1 rounded-lg border p-3">
            <p className="text-sm font-medium">将删除的内容</p>
            {summaryQuery.isPending ? (
              <Skeleton className="h-4 w-56" />
            ) : totals ? (
              <p className="text-muted-foreground text-sm tabular-nums">
                {summaryLine(totals)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                统计加载失败，仍可直接删除（媒体文件是否随之删除取决于下面的选项）。
              </p>
            )}
            {names.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {names.slice(0, 5).join("、")}
                {names.length > 5 ? ` 等 ${names.length} 位` : ""}
              </p>
            ) : null}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={deleteFiles}
              id="patient-bulk-delete-files"
              onCheckedChange={(checked) => {
                setDeleteFiles(checked);
              }}
            />
            <span>同时删除存储中的媒体文件（不可恢复）</span>
          </label>
          <p className="text-muted-foreground text-xs text-pretty">
            不勾选时：数据库记录会删除，但媒体文件仍留在存储中成为孤儿文件，建议先导出。
            已归档素材的文件本身已移走，会跳过。
          </p>
        </div>

        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end max-sm:[&_button]:min-h-11">
          <Button
            disabled={busy}
            onClick={onClose}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void exportPatients(ids);
            }}
            type="button"
            variant="secondary"
          >
            <DownloadIcon />
            {exporting ? "创建中…" : "先导出再删除"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              deleteMutation.mutate({ deleteFiles, ids: [...ids] });
            }}
            type="button"
            variant="destructive"
          >
            <Trash2Icon />
            {deleteMutation.isPending
              ? "删除中…"
              : `确认删除 ${ids.length} 位患者`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
