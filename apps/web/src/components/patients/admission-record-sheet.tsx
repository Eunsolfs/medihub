import { PencilIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import { Markdown } from "#src/components/media/index.ts";
import {
  RecordField,
  RecordGroup,
  RecordSheet,
} from "#src/components/patients/record-sheet.tsx";
import type {
  AdmissionRecord,
  AdmissionSummary,
} from "#src/components/patients/types.ts";
import {
  admissionKindLabel,
  formatDate,
  formatDateTime,
} from "#src/lib/format.ts";

interface AdmissionRecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 摘要行：在完整记录加载完成前也能显示主要信息。 */
  admission: AdmissionSummary | null;
  record: AdmissionRecord | null;
  isLoading?: boolean;
  onEdit: () => void;
}

/** 一次就诊的全部资料：基本信息 / 诊疗信息 / 完整病历摘要 / 标签与备注。 */
export const AdmissionRecordSheet = ({
  open,
  onOpenChange,
  admission,
  record,
  isLoading = false,
  onEdit,
}: AdmissionRecordSheetProps) => {
  const summary = record?.summary?.trim() ?? "";
  const tags = record?.tags ?? admission?.tags ?? [];
  const doctor = record?.attendingDoctor;

  return (
    <RecordSheet
      description={
        admission
          ? `${admissionKindLabel(admission.kind)} · ${formatDate(admission.admittedAt)} 起`
          : "本次就诊的全部资料"
      }
      footer={
        <>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            type="button"
            variant="outline"
          >
            关闭
          </Button>
          <Button onClick={onEdit} type="button">
            <PencilIcon />
            编辑全部
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title="就诊全部资料"
    >
      {isLoading ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="grid gap-5">
          <RecordGroup title="基本信息">
            <RecordField
              label="就诊类型"
              value={admissionKindLabel(record?.kind ?? admission?.kind)}
            />
            <RecordField
              label="住院号 / 门诊号"
              value={record?.admissionNo ?? admission?.admissionNo}
            />
            <RecordField
              label="入院时间"
              value={formatDateTime(
                record?.admittedAt ?? admission?.admittedAt
              )}
            />
            <RecordField
              label="出院时间"
              value={formatDateTime(
                record?.dischargedAt ?? admission?.dischargedAt
              )}
            />
            <RecordField
              label="科室"
              value={record?.department ?? admission?.department}
            />
            <RecordField label="主治医生" value={doctor} />
          </RecordGroup>

          <RecordGroup title="诊疗信息">
            <RecordField
              label="诊断"
              multiline
              value={record?.diagnosis ?? admission?.diagnosis}
              wide
            />
            <RecordField
              label="主诉"
              multiline
              value={record?.chiefComplaint}
              wide
            />
            <RecordField
              label="治疗经过"
              multiline
              value={record?.treatment}
              wide
            />
          </RecordGroup>

          <section className="grid gap-2">
            <h3 className="text-muted-foreground text-xs font-medium">
              病历摘要
            </h3>
            <div className="rounded-lg border p-3">
              {summary ? (
                <Markdown content={summary} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  尚未填写病历摘要
                </p>
              )}
            </div>
          </section>

          <RecordGroup title="标签与备注">
            <RecordField
              label="标签"
              value={<TagList emptyText="暂无标签" max={20} tags={tags} />}
              wide
            />
            <RecordField label="备注" multiline value={record?.notes} wide />
          </RecordGroup>
        </div>
      )}
    </RecordSheet>
  );
};
