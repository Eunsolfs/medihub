import {
  FolderOpenIcon,
  HardDriveIcon,
  ImageIcon,
  StethoscopeIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";

import { StatCard } from "#src/components/app-shell/ui/stat-card.tsx";
import { formatBytes } from "#src/lib/format.ts";

export interface DashboardCounts {
  admissions: number;
  assets: number;
  images: number;
  posts: number;
  patients: number;
  sessions: number;
  storageBytes: number;
  videos: number;
}

interface StatOverviewProps {
  counts: DashboardCounts;
  /** 没有归属科室的账号：患者/就诊这两张卡属于不可用能力，直接不渲染 */
  orgless?: boolean;
  /** 存储占用卡：管理员跳系统管理，普通成员没有可跳转的存储页 */
  storageHref?: string;
}

/** 工作台第一屏：科室规模与资料存量的关键数字。 */
export const StatOverview = ({
  counts,
  orgless = false,
  storageHref,
}: StatOverviewProps) => {
  const documents = Math.max(counts.assets - counts.images - counts.videos, 0);

  const imageRatio =
    counts.assets > 0 ? Math.round((counts.images / counts.assets) * 100) : 0;

  return (
    <div
      className={`grid grid-cols-2 gap-3 ${
        orgless
          ? "md:grid-cols-2 xl:grid-cols-4"
          : "md:grid-cols-3 xl:grid-cols-6"
      }`}
    >
      {orgless ? null : (
        <>
          <StatCard
            hint="在册患者档案"
            href="/patients"
            icon={UsersIcon}
            label="患者"
            value={counts.patients}
          />
          <StatCard
            hint="住院、门诊与随访"
            href="/patients"
            icon={StethoscopeIcon}
            label="就诊"
            value={counts.admissions}
          />
        </>
      )}
      <StatCard
        hint={`另有 ${documents} 个文档/压缩包`}
        href="/library?source=all"
        icon={FolderOpenIcon}
        label="素材"
        value={counts.assets}
      />
      <StatCard
        hint={`占全部素材 ${imageRatio}%`}
        href="/library?source=all&kind=image"
        icon={ImageIcon}
        label="图片"
        value={counts.images}
      />
      <StatCard
        hint="术中录像与讲课视频"
        href="/library?source=all&kind=video"
        icon={VideoIcon}
        label="视频"
        value={counts.videos}
      />
      <StatCard
        hint="本地与 NAS 已用空间"
        href={storageHref}
        icon={HardDriveIcon}
        label="存储占用"
        value={formatBytes(counts.storageBytes)}
      />
    </div>
  );
};
