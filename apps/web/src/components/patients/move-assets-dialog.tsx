import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Label } from "@medihub/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import type { AdmissionSummary } from "#src/components/patients/types.ts";
import { api } from "#src/lib/api.ts";
import { admissionKindLabel, formatDate } from "#src/lib/format.ts";

const REMOVE_FROM_ADMISSION = "none";

interface MoveAssetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: readonly string[];
  currentAdmissionId: string | null;
  admissions: readonly AdmissionSummary[];
  onMoved: () => void;
}

/** 把选中的素材移动到该患者的另一次就诊，或仅保留在患者档案下。 */
export const MoveAssetsDialog = ({
  open,
  onOpenChange,
  assetIds,
  currentAdmissionId,
  admissions,
  onMoved,
}: MoveAssetsDialogProps) => {
  const queryClient = useQueryClient();

  const candidates = admissions.filter(
    (admission) => admission.id !== currentAdmissionId
  );

  const [target, setTarget] = useState<string>(
    candidates[0]?.id ?? REMOVE_FROM_ADMISSION
  );

  const moveMutation = useMutation(
    api.assets.move.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: api.assets.key() }),
          queryClient.invalidateQueries({ queryKey: api.patients.key() }),
        ]);
        toast.success("已移动素材");
        onMoved();
        onOpenChange(false);
      },
    })
  );

  const items = [
    ...candidates.map((admission) => ({
      label: `${admissionKindLabel(admission.kind)} · ${formatDate(admission.admittedAt)} · ${admission.diagnosis ?? "未填写诊断"}`,
      value: admission.id,
    })),
    { label: "移出就诊（仅保留在患者档案）", value: REMOVE_FROM_ADMISSION },
  ];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>移动 {assetIds.length} 个素材</DialogTitle>
          <DialogDescription>
            素材仍属于当前患者，只是挂到另一次就诊下，便于时间线归位。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="move-target">目标就诊</Label>
          <Select
            items={items}
            onValueChange={(value) => {
              if (value) {
                setTarget(value);
              }
            }}
            value={target}
          >
            <SelectTrigger className="w-full" id="move-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {candidates.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              该患者还没有其它就诊记录，可先新建一次就诊再移动。
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={moveMutation.isPending}
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={moveMutation.isPending || assetIds.length === 0}
            onClick={() => {
              moveMutation.mutate({
                admissionId: target === REMOVE_FROM_ADMISSION ? null : target,
                ids: [...assetIds],
              });
            }}
            type="button"
          >
            {moveMutation.isPending ? "移动中…" : "确认移动"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
