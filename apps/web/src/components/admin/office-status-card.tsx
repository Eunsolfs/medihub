import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { Pill } from "#src/components/admin/badges.tsx";

interface OfficeStatus {
  libreOffice: boolean;
  onlyOffice: boolean;
}

const isOfficeStatus = (value: unknown): value is OfficeStatus => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { libreOffice?: unknown; onlyOffice?: unknown };

  return (
    typeof candidate.libreOffice === "boolean" &&
    typeof candidate.onlyOffice === "boolean"
  );
};

/** 统一把网络/格式错误收敛成一句人话，QueryCache 会把 message toast 出来。 */
const fetchOfficeStatus = async (): Promise<OfficeStatus> => {
  try {
    const response = await fetch("/api/office/status", {
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("检测失败");
    }

    const payload: unknown = await response.json();

    if (!isOfficeStatus(payload)) {
      throw new Error("检测失败");
    }

    return payload;
  } catch {
    throw new Error("检测失败");
  }
};

interface OfficeStatusRowProps {
  configured: boolean;
  description: string;
  hint: string;
  label: string;
}

const OfficeStatusRow = ({
  configured,
  description,
  hint,
  label,
}: OfficeStatusRowProps) => (
  <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
    <div className="grid min-w-0 gap-1">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground text-xs text-pretty">
        {description}
      </span>
      {configured ? null : (
        <span className="text-warning text-xs text-pretty">下一步：{hint}</span>
      )}
    </div>
    <Pill
      className="shrink-0 self-start"
      tone={configured ? "success" : "warning"}
    >
      {configured ? "已配置" : "未配置"}
    </Pill>
  </div>
);

/**
 * Office 集成就绪状态：在管理页提前暴露服务端能力，
 * 避免打开文档才发现在线预览/编辑不可用。
 */
export const OfficeStatusCard = () => {
  const statusQuery = useQuery({
    queryFn: fetchOfficeStatus,
    queryKey: ["admin", "office-status"],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const status = statusQuery.data;

  return (
    <section className="bg-card ring-foreground/10 grid gap-4 rounded-xl p-4 text-sm ring-1">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h2 className="flex items-center gap-2 font-medium">
            <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-lg">
              <FileTextIcon className="size-4" />
            </span>
            Office 集成
          </h2>
          <p className="text-muted-foreground text-xs text-pretty">
            在线预览与编辑依赖服务端组件；未配置时 Office
            文档只能下载或使用本地预览。
          </p>
          {statusQuery.isError && status ? (
            <p className="text-warning text-xs">重新检测失败，显示上次结果。</p>
          ) : null}
        </div>
        <Button
          disabled={statusQuery.isFetching}
          onClick={() => {
            void statusQuery.refetch();
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCwIcon
            className={statusQuery.isFetching ? "animate-spin" : undefined}
          />
          {statusQuery.isFetching ? "检测中…" : "重新检测"}
        </Button>
      </div>

      {statusQuery.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!statusQuery.isPending && !status ? (
        <div className="text-destructive flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          检测失败，请点击「重新检测」重试。
        </div>
      ) : null}

      {status ? (
        <div className="grid gap-2">
          <OfficeStatusRow
            configured={status.libreOffice}
            description="docx / pptx 转 PDF，用于在线预览"
            hint="在 apps/server/.env 设置 SOFFICE_PATH（参考 docs/ONLYOFFICE.md）"
            label="LibreOffice 文档预览"
          />
          <OfficeStatusRow
            configured={status.onlyOffice}
            description="桌面端 Office 文档在线编辑"
            hint="设置 ONLYOFFICE_URL 与 ONLYOFFICE_JWT_SECRET"
            label="OnlyOffice 在线编辑"
          />
        </div>
      ) : null}
    </section>
  );
};
