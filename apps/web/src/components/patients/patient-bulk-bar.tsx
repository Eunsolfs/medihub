import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, Trash2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import { patientStatusOptions } from "#src/components/patients/display.ts";
import { usePatientBulkExport } from "#src/components/patients/patient-bulk-export.ts";
import type { PatientStatus } from "#src/components/patients/types.ts";
import { api } from "#src/lib/api.ts";

interface PatientBulkBarProps {
  selectedIds: readonly string[];
  allSelected: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  onRequestDelete: () => void;
}

/** 列表页的批量操作条：改状态 / 导出所选 / 删除 / 取消选择。 */
export const PatientBulkBar = ({
  selectedIds,
  allSelected,
  onClear,
  onSelectAll,
  onRequestDelete,
}: PatientBulkBarProps) => {
  const queryClient = useQueryClient();
  const { exportPatients, exporting } = usePatientBulkExport();
  const [status, setStatus] = useState<PatientStatus | null>(null);

  const statusMutation = useMutation(
    api.patients.bulkStatus.mutationOptions({
      onSuccess: async (result) => {
        // 只刷新列表（含顶部统计），不波及 batchSummary 等按 id 的查询。
        await queryClient.invalidateQueries({
          queryKey: api.patients.list.key(),
        });
        toast.success(`已更新 ${result.updated} 位患者`);
        setStatus(null);
        onClear();
      },
    })
  );

  const busy = statusMutation.isPending || exporting;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          已选 <span className="tabular-nums">{selectedIds.length}</span> 位患者
        </span>
        <Button onClick={onSelectAll} size="sm" variant="ghost">
          {allSelected ? "取消全选" : "全选本页"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={patientStatusOptions}
          onValueChange={(value) => {
            if (!value) {
              return;
            }

            setStatus(value);
            statusMutation.mutate({ ids: [...selectedIds], status: value });
          }}
          value={status}
        >
          <SelectTrigger
            aria-label="批量修改状态"
            className="w-28"
            disabled={busy}
            size="sm"
          >
            <SelectValue placeholder="修改状态" />
          </SelectTrigger>
          <SelectContent>
            {patientStatusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          disabled={busy}
          onClick={() => {
            void exportPatients(selectedIds);
          }}
          size="sm"
          variant="outline"
        >
          <DownloadIcon />
          导出所选
        </Button>

        <Button
          disabled={busy}
          onClick={onRequestDelete}
          size="sm"
          variant="destructive"
        >
          <Trash2Icon />
          删除
        </Button>

        <Button onClick={onClear} size="sm" variant="ghost">
          <XIcon />
          取消选择
        </Button>
      </div>
    </div>
  );
};
