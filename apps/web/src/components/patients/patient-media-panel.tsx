import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOffIcon, LayoutGridIcon, ListOrderedIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import {
  AssetGrid,
  AssetTimeline,
  UploadButton,
  UploadDropzone,
} from "#src/components/media/index.ts";
import type {
  AssetSelection,
  UploadTarget,
} from "#src/components/media/index.ts";
import { BatchActionBar } from "#src/components/patients/batch-action-bar.tsx";
import { CameraUploadButton } from "#src/components/patients/camera-upload-button.tsx";
import {
  assetKindOptions,
  stageOptions,
} from "#src/components/patients/display.ts";
import { downloadAssets } from "#src/components/patients/download.ts";
import { MoveAssetsDialog } from "#src/components/patients/move-assets-dialog.tsx";
import { PatientsErrorState } from "#src/components/patients/patients-error-state.tsx";
import type {
  AdmissionSummary,
  AssetKind,
  ClinicalStage,
  PatientAsset,
} from "#src/components/patients/types.ts";
import { api } from "#src/lib/api.ts";
import { formatDate } from "#src/lib/format.ts";

const ALL_STAGES = "all";
const NO_STAGE = "none";
const ALL_KINDS = "all";

type StageFilter = ClinicalStage | typeof ALL_STAGES;

type KindFilter = AssetKind | typeof ALL_KINDS;

type UploadStage = ClinicalStage | typeof NO_STAGE;

const buildIndexes = (length: number) =>
  Array.from({ length }, (_, index) => index);

const gridSkeleton = (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
    {buildIndexes(8).map((index) => (
      <Skeleton className="aspect-square w-full" key={index} />
    ))}
  </div>
);

const stageFilterItems: readonly { label: string; value: StageFilter }[] = [
  { label: "全部分期", value: ALL_STAGES },
  ...stageOptions,
];

const kindFilterItems: readonly { label: string; value: KindFilter }[] = [
  { label: "全部类型", value: ALL_KINDS },
  ...assetKindOptions,
];

const uploadStageItems: readonly { label: string; value: UploadStage }[] = [
  { label: "未分期", value: NO_STAGE },
  ...stageOptions,
];

interface MediaToolbarProps {
  capturedAt: string;
  gridMode: boolean;
  filtersActive: boolean;
  kind: KindFilter;
  stage: StageFilter;
  uploadStage: UploadStage;
  showViewToggle: boolean;
  onCapturedAtChange: (value: string) => void;
  onClearFilters: () => void;
  onGridView: () => void;
  onKindChange: (value: KindFilter) => void;
  onStageChange: (value: StageFilter) => void;
  onTimelineView: () => void;
  onUploaded: () => void;
  onUploadStageChange: (value: UploadStage) => void;
  target: UploadTarget;
}

const FilterSelect = <TValue extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly { label: string; value: TValue }[];
  value: TValue;
  onChange: (value: TValue) => void;
}) => (
  <Select
    items={items}
    onValueChange={(next) => {
      if (next) {
        onChange(next);
      }
    }}
    value={value}
  >
    <SelectTrigger aria-label={label} className="w-28" size="sm">
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
);

const MediaToolbar = ({
  capturedAt,
  gridMode,
  filtersActive,
  kind,
  stage,
  uploadStage,
  showViewToggle,
  onCapturedAtChange,
  onClearFilters,
  onGridView,
  onKindChange,
  onStageChange,
  onTimelineView,
  onUploaded,
  onUploadStageChange,
  target,
}: MediaToolbarProps) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div className="flex flex-wrap items-end gap-2">
      <FilterSelect
        items={stageFilterItems}
        label="按分期筛选"
        onChange={onStageChange}
        value={stage}
      />
      <FilterSelect
        items={kindFilterItems}
        label="按类型筛选"
        onChange={onKindChange}
        value={kind}
      />
      {filtersActive ? (
        <Button onClick={onClearFilters} size="sm" variant="ghost">
          清除筛选
        </Button>
      ) : null}
    </div>

    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <span className="text-muted-foreground text-xs">上传分期</span>
          <FilterSelect
            items={uploadStageItems}
            label="上传分期"
            onChange={onUploadStageChange}
            value={uploadStage}
          />
        </div>
        <div className="grid gap-1">
          <span className="text-muted-foreground text-xs">拍摄时间</span>
          <Input
            aria-label="拍摄时间"
            className="h-7 w-36"
            onChange={(event) => {
              onCapturedAtChange(event.target.value);
            }}
            type="date"
            value={capturedAt}
          />
        </div>
      </div>
      {/* 移动端两个按钮并排不换行，且保持 44px 触控高度。 */}
      <div className="flex flex-nowrap items-center gap-2 max-sm:[&_button]:min-h-11">
        <UploadButton
          label="上传素材"
          onUploaded={onUploaded}
          size="sm"
          target={target}
        />
        <CameraUploadButton
          label="拍照上传"
          onUploaded={onUploaded}
          target={target}
        />
      </div>
    </div>

    {showViewToggle ? (
      <fieldset className="bg-muted inline-flex w-fit items-center rounded-lg p-0.5">
        <legend className="sr-only">视图切换</legend>
        <Button
          aria-pressed={!gridMode}
          onClick={onTimelineView}
          size="sm"
          variant={gridMode ? "ghost" : "secondary"}
        >
          <ListOrderedIcon />
          时间线
        </Button>
        <Button
          aria-pressed={gridMode}
          onClick={onGridView}
          size="sm"
          variant={gridMode ? "secondary" : "ghost"}
        >
          <LayoutGridIcon />
          网格
        </Button>
      </fieldset>
    ) : null}
  </div>
);

