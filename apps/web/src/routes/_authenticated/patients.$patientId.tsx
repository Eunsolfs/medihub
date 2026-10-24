import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { AdmissionFormDialog } from "#src/components/patients/admission-form-dialog.tsx";
import { AdmissionHeader } from "#src/components/patients/admission-header.tsx";
import { AdmissionList } from "#src/components/patients/admission-list.tsx";
import { AdmissionRecordSheet } from "#src/components/patients/admission-record-sheet.tsx";
import { AdmissionSummaryCard } from "#src/components/patients/admission-summary-card.tsx";
import { describePatient } from "#src/components/patients/display.ts";
import { PatientFormDialog } from "#src/components/patients/patient-form-dialog.tsx";
import { PatientInfoCard } from "#src/components/patients/patient-info-card.tsx";
import { PatientMediaPanel } from "#src/components/patients/patient-media-panel.tsx";
import { PatientRecordSheet } from "#src/components/patients/patient-record-sheet.tsx";
import { PatientStatusBadge } from "#src/components/patients/patient-status-badge.tsx";
import { PatientsErrorState } from "#src/components/patients/patients-error-state.tsx";
import {
  canDeleteRecord,
  useViewer,
} from "#src/components/patients/use-viewer.ts";
import { api } from "#src/lib/api.ts";
import { formatDateTime, formatRelative } from "#src/lib/format.ts";

interface AdmissionDialogState {
  admissionId: string | null;
  /** 从「编辑摘要 / 填写摘要」进入时聚焦摘要输入框。 */
  focusField?: "summary";
  open: boolean;
}

/** 哪个「全量查看」抽屉处于打开状态。 */
type RecordSheetKind = "admission" | "patient" | null;

/** 回到列表时重置筛选：详情页不保存列表的搜索状态。 */
const patientsListSearch = {
  page: 1,
  q: "",
  sort: "recent",
  status: "all",
  tag: "",
} as const;

