import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";
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
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Textarea } from "@medihub/ui/components/textarea";

import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import {
  fromDateTimeInput,
  toDateTimeInput,
} from "#src/components/patients/datetime.ts";
import {
  admissionKindOptions,
  trimmedOrNull,
} from "#src/components/patients/display.ts";
import { TagInput } from "#src/components/patients/tag-input.tsx";
import type {
  AdmissionKind,
  AdmissionRecord,
} from "#src/components/patients/types.ts";
import { api } from "#src/lib/api.ts";

type AdmissionField =
  | "admittedAt"
  | "admissionNo"
  | "department"
  | "dischargedAt"
  | "summary";

interface AdmissionFormValues {
  admittedAt: string;
  admissionNo: string;
  attendingDoctor: string;
  chiefComplaint: string;
  department: string;
  diagnosis: string;
  dischargedAt: string;
  kind: AdmissionKind;
  notes: string;
  summary: string;
  tags: string[];
  treatment: string;
}

interface AdmissionFormError {
  field: AdmissionField;
  message: string;
}

const valuesOf = (record: AdmissionRecord | null): AdmissionFormValues => ({
  admittedAt: record
    ? toDateTimeInput(record.admittedAt)
    : toDateTimeInput(new Date()),
  admissionNo: record?.admissionNo ?? "",
  attendingDoctor: record?.attendingDoctor ?? "",
  chiefComplaint: record?.chiefComplaint ?? "",
  department: record?.department ?? "",
  diagnosis: record?.diagnosis ?? "",
  dischargedAt: record ? toDateTimeInput(record.dischargedAt) : "",
  kind: record?.kind ?? "inpatient",
  notes: record?.notes ?? "",
  summary: record?.summary ?? "",
  tags: record ? [...record.tags] : [],
  treatment: record?.treatment ?? "",
});

const validate = (values: AdmissionFormValues): AdmissionFormError[] => {
  const errors: AdmissionFormError[] = [];
  const admittedAt = fromDateTimeInput(values.admittedAt);

  if (!values.admittedAt) {
    errors.push({ field: "admittedAt", message: "请填写入院时间" });
  } else if (!admittedAt) {
    errors.push({ field: "admittedAt", message: "入院时间格式不正确" });
  }

  const dischargedAt = fromDateTimeInput(values.dischargedAt);

  if (values.dischargedAt && !dischargedAt) {
    errors.push({ field: "dischargedAt", message: "出院时间格式不正确" });
  } else if (admittedAt && dischargedAt && dischargedAt < admittedAt) {
    errors.push({
      field: "dischargedAt",
      message: "出院时间不能早于入院时间",
    });
  }

  if (values.admissionNo.trim().length > 40) {
    errors.push({ field: "admissionNo", message: "住院号不能超过 40 个字符" });
  }

  if (values.department.trim().length > 60) {
    errors.push({ field: "department", message: "科室不能超过 60 个字符" });
  }

  if (values.summary.length > 20_000) {
    errors.push({ field: "summary", message: "病历摘要不能超过 20000 个字符" });
  }

  return errors;
};

interface AdmissionFormProps {
  patientId: string;
  record: AdmissionRecord | null;
  /** 打开时聚焦哪个字段（从「编辑摘要」进来时聚焦摘要）。 */
  focusField?: "summary";
  onClose: () => void;
  onSaved?: (admissionId: string) => void;
}

