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
  fromDateValue,
  toDateValue,
} from "#src/components/patients/datetime.ts";
import {
  genderOptions,
  patientStatusOptions,
  trimmedOrNull,
} from "#src/components/patients/display.ts";
import { TagInput } from "#src/components/patients/tag-input.tsx";
import type {
  PatientGender,
  PatientRecord,
  PatientStatus,
} from "#src/components/patients/types.ts";
import { useViewer } from "#src/components/patients/use-viewer.ts";
import { api } from "#src/lib/api.ts";

type PatientField =
  | "birthDate"
  | "idCardNo"
  | "medicalRecordNo"
  | "name"
  | "phone"
  | "summary";

interface PatientFormValues {
  birthDate: string;
  gender: PatientGender;
  idCardNo: string;
  medicalRecordNo: string;
  name: string;
  notes: string;
  phone: string;
  status: PatientStatus;
  summary: string;
  tags: string[];
}

interface PatientFormError {
  field: PatientField;
  message: string;
}

const emptyValues: PatientFormValues = {
  birthDate: "",
  gender: "unknown",
  idCardNo: "",
  medicalRecordNo: "",
  name: "",
  notes: "",
  phone: "",
  status: "active",
  summary: "",
  tags: [],
};

const valuesOf = (record: PatientRecord | null): PatientFormValues =>
  record
    ? {
        birthDate: toDateValue(record.birthDate),
        gender: record.gender,
        idCardNo: record.idCardNo ?? "",
        medicalRecordNo: record.medicalRecordNo ?? "",
        name: record.name,
        notes: record.notes ?? "",
        phone: record.phone ?? "",
        status: record.status,
        summary: record.summary ?? "",
        tags: [...record.tags],
      }
    : emptyValues;

const validate = (
  values: PatientFormValues,
  options: { showIdCard: boolean }
): PatientFormError[] => {
  const errors: PatientFormError[] = [];
  const name = values.name.trim();

  if (!name) {
    errors.push({ field: "name", message: "请填写患者姓名" });
  } else if (name.length > 80) {
    errors.push({ field: "name", message: "姓名不能超过 80 个字符" });
  }

  if (values.medicalRecordNo.trim().length > 40) {
    errors.push({
      field: "medicalRecordNo",
      message: "病案号不能超过 40 个字符",
    });
  }

  const phone = values.phone.trim();

  if (phone && !/^[\d\-+*\s]{6,30}$/u.test(phone)) {
    errors.push({
      field: "phone",
      message: "电话只能包含数字、空格与 + - * 符号，长度 6-30",
    });
  }

  if (values.birthDate) {
    const birthDate = fromDateValue(values.birthDate);

    if (!birthDate) {
      errors.push({ field: "birthDate", message: "出生日期格式不正确" });
    } else if (birthDate.getTime() > Date.now()) {
      errors.push({ field: "birthDate", message: "出生日期不能晚于今天" });
    }
  }

  if (options.showIdCard) {
    const idCardNo = values.idCardNo.trim();

    if (idCardNo && !/^(?<idCardNumber>\d{15}|\d{17}[\dXx])$/u.test(idCardNo)) {
      errors.push({
        field: "idCardNo",
        message: "身份证号应为 15 位或 18 位",
      });
    }
  }

  if (values.summary.trim().length > 200) {
    errors.push({ field: "summary", message: "诊断摘要不能超过 200 个字符" });
  }

  return errors;
};

interface PatientFormProps {
  record: PatientRecord | null;
  showIdCard: boolean;
  onClose: () => void;
  onSaved?: (patientId: string) => void;
}