const PatientDetailPage = () => {
  const { patientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewer = useViewer();

  const { data } = useSuspenseQuery(
    api.patients.get.queryOptions({ input: { id: patientId } })
  );

  const { patient } = data;

  const [selectedAdmissionId, setSelectedAdmissionId] = useState<string | null>(
    () => data.admissions[0]?.id ?? null
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removeAdmissionOpen, setRemoveAdmissionOpen] = useState(false);
  const [recordSheet, setRecordSheet] = useState<RecordSheetKind>(null);

  const [admissionDialog, setAdmissionDialog] = useState<AdmissionDialogState>({
    admissionId: null,
    open: false,
  });

  const selectedAdmission =
    data.admissions.find((admission) => admission.id === selectedAdmissionId) ??
    null;

  const admissionDetailQuery = useQuery({
    ...api.admissions.get.queryOptions({
      input: { id: selectedAdmission?.id ?? "" },
    }),
    enabled: Boolean(selectedAdmission),
  });

  const admissionDetail = admissionDetailQuery.data?.admission ?? null;

  const removePatientMutation = useMutation(
    api.patients.remove.mutationOptions({
      onSuccess: async () => {
        setDeleteOpen(false);
        // 先离开详情页，再清理缓存：否则已挂载的详情查询会在失效时对不存在的记录再发一次请求。
        await navigate({ search: patientsListSearch, to: "/patients" });
        queryClient.removeQueries({ queryKey: api.patients.get.key() });
        await queryClient.invalidateQueries({
          queryKey: api.patients.list.key(),
        });
        toast.success("已删除患者档案");
      },
    })
  );

  const removeAdmissionMutation = useMutation(
    api.admissions.remove.mutationOptions({
      onSuccess: async () => {
        setRemoveAdmissionOpen(false);
        // 先切回「全部素材」，让已删除就诊的详情查询卸载，避免失效时对不存在的记录再请求一次。
        setSelectedAdmissionId(null);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: api.patients.key() }),
          queryClient.invalidateQueries({ queryKey: api.admissions.key() }),
          queryClient.invalidateQueries({ queryKey: api.assets.key() }),
        ]);
        toast.success("已删除就诊记录");
      },
    })
  );

  const canDeletePatient = canDeleteRecord({
    createdBy: patient.createdBy,
    role: viewer.role,
    viewerId: viewer.id,
  });

  const canDeleteAdmission = canDeleteRecord({
    createdBy: admissionDetail?.createdBy,
    role: viewer.role,
    viewerId: viewer.id,
  });

  return (
    <div className="grid gap-5">
      <nav
        aria-label="面包屑"
        className="text-muted-foreground flex items-center gap-1 text-xs"
      >
        <Link
          className="hover:text-foreground"
          search={patientsListSearch}
          to="/patients"
        >
          患者档案
        </Link>
        <ChevronRightIcon aria-hidden="true" className="size-3" />
        <span className="text-foreground">{patient.name}</span>
      </nav>

      <PageHeader
        actions={
          <>
            <Button
              onClick={() => {
                setAdmissionDialog({ admissionId: null, open: true });
              }}
            >
              <PlusIcon />
              新建就诊
            </Button>
            <Button
              onClick={() => {
                setEditOpen(true);
              }}
              variant="outline"
            >
              <PencilIcon />
              编辑档案
            </Button>
            {canDeletePatient ? (
              <Button
                onClick={() => {
                  setDeleteOpen(true);
                }}
                variant="destructive"
              >
                <Trash2Icon />
                删除档案
              </Button>
            ) : null}
          </>
        }
        description={patient.summary ?? "尚未填写诊断摘要"}
        meta={
          <>
            <span>{describePatient(patient.gender, patient.birthDate)}</span>
            <span>病案号 {patient.medicalRecordNo ?? "—"}</span>
            <PatientStatusBadge status={patient.status} />
            <span title={formatDateTime(patient.updatedAt)}>
              {formatRelative(patient.updatedAt)}更新
            </span>
          </>
        }
        title={patient.name}
      />

      <PatientInfoCard
        onViewAll={() => {
          setRecordSheet("patient");
        }}
        patient={patient}
      />

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-20">
          <AdmissionList
            admissions={data.admissions}
            onCreate={() => {
              setAdmissionDialog({ admissionId: null, open: true });
            }}
            onSelect={setSelectedAdmissionId}
            selectedId={selectedAdmissionId}
          />
        </div>

        <div className="grid min-w-0 gap-4">
          {selectedAdmission ? (
            <AdmissionHeader
              admission={selectedAdmission}
              canDelete={canDeleteAdmission}
              detail={admissionDetail}
              onDelete={() => {
                setRemoveAdmissionOpen(true);
              }}
              onEdit={() => {
                setAdmissionDialog({
                  admissionId: selectedAdmission.id,
                  open: true,
                });
              }}
              onViewAll={() => {
                setRecordSheet("admission");
              }}
            />
          ) : null}

          {selectedAdmission ? (
            <AdmissionSummaryCard
              isLoading={admissionDetailQuery.isPending}
              key={`summary-${selectedAdmission.id}`}
              onEdit={() => {
                setAdmissionDialog({
                  admissionId: selectedAdmission.id,
                  focusField: "summary",
                  open: true,
                });
              }}
              onViewAll={() => {
                setRecordSheet("admission");
              }}
              summary={admissionDetail?.summary}
            />
          ) : null}

          <PatientMediaPanel
            admission={selectedAdmission}
            admissions={data.admissions}
            key={`media-${selectedAdmission?.id ?? "all"}`}
            patientId={patient.id}
          />
        </div>
      </div>

      <PatientFormDialog
        onOpenChange={setEditOpen}
        open={editOpen}
        patient={patient}
        patientId={patient.id}
      />

      <AdmissionFormDialog
        admissionId={admissionDialog.admissionId}
        admission={
          admissionDialog.admissionId === selectedAdmission?.id
            ? admissionDetail
            : null
        }
        focusField={admissionDialog.focusField}
        onOpenChange={(open) => {
          setAdmissionDialog((previous) => ({ ...previous, open }));
        }}
        onSaved={(admissionId) => {
          setSelectedAdmissionId(admissionId);
        }}
        open={admissionDialog.open}
        patientId={patient.id}
      />

      <ConfirmDialog
        description="删除后该患者的所有就诊记录与素材都会一并移除，且无法恢复。"
        isPending={removePatientMutation.isPending}
        onConfirm={() => {
          removePatientMutation.mutate({ id: patient.id });
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`删除「${patient.name}」的档案？`}
        tone="destructive"
      />

      <ConfirmDialog
        description="该次就诊下的素材会随之移出时间线，请先确认已归档或导出。"
        isPending={removeAdmissionMutation.isPending}
        onConfirm={() => {
          if (!selectedAdmission) {
            return;
          }

          removeAdmissionMutation.mutate({ id: selectedAdmission.id });
        }}
        onOpenChange={setRemoveAdmissionOpen}
        open={removeAdmissionOpen}
        title="删除这次就诊记录？"
        tone="destructive"
      />

      <AdmissionRecordSheet
        admission={selectedAdmission}
        isLoading={Boolean(selectedAdmission) && admissionDetailQuery.isPending}
        onEdit={() => {
          setRecordSheet(null);
          setAdmissionDialog({
            admissionId: selectedAdmission?.id ?? null,
            open: true,
          });
        }}
        onOpenChange={(open) => {
          setRecordSheet(open ? "admission" : null);
        }}
        open={recordSheet === "admission"}
        record={admissionDetail}
      />

      <PatientRecordSheet
        onEdit={() => {
          setRecordSheet(null);
          setEditOpen(true);
        }}
        onOpenChange={(open) => {
          setRecordSheet(open ? "patient" : null);
        }}
        open={recordSheet === "patient"}
        patient={patient}
      />
    </div>
  );
};

const PatientDetailRouteError = ({ error }: ErrorComponentProps) => {
  const router = useRouter();

  return (
    <PatientsErrorState
      message={
        error instanceof Error
          ? error.message
          : "患者档案加载失败，请稍后重试。"
      }
      onRetry={() => {
        void router.invalidate();
      }}
      title="患者档案加载失败"
    />
  );
};

export const Route = createFileRoute("/_authenticated/patients/$patientId")({
  component: PatientDetailPage,
  errorComponent: PatientDetailRouteError,
  loader: async ({ context, params }) => {
    await context.queryClient.query(
      api.patients.get.queryOptions({ input: { id: params.patientId } })
    );
  },
});
