import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { CalendarDaysIcon, FolderIcon, UsersIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { SectionCard } from "#src/components/app-shell/ui/section-card.tsx";
import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import {
  QuickActions,
  RecentPatients,
  RecentUploads,
  StorageBreakdown,
} from "#src/components/dashboard/activity-sections.tsx";
import { StatOverview } from "#src/components/dashboard/stat-overview.tsx";
import { api } from "#src/lib/api.ts";

/** 模块加载时算一次：渲染期读取当前时间会破坏 React 的纯函数约束。 */
const todayLabel = new Intl.DateTimeFormat("zh-CN", {
  day: "numeric",
  month: "long",
  weekday: "long",
  year: "numeric",
}).format(new Date());

const DashboardPage = () => {
  const { session } = useRouteContext({ from: "__root__" });
  const overviewQuery = useQuery(api.stats.overview.queryOptions());
  const overview = overviewQuery.data;
  const name = session?.user.name ?? "";

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          <>
            <Button
              nativeButton={false}
              render={<a aria-label="患者档案" href="/patients" />}
              variant="outline"
            >
              <UsersIcon />
              患者档案
            </Button>
            <Button
              nativeButton={false}
              render={<Link aria-label="上传资料" to="/library" />}
            >
              <FolderIcon />
              上传资料
            </Button>
          </>
        }
        description={
          name
            ? `${name}，这里是科室的资料概览与最近的临床动态。`
            : "科室的资料概览与最近的临床动态。"
        }
        meta={
          <>
            <span className="flex items-center gap-1">
              <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
              {todayLabel}
            </span>
            {overview ? (
              <span>学习会议 {overview.counts.sessions} 场</span>
            ) : null}
          </>
        }
        title="工作台"
      />

      {overviewQuery.isPending || !overview ? (
        <LoadingRows rows={4} />
      ) : (
        <>
          <StatOverview counts={overview.counts} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="order-1 grid h-fit gap-5 xl:order-none xl:col-start-2 xl:row-start-1">
              <SectionCard
                description="科室里最常用的三个动作"
                title="快捷操作"
              >
                <QuickActions />
              </SectionCard>
            </div>

            <div className="order-2 grid min-w-0 gap-5 xl:order-none xl:col-start-1 xl:row-span-2 xl:row-start-1">
              <SectionCard
                action={
                  <Link
                    className="text-xs font-medium hover:underline"
                    to="/library"
                  >
                    全部资料
                  </Link>
                }
                description="最新入库的影像、课件与会议资料"
                title="最近上传"
              >
                <RecentUploads assets={overview.activity.recentAssets} />
              </SectionCard>

              <SectionCard
                action={
                  <a
                    className="text-xs font-medium hover:underline"
                    href="/patients"
                  >
                    全部患者
                  </a>
                }
                description="按建档时间倒序"
                title="最近新增患者"
              >
                <RecentPatients patients={overview.activity.recentPatients} />
              </SectionCard>
            </div>

            <div className="order-3 grid h-fit gap-5 xl:order-none xl:col-start-2 xl:row-start-2">
              <SectionCard
                description="图片、视频与文档的分布"
                title="存储占用"
              >
                <StorageBreakdown
                  counts={{
                    assets: overview.counts.assets,
                    images: overview.counts.images,
                    storageBytes: overview.counts.storageBytes,
                    videos: overview.counts.videos,
                  }}
                />
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});