interface MediaBodyProps {
  assets: PatientAsset[];
  admission: AdmissionSummary | null;
  errorMessage: string;
  filtersActive: boolean;
  gridMode: boolean;
  isLoading: boolean;
  isError: boolean;
  selection: AssetSelection;
  target: UploadTarget;
  onChanged: () => void;
  onClearFilters: () => void;
  onRetry: () => void;
  onUploaded: () => void;
}

const MediaBody = ({
  assets,
  admission,
  errorMessage,
  filtersActive,
  gridMode,
  isLoading,
  isError,
  selection,
  target,
  onChanged,
  onClearFilters,
  onRetry,
  onUploaded,
}: MediaBodyProps) => {
  if (isLoading) {
    return gridSkeleton;
  }

  if (isError) {
    return (
      <PatientsErrorState
        message={errorMessage}
        onRetry={onRetry}
        title="素材加载失败"
      />
    );
  }

  if (assets.length === 0 && filtersActive) {
    return (
      <EmptyState
        action={
          <Button onClick={onClearFilters} size="sm" variant="outline">
            清除筛选
          </Button>
        }
        compact
        description="换一个分期或类型，或者上传新的素材。"
        icon={ImageOffIcon}
        title="没有符合筛选条件的素材"
      />
    );
  }

  if (assets.length === 0) {
    return (
      <div className="grid gap-2">
        <p className="text-muted-foreground text-sm">
          {admission ? "本次就诊还没有素材" : "该患者还没有任何素材"}
          ，把文件拖到下面即可开始整理。
        </p>
        <UploadDropzone
          hint="支持图片、视频与 PDF，一次可拖入多张"
          onUploaded={onUploaded}
          target={target}
        />
      </div>
    );
  }

  if (admission && !gridMode) {
    return (
      <div className="min-w-0">
        <AssetTimeline
          admissionId={admission.id}
          assets={assets}
          onChanged={onChanged}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <AssetGrid assets={assets} selection={selection} />
    </div>
  );
};

interface PatientMediaPanelProps {
  patientId: string;
  /** 选中的就诊；null 表示「全部素材」。 */
  admission: AdmissionSummary | null;
  admissions: readonly AdmissionSummary[];
}

/**
 * 时间线 / 素材网格。选中就诊后默认按时间线浏览（可拖拽排序、编辑元数据），
 * 一旦按分期或类型筛选、或切到网格，就改用可多选的网格视图。
 */
export const PatientMediaPanel = ({
  patientId,
  admission,
  admissions,
}: PatientMediaPanelProps) => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"timeline" | "grid">("timeline");
  const [stageFilter, setStageFilter] = useState<StageFilter>(ALL_STAGES);
  const [kindFilter, setKindFilter] = useState<KindFilter>(ALL_KINDS);
  const [uploadStage, setUploadStage] = useState<UploadStage>(NO_STAGE);
  const [uploadCapturedAt, setUploadCapturedAt] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  const filtersActive = stageFilter !== ALL_STAGES || kindFilter !== ALL_KINDS;
  const gridMode = !admission || filtersActive || viewMode === "grid";

  const assetsQuery = useQuery(
    api.assets.list.queryOptions({
      input: {
        admissionId: admission?.id,
        kind: kindFilter === ALL_KINDS ? undefined : kindFilter,
        page: 1,
        pageSize: 200,
        patientId: admission ? undefined : patientId,
        sort: "timeline",
        stage: stageFilter === ALL_STAGES ? undefined : stageFilter,
      },
    })
  );

  const assets = assetsQuery.data?.items ?? [];
  const total = assetsQuery.data?.total ?? 0;

  const selectedAssets = assets.filter((asset) =>
    selectedIds.includes(asset.id)
  );

  const selectedAssetIds = selectedAssets.map((asset) => asset.id);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: api.assets.key() }),
      queryClient.invalidateQueries({ queryKey: api.patients.key() }),
    ]);
  };

  const removeMutation = useMutation(
    api.assets.remove.mutationOptions({
      onSuccess: async (result) => {
        await invalidate();
        setSelectedIds([]);
        setDeleteOpen(false);

        if (result.skipped > 0) {
          toast.warning(`${result.skipped} 个素材无删除权限，已跳过`);
        } else {
          toast.success(`已删除 ${result.deleted} 个素材`);
        }
      },
    })
  );

  const uploadTarget: UploadTarget = {
    admissionId: admission?.id,
    capturedAt: uploadCapturedAt
      ? new Date(`${uploadCapturedAt}T12:00:00`)
      : undefined,
    patientId,
    stage: uploadStage === NO_STAGE ? undefined : uploadStage,
  };

  const handleUploaded = () => {
    void invalidate();
  };

  const clearFilters = () => {
    setStageFilter(ALL_STAGES);
    setKindFilter(ALL_KINDS);
  };

  const title = admission
    ? `${formatDate(admission.admittedAt)} · ${admission.diagnosis ?? "本次就诊"}`
    : "全部素材";

  return (
    <section className="grid min-w-0 gap-3">
      <header className="flex min-w-0 flex-col gap-1">
        <h2 className="line-clamp-2 text-base font-medium">{title}</h2>
        <p className="text-muted-foreground text-xs">
          {total} 个素材
          {admission ? " · 按拍摄日期排列" : " · 该患者所有就诊汇总"}
          {filtersActive ? " · 已按筛选条件过滤" : ""}
        </p>
      </header>

      <MediaToolbar
        capturedAt={uploadCapturedAt}
        filtersActive={filtersActive}
        gridMode={gridMode}
        kind={kindFilter}
        onCapturedAtChange={setUploadCapturedAt}
        onClearFilters={clearFilters}
        onGridView={() => {
          setViewMode("grid");
        }}
        onKindChange={(value) => {
          setKindFilter(value);
        }}
        onStageChange={(value) => {
          setStageFilter(value);
        }}
        onTimelineView={() => {
          clearFilters();
          setViewMode("timeline");
        }}
        onUploadStageChange={setUploadStage}
        onUploaded={handleUploaded}
        showViewToggle={Boolean(admission)}
        stage={stageFilter}
        target={uploadTarget}
        uploadStage={uploadStage}
      />

      {selectedAssets.length > 0 ? (
        <BatchActionBar
          count={selectedAssets.length}
          onClear={() => {
            setSelectedIds([]);
          }}
          onDelete={() => {
            setDeleteOpen(true);
          }}
          onDownload={() => {
            downloadAssets(selectedAssets);
          }}
          onMove={() => {
            setMoveOpen(true);
          }}
        />
      ) : null}

      <MediaBody
        admission={admission}
        assets={assets}
        errorMessage={
          assetsQuery.error?.message ?? "素材加载失败，请稍后重试。"
        }
        filtersActive={filtersActive}
        gridMode={gridMode}
        isError={assetsQuery.isError}
        isLoading={assetsQuery.isPending}
        onChanged={() => {
          void invalidate();
        }}
        onClearFilters={clearFilters}
        onRetry={() => {
          void assetsQuery.refetch();
        }}
        onUploaded={handleUploaded}
        selection={{ onChange: setSelectedIds, selectedIds }}
        target={uploadTarget}
      />

      <ConfirmDialog
        description={`将从时间线与患者档案中移除这 ${selectedAssets.length} 个素材，文件会保留一段时间以便恢复。`}
        isPending={removeMutation.isPending}
        onConfirm={() => {
          if (selectedAssetIds.length === 0) {
            return;
          }

          removeMutation.mutate({ ids: selectedAssetIds });
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`删除 ${selectedAssets.length} 个素材？`}
        tone="destructive"
      />

      {moveOpen ? (
        <MoveAssetsDialog
          admissions={admissions}
          assetIds={selectedAssetIds}
          currentAdmissionId={admission?.id ?? null}
          onMoved={() => {
            setSelectedIds([]);
          }}
          onOpenChange={(next) => {
            setMoveOpen(next);
          }}
          open
        />
      ) : null}
    </section>
  );
};
