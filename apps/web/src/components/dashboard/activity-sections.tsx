import {
  ArrowRightIcon,
  FileTextIcon,
  FolderUpIcon,
  UserPlusIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@medihub/ui/components/avatar";
import { Badge } from "@medihub/ui/components/badge";
import { Progress } from "@medihub/ui/components/progress";

import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { AssetGrid } from "#src/components/media/index.ts";
import {
  formatBytes,
  formatRelative,
  initials,
  patientStatusLabel,
} from "#src/lib/format.ts";

export interface RecentAsset {
  createdAt: Date | string;
  id: string;
  kind: string;
  originalName: string;
}

export interface RecentPatient {
  createdAt: Date | string;
  id: string;
  name: string;
  status: string;
  summary: string | null;
}

interface RecentUploadsProps {
  assets: readonly RecentAsset[];
}

export const RecentUploads = ({ assets }: RecentUploadsProps) => {
  if (assets.length === 0) {
    return (
      <EmptyState
        compact
        description="上传培训课件、会议照片或术中视频后，这里会显示最新动态。"
        icon={FolderUpIcon}
        title="还没有上传记录"
      />
    );
  }

  return <AssetGrid assets={[...assets]} />;
};

interface RecentPatientsProps {
  patients: readonly RecentPatient[];
}

export const RecentPatients = ({ patients }: RecentPatientsProps) => {
  if (patients.length === 0) {
    return (
      <EmptyState
        compact
        description="建立患者档案后，就诊与影像时间线会围绕它组织。"
        icon={UserPlusIcon}
        title="还没有患者档案"
      />
    );
  }

  return (
    <ul className="divide-border divide-y">
      {patients.map((patient) => (
        <li key={patient.id}>
          <a
            className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors"
            href={`/patients/${patient.id}`}
          >
            <Avatar size="default">
              <AvatarFallback>{initials(patient.name)}</AvatarFallback>
            </Avatar>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {patient.name}
                </span>
                <Badge
                  variant={
                    patient.status === "active" ? "secondary" : "outline"
                  }
                >
                  {patientStatusLabel(patient.status)}
                </Badge>
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {patient.summary ?? "未填写主诉摘要"}
              </span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatRelative(patient.createdAt)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
};

interface QuickAction {
  description: string;
  href: string;
  icon: LucideIcon;
  label: string;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    description: "建一份新的住院或门诊档案",
    href: "/patients",
    icon: UserPlusIcon,
    label: "新建患者",
  },
  {
    description: "上传课件、照片或视频到资料库",
    href: "/library",
    icon: FolderUpIcon,
    label: "上传资料",
  },
  {
    description: "把病例整理成教学文章",
    href: "/posts/new",
    icon: FileTextIcon,
    label: "写文章",
  },
];

/** 工作台右侧的高频入口：写操作永远比统计数字更值得占据视线。 */
export const QuickActions = () => (
  <ul className="grid gap-1">
    {QUICK_ACTIONS.map((action) => {
      const Icon = action.icon;

      return (
        <li key={action.href}>
          <a
            className="hover:bg-muted/60 group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
            href={action.href}
          >
            <span
              aria-hidden="true"
              className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-lg"
            >
              <Icon className="size-4" />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm font-medium">{action.label}</span>
              <span className="text-muted-foreground truncate text-xs">
                {action.description}
              </span>
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="text-muted-foreground/60 group-hover:text-foreground size-4 shrink-0 transition-colors"
            />
          </a>
        </li>
      );
    })}
  </ul>
);

interface StorageBreakdownProps {
  counts: {
    assets: number;
    images: number;
    storageBytes: number;
    videos: number;
  };
}

/** 存储占用拆分：让「用掉多少」有一个可比较的参照，而不是一个孤立的数字。 */
export const StorageBreakdown = ({ counts }: StorageBreakdownProps) => {
  const documents = Math.max(counts.assets - counts.images - counts.videos, 0);

  const ratio =
    counts.assets > 0
      ? Math.round(
          (Math.max(counts.assets - documents, 0) / counts.assets) * 100
        )
      : 0;

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatBytes(counts.storageBytes)}
        </span>
        <span className="text-muted-foreground text-xs">已用空间</span>
      </div>
      <Progress value={ratio} />
      <dl className="text-muted-foreground grid grid-cols-3 gap-2 text-xs">
        <div className="grid gap-0.5">
          <dt>图片</dt>
          <dd className="text-foreground font-medium tabular-nums">
            {counts.images}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt>视频</dt>
          <dd className="text-foreground font-medium tabular-nums">
            {counts.videos}
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt>文档等</dt>
          <dd className="text-foreground font-medium tabular-nums">
            {documents}
          </dd>
        </div>
      </dl>
    </div>
  );
};