const PatientForm = ({
  record,
  showIdCard,
  onClose,
  onSaved,
}: PatientFormProps) => {
  const queryClient = useQueryClient();

  const [values, setValues] = useState<PatientFormValues>(() =>
    valuesOf(record)
  );

  const [errors, setErrors] = useState<PatientFormError[]>([]);

  const errorOf = (field: PatientField) =>
    errors.find((error) => error.field === field)?.message;

  const nameError = errorOf("name");
  const birthDateError = errorOf("birthDate");
  const medicalRecordNoError = errorOf("medicalRecordNo");
  const phoneError = errorOf("phone");
  const idCardNoError = errorOf("idCardNo");
  const summaryError = errorOf("summary");

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: api.patients.key() });
  };

  const createMutation = useMutation(
    api.patients.create.mutationOptions({
      onSuccess: async (created) => {
        await invalidate();
        toast.success("已新建患者档案");
        onSaved?.(created.id);
        onClose();
      },
    })
  );

  const updateMutation = useMutation(
    api.patients.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("已保存患者档案");
        onClose();
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;
  const submitLabel = record ? "保存修改" : "新建患者";

  const setField = <TKey extends keyof PatientFormValues>(
    key: TKey,
    value: PatientFormValues[TKey]
  ) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => previous.filter((error) => error.field !== key));
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate(values, { showIdCard });

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      toast.error("请检查表单中标红的字段");

      return;
    }

    const payload = {
      birthDate: fromDateValue(values.birthDate),
      gender: values.gender,
      idCardNo: showIdCard ? trimmedOrNull(values.idCardNo) : undefined,
      medicalRecordNo: trimmedOrNull(values.medicalRecordNo),
      name: values.name.trim(),
      notes: trimmedOrNull(values.notes),
      phone: trimmedOrNull(values.phone),
      status: values.status,
      summary: trimmedOrNull(values.summary),
      tags: values.tags,
    };

    if (record) {
      updateMutation.mutate({ ...payload, id: record.id });

      return;
    }

    createMutation.mutate(payload);
  };

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="patient-name">
            姓名 <span className="text-destructive">*</span>
          </Label>
          <Input
            aria-invalid={Boolean(nameError)}
            autoFocus
            id="patient-name"
            maxLength={80}
            onChange={(event) => {
              setField("name", event.target.value);
            }}
            placeholder="患者姓名"
            value={values.name}
          />
          {nameError ? (
            <p className="text-destructive text-xs">{nameError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="patient-gender">性别</Label>
          <Select
            items={genderOptions}
            onValueChange={(value) => {
              if (value) {
                setField("gender", value);
              }
            }}
            value={values.gender}
          >
            <SelectTrigger className="w-full" id="patient-gender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {genderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="patient-birth-date">出生日期</Label>
          <Input
            aria-invalid={Boolean(birthDateError)}
            id="patient-birth-date"
            onChange={(event) => {
              setField("birthDate", event.target.value);
            }}
            type="date"
            value={values.birthDate}
          />
          {birthDateError ? (
            <p className="text-destructive text-xs">{birthDateError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="patient-record-no">病案号</Label>
          <Input
            aria-invalid={Boolean(medicalRecordNoError)}
            id="patient-record-no"
            maxLength={40}
            onChange={(event) => {
              setField("medicalRecordNo", event.target.value);
            }}
            placeholder="如 MRN-2026-0001"
            value={values.medicalRecordNo}
          />
          {medicalRecordNoError ? (
            <p className="text-destructive text-xs">{medicalRecordNoError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="patient-phone">电话</Label>
          <Input
            aria-invalid={Boolean(phoneError)}
            id="patient-phone"
            inputMode="tel"
            maxLength={30}
            onChange={(event) => {
              setField("phone", event.target.value);
            }}
            placeholder="联系方式"
            value={values.phone}
          />
          {phoneError ? (
            <p className="text-destructive text-xs">{phoneError}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="patient-status">状态</Label>
          <Select
            items={patientStatusOptions}
            onValueChange={(value) => {
              if (value) {
                setField("status", value);
              }
            }}
            value={values.status}
          >
            <SelectTrigger className="w-full" id="patient-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {patientStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showIdCard ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="patient-id-card">身份证号</Label>
            <Input
              aria-invalid={Boolean(idCardNoError)}
              autoComplete="off"
              id="patient-id-card"
              maxLength={18}
              onChange={(event) => {
                setField("idCardNo", event.target.value);
              }}
              placeholder="15 位或 18 位身份证号（敏感字段）"
              value={values.idCardNo}
            />
            {idCardNoError ? (
              <p className="text-destructive text-xs">{idCardNoError}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                身份证号属于敏感信息，仅科室管理员与超级管理员可查看完整号码。
              </p>
            )}
          </div>
        ) : null}

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="patient-summary">诊断摘要</Label>
          <Textarea
            aria-invalid={Boolean(summaryError)}
            id="patient-summary"
            maxLength={200}
            onChange={(event) => {
              setField("summary", event.target.value);
            }}
            placeholder="用于列表快速识别，如「右前臂烧伤后瘢痕挛缩」"
            rows={2}
            value={values.summary}
          />
          <p className="text-muted-foreground text-xs">
            {values.summary.length}/200 字
            {summaryError ? (
              <span className="text-destructive ml-2">{summaryError}</span>
            ) : null}
          </p>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="patient-tags">标签</Label>
          <TagInput
            ariaLabel="患者标签"
            onChange={(tags) => {
              setField("tags", tags);
            }}
            placeholder="如 瘢痕、皮片移植，回车添加"
            value={values.tags}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="patient-notes">备注</Label>
          <Textarea
            id="patient-notes"
            maxLength={4000}
            onChange={(event) => {
              setField("notes", event.target.value);
            }}
            placeholder="过敏史、全身情况等补充说明"
            rows={3}
            value={values.notes}
          />
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

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑时传患者 id；不传表示新建。 */
  patientId?: string | null;
  /** 已知的完整患者记录（详情页直接传入，省一次请求）。 */
  patient?: PatientRecord | null;
  onSaved?: (patientId: string) => void;
}

/** 新建 / 编辑患者档案。身份证号只对 root 与 dept_admin 开放编辑与查看。 */
export const PatientFormDialog = ({
  open,
  onOpenChange,
  patientId,
  patient,
  onSaved,
}: PatientFormDialogProps) => {
  const { canManageIdCard } = useViewer();
  const isEditing = Boolean(patientId);

  const detailQuery = useQuery({
    ...api.patients.get.queryOptions({ input: { id: patientId ?? "" } }),
    enabled: open && Boolean(patientId) && !patient,
  });

  const record = patient ?? detailQuery.data?.patient ?? null;
  const showIdCard = canManageIdCard || !isEditing;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "编辑患者档案" : "新建患者档案"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "修改基本信息后保存；就诊记录请在患者详情页维护。"
              : "先建立档案，随后在详情页添加入院记录与影像素材。"}
          </DialogDescription>
        </DialogHeader>

        {isEditing && !record ? (
          <LoadingRows rows={5} />
        ) : (
          <PatientForm
            onClose={() => {
              onOpenChange(false);
            }}
            onSaved={onSaved}
            record={record}
            showIdCard={showIdCard}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
