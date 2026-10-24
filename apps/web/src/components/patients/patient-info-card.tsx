import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";
import { Separator } from "@medihub/ui/components/separator";

import { SectionCard } from "#src/components/app-shell/ui/section-card.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import {
  describePatient,
  maskIdCard,
} from "#src/components/patients/display.ts";
import { PatientStatusBadge } from "#src/components/patients/patient-status-badge.tsx";
import type { PatientRecord } from "#src/components/patients/types.ts";
import { useViewer } from "#src/components/patients/use-viewer.ts";
import { formatDate, formatRelative } from "#src/lib/format.ts";

interface InfoItemProps {
  label: string;
  children: React.ReactNode;
}

const InfoItem = ({ label, children }: InfoItemProps) => (
  <div className="grid gap-1">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="text-sm font-medium break-words">{children}</dd>
  </div>
);

interface IdCardItemProps {
  idCardNo: string | null;
  canReveal: boolean;
}

/** 身份证号默认掩码；只有科室管理员 / 超级管理员才能点「显示」看到完整值。 */
const IdCardItem = ({ idCardNo, canReveal }: IdCardItemProps) => {
  const [revealed, setRevealed] = useState(false);
  const shown = revealed && canReveal;

  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground flex items-center gap-1 text-xs">
        身份证号
        <LockIcon aria-hidden="true" className="size-3" />
      </dt>
      <dd className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm tracking-tight">
          {shown ? idCardNo : maskIdCard(idCardNo)}
        </span>
        {canReveal && idCardNo ? (
          <Button
            onClick={() => {
              setRevealed((previous) => !previous);
            }}
            size="xs"
            variant="ghost"
          >
            {shown ? <EyeOffIcon /> : <EyeIcon />}
            {shown ? "隐藏" : "显示"}
          </Button>
        ) : (
          <span className="text-muted-foreground text-xs">仅管理员可见</span>
        )}
      </dd>
    </div>
  );
};

interface PatientInfoCardProps {
  patient: PatientRecord;
}

/** 患者详情页顶部信息卡：基本资料、诊断摘要、标签与备注。 */
export const PatientInfoCard = ({ patient }: PatientInfoCardProps) => {
  const { canManageIdCard } = useViewer();

  return (
    <SectionCard
      contentClassName="grid gap-4"
      description={
        <>
          {patient.medicalRecordNo
            ? `病案号 ${patient.medicalRecordNo}`
            : "尚未填写病案号"}{" "}
          · 建档于 {formatDate(patient.createdAt)} ·{" "}
          {formatRelative(patient.updatedAt)}更新
        </>
      }
      title="患者信息"
    >
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <InfoItem label="姓名">{patient.name}</InfoItem>
        <InfoItem label="性别 / 年龄">
          {describePatient(patient.gender, patient.birthDate)}
        </InfoItem>
        <InfoItem label="出生日期">{formatDate(patient.birthDate)}</InfoItem>
        <InfoItem label="状态">
          <PatientStatusBadge status={patient.status} />
        </InfoItem>
        <InfoItem label="病案号">{patient.medicalRecordNo ?? "—"}</InfoItem>
        <InfoItem label="电话">{patient.phone ?? "—"}</InfoItem>
        <IdCardItem canReveal={canManageIdCard} idCardNo={patient.idCardNo} />
        <InfoItem label="更新时间">{formatDate(patient.updatedAt)}</InfoItem>
      </dl>

      <Separator />

      <div className="grid gap-1">
        <p className="text-muted-foreground text-xs">诊断摘要</p>
        <p className="text-sm text-pretty">
          {patient.summary ?? "尚未填写诊断摘要"}
        </p>
      </div>

      {patient.notes ? (
        <div className="grid gap-1">
          <p className="text-muted-foreground text-xs">备注</p>
          <p className="text-sm text-pretty whitespace-pre-wrap">
            {patient.notes}
          </p>
        </div>
      ) : null}

      <div className="grid gap-1">
        <p className="text-muted-foreground text-xs">标签</p>
        <TagList emptyText="暂无标签" max={20} tags={patient.tags} />
      </div>
    </SectionCard>
  );
};
