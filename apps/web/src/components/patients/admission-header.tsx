import { Maximize2Icon, PencilIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@medihub/ui/components/badge";
import { Button } from "@medihub/ui/components/button";

import { SectionCard } from "#src/components/app-shell/ui/section-card.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
import type {
  AdmissionRecord,
  AdmissionSummary,
} from "#src/components/patients/types.ts";
import {
  admissionKindLabel,
  formatDate,
  formatDateTime,
} from "#src/lib/format.ts";

interface FieldProps {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}

const Field = ({ label, value, multiline = false }: FieldProps) => (
  <div className="grid gap-0.5">
    <p className="text-muted-foreground text-xs">{label}</p>
    <p
      className={
        multiline ? "text-sm text-pretty whitespace-pre-wrap" : "text-sm"
      }
    >
      {value?.trim() ? value : "—"}
    </p>
  </div>
);

interface AdmissionHeaderProps {
  admission: AdmissionSummary;
  detail: AdmissionRecord | null;
  /** 作者本人或管理员才显示编辑/删除。 */
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** 打开「就诊全部资料」抽屉。 */
  onViewAll: () => void;
}

/** 当前选中就诊的抬头信息：时间、住院号、诊断与治疗经过，附编辑/删除入口。 */
export const AdmissionHeader = ({
  admission,
  detail,
  canEdit,
  onEdit,
  onDelete,
  onViewAll,
}: AdmissionHeaderProps) => (
  <SectionCard
    action={
      canEdit ? (
        <div className="flex items-center gap-1">
          <Button onClick={onEdit} size="sm" variant="outline">
            <PencilIcon />
            编辑
          </Button>
          <Button onClick={onDelete} size="sm" variant="destructive">
            <Trash2Icon />
            删除
          </Button>
        </div>
      ) : null
    }
    contentClassName="grid gap-3"
    description={
      <>
        {admission.admissionNo ? `住院号 ${admission.admissionNo}` : "无住院号"}
        {admission.department ? ` · ${admission.department}` : ""} ·{" "}
        {admission.assetCount} 个素材
      </>
    }
    title={
      <>
        {admissionKindLabel(admission.kind)} ·{" "}
        {formatDate(admission.admittedAt)}
        {admission.dischargedAt
          ? ` – ${formatDate(admission.dischargedAt)}`
          : " 起"}
      </>
    }
  >
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onViewAll} size="sm" variant="outline">
        <Maximize2Icon />
        查看全部资料
      </Button>
      <span className="text-muted-foreground text-xs">
        主诉 / 治疗 / 备注与完整病历摘要
      </span>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="诊断" value={admission.diagnosis} />
      <Field label="主治医生" value={detail?.attendingDoctor} />
      <Field label="入院时间" value={formatDateTime(admission.admittedAt)} />
      <Field label="出院时间" value={formatDateTime(admission.dischargedAt)} />
      <Field label="主诉" multiline value={detail?.chiefComplaint} />
      <Field label="治疗经过" multiline value={detail?.treatment} />
    </div>
    {detail?.notes ? (
      <Field label="备注" multiline value={detail.notes} />
    ) : null}
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs">标签</span>
      <TagList emptyText="暂无标签" max={20} tags={admission.tags} />
      {admission.tags.length > 0 ? (
        <Badge className="ml-auto" variant="ghost">
          {admission.tags.length} 个标签
        </Badge>
      ) : null}
    </div>
  </SectionCard>
);
