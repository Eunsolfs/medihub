import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { api } from "#src/lib/api.ts";

/**
 * 批量导出：每个患者创建一个导出任务（kind=patient, includeFiles）。
 * 导出中心负责实际打包与下载，这里只负责排队 + 提示入口。
 */
export const usePatientBulkExport = () => {
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: async (patientIds: readonly string[]) => {
      for (const patientId of patientIds) {
        await api.exports.create.call({
          includeFiles: true,
          kind: "patient",
          patientId,
        });
      }

      return patientIds.length;
    },
    onSuccess: (count) => {
      toast.success(`已创建 ${count} 个导出任务，可在导出中心下载`, {
        action: {
          label: "去导出中心",
          onClick: () => {
            void navigate({ to: "/exports" });
          },
        },
      });
    },
  });

  return {
    exportPatients: mutation.mutateAsync,
    exporting: mutation.isPending,
  };
};
