import { EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";

import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import {
  describePatient,
  maskIdCard,
} from "#src/components/patients/display.ts";
import { PatientStatusBadge } from "#src/components/patients/patient-status-badge.tsx";
import {
  RecordField,
  RecordGroup,
  RecordSheet,
} from "#src/components/patients/record-sheet.tsx";
import type { PatientRecord } from "#src/components/patients/types.ts";
import { useViewer } from "#src/components/patients/use-viewer.ts";
import { formatDate, formatDateTime } from "#src/lib/format.ts";

interface IdCardFieldProps {
  idCardNo: string | null;
  canReveal: boolean;
}

/** 抽屉里的身份证：默认掩码，管理员可切换显示原文。 */
const IdCardField = ({ idCardNo, canReveal }: IdCardFieldProps) => {
  const [revealed, setRevealed] = useState(false);
  const shown = revealed && canReveal;

  return (
    <RecordField
      label="身份证号"
      value={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">
            {shown ? idCardNo : maskIdCard(idCardNo)}
          </span>
          {canReveal && idCardNo ? (
            <Button
              onClick={() => {
                setRevealed((previous) => !previous);
              }}
              size="xs"
              type="button"
              variant="ghost"
            >
              {shown ? <EyeOffIcon /> : <EyeIcon />}
              {shown ? "隐藏" : "显示"}
            </Button>
          ) : null}
          {idCardNo && !canReveal ? (
            <span className="text-muted-foreground text-xs">仅管理员可见</span>
          ) : null}
        </span>
      }
      wide
    />
  );
};

interface PatientRecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: PatientRecord;
  onEdit: () => void;
}

/** 患者完整档案：基本资料 / 证件与状态 / 诊断与备注 / 标签与时间。 */
export const PatientRecordSheet = ({
  open,
  onOpenChange,
  patient,
  onEdit,
}: PatientRecordSheetProps) => {
  const { canManageIdCard } = useViewer();

  return (
    <RecordSheet
      description={
        patient.medicalRecordNo
          ? `病案号 ${patient.medicalRecordNo} · 建档于 ${formatDate(patient.createdAt)}`
          : `建档于 ${formatDate(patient.createdAt)}`
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
            编辑档案
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={patient.name}
    >
      <div className="grid gap-5">
        <RecordGroup title="基本信息">
          <RecordField label="姓名" value={patient.name} />
          <RecordField
            label="性别 / 年龄"
            value={describePatient(patient.gender, patient.birthDate)}
          />
          <RecordField label="出生日期" value={formatDate(patient.birthDate)} />
          <RecordField label="电话" value={patient.phone} mono />
          <RecordField label="病案号" value={patient.medicalRecordNo} mono />
        </RecordGroup>

        <RecordGroup title="证件与状态">
          <IdCardField
            canReveal={canManageIdCard}
            idCardNo={patient.idCardNo}
          />
          <RecordField
            label="状态"
            value={<PatientStatusBadge status={patient.status} />}
          />
        </RecordGroup>

        <RecordGroup title="诊断与备注">
          <RecordField
            label="诊断摘要"
            multiline
            value={patient.summary}
            wide
          />
          <RecordField label="备注" multiline value={patient.notes} wide />
        </RecordGroup>

        <RecordGroup title="标签与时间">
          <RecordField
            label="标签"
            value={
              <TagList emptyText="暂无标签" max={20} tags={patient.tags} />
            }
            wide
          />
          <RecordField
            label="建档时间"
            value={formatDateTime(patient.createdAt)}
          />
          <RecordField
            label="更新时间"
            value={formatDateTime(patient.updatedAt)}
          />
        </RecordGroup>
      </div>
    </RecordSheet>
  );
};
