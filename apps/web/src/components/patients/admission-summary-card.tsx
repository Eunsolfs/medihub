import {
  ChevronDownIcon,
  ChevronUpIcon,
  Maximize2Icon,
  PencilIcon,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@medihub/ui/components/button";

import { SectionCard } from "#src/components/app-shell/ui/section-card.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { Markdown } from "#src/components/media/index.ts";

/** 超过这个字数默认折叠，避免长病历一次铺满整页。 */
const collapseThreshold = 600;

interface AdmissionSummaryCardProps {
  summary: string | null | undefined;
  isLoading?: boolean;
  onEdit: () => void;
  /** 打开「就诊全部资料」抽屉，看完整摘要与其它字段。 */
  onViewAll: () => void;
}

/** 就诊病历摘要：Markdown 渲染、超长折叠，右上角进入同一个就诊对话框编辑。 */
export const AdmissionSummaryCard = ({
  summary,
  isLoading = false,
  onEdit,
  onViewAll,
}: AdmissionSummaryCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const content = summary?.trim() ?? "";
  const collapsible = content.length > collapseThreshold;
  const hasContent = content.length > 0;
  const collapsed = collapsible && !expanded;

  const renderBody = () => {
    if (isLoading) {
      return <LoadingRows rows={3} />;
    }

    if (!hasContent) {
      return (
        <div className="grid justify-items-start gap-2">
          <p className="text-muted-foreground text-sm">尚未填写病历摘要</p>
          <Button onClick={onEdit} size="sm">
            <PencilIcon />
            填写摘要
          </Button>
        </div>
      );
    }

    return (
      <div className="grid gap-2">
        <div
          className={
            collapsed ? "relative max-h-96 overflow-hidden" : undefined
          }
        >
          <Markdown className="max-w-xl" content={content} />
          {collapsed ? (
            <>
              <div
                aria-hidden="true"
                className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t to-transparent"
              />
              <div className="absolute inset-x-0 bottom-2 flex justify-center">
                <Button
                  onClick={onViewAll}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Maximize2Icon />
                  查看全部
                </Button>
              </div>
            </>
          ) : null}
        </div>
        {collapsible ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                setExpanded((previous) => !previous);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
              {expanded ? "收起" : "展开全文"}
            </Button>
            <span className="text-muted-foreground text-xs">
              共 {content.length} 字
            </span>
            <Button
              onClick={onViewAll}
              size="sm"
              type="button"
              variant="outline"
            >
              <Maximize2Icon />
              查看全部
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <SectionCard
      action={
        hasContent ? (
          <Button onClick={onEdit} size="sm" variant="outline">
            <PencilIcon />
            编辑摘要
          </Button>
        ) : null
      }
      description={
        hasContent ? "Markdown 渲染，可在对话框里继续补充" : undefined
      }
      title="病历摘要"
    >
      {renderBody()}
    </SectionCard>
  );
};
