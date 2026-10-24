import { CalendarIcon, LayersIcon, PlusIcon } from "lucide-react";

import { Badge } from "@medihub/ui/components/badge";
import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { SectionCard } from "#src/components/app-shell/ui/section-card.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import type { AdmissionSummary } from "#src/components/patients/types.ts";
import { admissionKindLabel, formatDate } from "#src/lib/format.ts";

interface AdmissionListProps {
  admissions: readonly AdmissionSummary[];
  selectedId: string | null;
  isLoading?: boolean;
  onSelect: (admissionId: string | null) => void;
  onCreate: () => void;
}

const dateRangeOf = (admission: AdmissionSummary) => {
  const start = formatDate(admission.admittedAt);

  return admission.dischargedAt
    ? `${start} – ${formatDate(admission.dischargedAt)}`
    : `${start} 起 · 在院`;
};

const selectionClass = (selected: boolean) =>
  cn(
    "flex min-w-32 shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
    selected
      ? "border-primary/60 bg-primary/5 text-foreground"
      : "text-muted-foreground hover:bg-muted/60"
  );

/** 就诊记录选择器：桌面为左栏卡片列表，移动端为顶部横向滚动的分段选择。 */
export const AdmissionList = ({
  admissions,
  selectedId,
  isLoading = false,
  onSelect,
  onCreate,
}: AdmissionListProps) => {
  if (isLoading) {
    return (
      <SectionCard title="就诊记录">
        <LoadingRows rows={3} />
      </SectionCard>
    );
  }

  return (
    <>
      {/* 移动端：横向滚动的分段选择，避免侧栏在窄屏占掉首屏。 */}
      <div className="lg:hidden">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">就诊记录</h2>
          <Button onClick={onCreate} size="sm" variant="outline">
            <PlusIcon />
            新建就诊
          </Button>
        </div>
        {admissions.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={onCreate} size="sm">
                <PlusIcon />
                新建就诊
              </Button>
            }
            compact
            description="一次住院 / 门诊对应一条记录，影像挂在记录下。"
            icon={CalendarIcon}
            title="还没有就诊记录"
          />
        ) : (
          <fieldset className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1">
            <legend className="sr-only">选择就诊记录</legend>
            <button
              aria-pressed={selectedId === null}
              className={selectionClass(selectedId === null)}
              onClick={() => {
                onSelect(null);
              }}
              type="button"
            >
              <span className="text-xs font-medium">全部素材</span>
              <span className="text-xs">按患者汇总</span>
            </button>
            {admissions.map((admission) => {
              const selected = selectedId === admission.id;

              return (
                <button
                  aria-pressed={selected}
                  className={selectionClass(selected)}
                  key={admission.id}
                  onClick={() => {
                    onSelect(admission.id);
                  }}
                  type="button"
                >
                  <span className="text-xs font-medium">
                    {admissionKindLabel(admission.kind)} ·{" "}
                    {formatDate(admission.admittedAt)}
                  </span>
                  <span className="line-clamp-1 text-xs">
                    {admission.diagnosis ?? "未填写诊断"}
                  </span>
                  <span className="text-xs">{admission.assetCount} 个素材</span>
                </button>
              );
            })}
          </fieldset>
        )}
      </div>

      {/* 桌面端：左栏列表。「全部素材」由右侧工具条切换，避免窄侧栏里挤两个按钮。 */}
      <SectionCard
        action={
          <Button
            aria-pressed={selectedId === null}
            onClick={() => {
              onSelect(null);
            }}
            size="sm"
            variant={selectedId === null ? "secondary" : "outline"}
          >
            <LayersIcon />
            全部素材
          </Button>
        }
        className="hidden lg:block"
        contentClassName="grid gap-2"
        description={`共 ${admissions.length} 次 · 选中后在右侧查看时间线`}
        title="就诊记录"
      >
        {admissions.length === 0 ? (
          <div className="grid justify-items-start gap-2 py-1">
            <p className="text-sm font-medium">还没有就诊记录</p>
            <p className="text-muted-foreground text-xs">
              影像与文档需要挂在一次就诊下。
            </p>
            <Button onClick={onCreate} size="sm">
              <PlusIcon />
              新建就诊
            </Button>
          </div>
        ) : (
          <ul className="grid gap-2">
            {admissions.map((admission) => {
              const selected = selectedId === admission.id;

              return (
                <li key={admission.id}>
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "grid w-full gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "border-primary/60 bg-primary/5"
                        : "hover:bg-muted/60"
                    )}
                    onClick={() => {
                      onSelect(admission.id);
                    }}
                    type="button"
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">
                        {admissionKindLabel(admission.kind)}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {dateRangeOf(admission)}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-sm font-medium">
                      {admission.diagnosis ?? "未填写诊断"}
                    </span>
                    <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span>{admission.admissionNo ?? "无住院号"}</span>
                      <span>{admission.assetCount} 个素材</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
};