const AdmissionForm = ({
  patientId,
  record,
  focusField,
  onClose,
  onSaved,
}: AdmissionFormProps) => {
  const queryClient = useQueryClient();

  const [values, setValues] = useState<AdmissionFormValues>(() =>
    valuesOf(record)
  );

  const [errors, setErrors] = useState<AdmissionFormError[]>([]);

  const errorOf = (field: AdmissionField) =>
    errors.find((error) => error.field === field)?.message;

  const admittedAtError = errorOf("admittedAt");
  const dischargedAtError = errorOf("dischargedAt");
  const admissionNoError = errorOf("admissionNo");
  const departmentError = errorOf("department");
  const summaryError = errorOf("summary");

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: api.patients.key() }),
      queryClient.invalidateQueries({ queryKey: api.admissions.key() }),
      queryClient.invalidateQueries({ queryKey: api.assets.key() }),
    ]);
  };

  const createMutation = useMutation(
    api.admissions.create.mutationOptions({
      onSuccess: async (created) => {
        await invalidate();
        toast.success("已新建就诊记录");
        onSaved?.(created.id);
        onClose();
      },
    })
  );

  const updateMutation = useMutation(
    api.admissions.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("已保存就诊记录");
        onClose();
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submitLabel = record ? "保存修改" : "新建就诊";

  const setField = <TKey extends keyof AdmissionFormValues>(
    key: TKey,
    value: AdmissionFormValues[TKey]
  ) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => previous.filter((error) => error.field !== key));
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate(values);

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      toast.error("请检查表单中标红的字段");

      return;
    }

    const payload = {
      admittedAt: fromDateTimeInput(values.admittedAt) ?? new Date(),
      admissionNo: trimmedOrNull(values.admissionNo),
      attendingDoctor: trimmedOrNull(values.attendingDoctor),
      chiefComplaint: trimmedOrNull(values.chiefComplaint),
      department: trimmedOrNull(values.department),
      diagnosis: trimmedOrNull(values.diagnosis),
      dischargedAt: fromDateTimeInput(values.dischargedAt),
      kind: values.kind,
      notes: trimmedOrNull(values.notes),
      summary: trimmedOrNull(values.summary),
      tags: values.tags,
      treatment: trimmedOrNull(values.treatment),
    };

    if (record) {
      updateMutation.mutate({ ...payload, id: record.id });

      return;
    }

    createMutation.mutate({ ...payload, patientId });
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="admission-kind">就诊类型</Label>
          <Select
            items={admissionKindOptions}
            onValueChange={(value) => {
              if (value) {
                setField("kind", value);
              }
            }}
            value={values.kind}
          >
            <SelectTrigger className="w-full" id="admission-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {admissionKindOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admission-no">住院号 / 门诊号</Label>
          <Input
            aria-invalid={Boolean(admissionNoError)}
            id="admission-no"
            maxLength={40}
            onChange={(event) => {
              setField("admissionNo", event.target.value);
            }}
            placeholder="如 ZY20260001"
            value={values.admissionNo}
          />
          {admissionNoError ? (
            <p className="text-destructive text-xs">{admissionNoError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admission-admitted-at">
            入院时间 <span className="text-destructive">*</span>
          </Label>
          <Input
            aria-invalid={Boolean(admittedAtError)}
            id="admission-admitted-at"
            onChange={(event) => {
              setField("admittedAt", event.target.value);
            }}
            type="datetime-local"
            value={values.admittedAt}
          />
          {admittedAtError ? (
            <p className="text-destructive text-xs">{admittedAtError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admission-discharged-at">出院时间</Label>
          <Input
            aria-invalid={Boolean(dischargedAtError)}
            id="admission-discharged-at"
            onChange={(event) => {
              setField("dischargedAt", event.target.value);
            }}
            type="datetime-local"
            value={values.dischargedAt}
          />
          {dischargedAtError ? (
            <p className="text-destructive text-xs">{dischargedAtError}</p>
          ) : (
            <p className="text-muted-foreground text-xs">留空表示仍在院。</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admission-department">科室</Label>
          <Input
            aria-invalid={Boolean(departmentError)}
            id="admission-department"
            maxLength={60}
            onChange={(event) => {
              setField("department", event.target.value);
            }}
            placeholder="如 整形外科"
            value={values.department}
          />
          {departmentError ? (
            <p className="text-destructive text-xs">{departmentError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="admission-doctor">主治医生</Label>
          <Input
            id="admission-doctor"
            maxLength={60}
            onChange={(event) => {
              setField("attendingDoctor", event.target.value);
            }}
            placeholder="主刀 / 主管医生"
            value={values.attendingDoctor}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="admission-diagnosis">诊断</Label>
          <Textarea
            id="admission-diagnosis"
            maxLength={2000}
            onChange={(event) => {
              setField("diagnosis", event.target.value);
            }}
            placeholder="本次入院的诊断结论"
            rows={2}
            value={values.diagnosis}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="admission-chief-complaint">主诉</Label>
          <Textarea
            id="admission-chief-complaint"
            maxLength={2000}
            onChange={(event) => {
              setField("chiefComplaint", event.target.value);
            }}
            placeholder="患者本次就诊的主要不适"
            rows={2}
            value={values.chiefComplaint}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="admission-treatment">治疗经过</Label>
          <Textarea
            id="admission-treatment"
            maxLength={2000}
            onChange={(event) => {
              setField("treatment", event.target.value);
            }}
            placeholder="手术 / 换药 / 随访处置"
            rows={3}
            value={values.treatment}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="admission-tags">标签</Label>
          <TagInput
            ariaLabel="就诊标签"
            onChange={(tags) => {
              setField("tags", tags);
            }}
            placeholder="如 皮瓣、二期修复，回车添加"
            value={values.tags}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="admission-notes">备注</Label>
          <Textarea
            id="admission-notes"
            maxLength={4000}
            onChange={(event) => {
              setField("notes", event.target.value);
            }}
            placeholder="术中情况、材料、随访计划等"
            rows={3}
            value={values.notes}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <Label htmlFor="admission-summary">病历摘要（支持 Markdown）</Label>
            <span className="text-muted-foreground text-xs">
              {values.summary.length}/20000
            </span>
          </div>
          <Textarea
            aria-invalid={Boolean(summaryError)}
            autoFocus={focusField === "summary"}
            className="font-mono text-xs"
            id="admission-summary"
            maxLength={20_000}
            onChange={(event) => {
              setField("summary", event.target.value);
            }}
            placeholder={
              "## 入院情况\n\n…\n\n## 手术经过\n\n…\n\n## 术后与随访\n\n- 观察皮瓣血运\n- 按时间线归档照片"
            }
            rows={10}
            value={values.summary}
          />
          {summaryError ? (
            <p className="text-destructive text-xs">{summaryError}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              支持标题、列表、表格与引用；保存后在患者详情页按 Markdown 渲染。
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          disabled={isPending}
          onClick={onClose}
          type="button"
          variant="outline"
        >
          取消
        </Button>
        <Button disabled={isPending} type="submit">
          {isPending ? "保存中…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
};

interface AdmissionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** 编辑时传就诊 id；不传表示新建。 */
  admissionId?: string | null;
  /** 已知的完整就诊记录（详情页预取后传入）。 */
  admission?: AdmissionRecord | null;
  /** 打开时聚焦摘要输入框（「编辑摘要 / 填写摘要」入口）。 */
  focusField?: "summary";
  onSaved?: (admissionId: string) => void;
}

/** 新建 / 编辑一次就诊（入院）记录。 */
export const AdmissionFormDialog = ({
  open,
  onOpenChange,
  patientId,
  admissionId,
  admission,
  focusField,
  onSaved,
}: AdmissionFormDialogProps) => {
  const isEditing = Boolean(admissionId);

  const detailQuery = useQuery({
    ...api.admissions.get.queryOptions({ input: { id: admissionId ?? "" } }),
    enabled: open && Boolean(admissionId) && !admission,
  });

  const record = admission ?? detailQuery.data?.admission ?? null;

  const description = isEditing
    ? "修改就诊信息后保存，已挂在该次就诊下的素材不会变动。"
    : "一次住院 / 门诊对应一条记录，影像与文档都挂在该次就诊下。";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "编辑就诊记录" : "新建就诊记录"}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isEditing && !record ? (
          <LoadingRows rows={6} />
        ) : (
          <AdmissionForm
            focusField={focusField}
            onClose={() => {
              onOpenChange(false);
            }}
            onSaved={onSaved}
            patientId={patientId}
            record={record}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
