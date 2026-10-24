import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { CalendarDaysIcon, FolderIcon, UsersIcon } from "lucide-react";

import { Button } from "@medihub/ui/components/button";

import {
  getSessionRole,
  isOrglessRole,
} from "#src/components/app-shell/roles.ts";
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
  const role = getSessionRole(session);
  const orgless = isOrglessRole(role);
  const overviewQuery = useQuery(api.stats.overview.queryOptions());
  const overview = overviewQuery.data;
  const name = session?.user.name ?? "";

  return (
    <div className="grid gap-5">
      <PageHeader
        actions={
          orgless ? null : (
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
          )
        }
        description={
          orgless
            ? name
              ? `${name}，你的账号还没有归属科室；这里展示你可以访问的资料与教学动态。`
              : "你的账号还没有归属科室；这里展示你可以访问的资料与教学动态。"
            : name
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

      {overviewQuery.isPending ? <LoadingRows rows={4} /> : null}

      {overviewQuery.isError ? (
        <SectionCard
          description="网络或权限异常，概览数据暂时取不到；其余页面通常不受影响。"
          title="概览暂时不可用"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                void overviewQuery.refetch();
              }}
              variant="outline"
            >
              重试
            </Button>
            <Link className="text-sm hover:underline" to="/library">
              直接去资料库
            </Link>
          </div>
        </SectionCard>
      ) : null}

      {overview ? (
        <>
          <StatOverview counts={overview.counts} orgless={orgless} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="order-1 grid h-fit gap-5 xl:order-none xl:col-start-2 xl:row-start-1">
              <SectionCard
                description={
                  orgless
                    ? "分配科室后可用的入口会显示在这里"
                    : "科室里最常用的三个动作"
                }
                title="快捷操作"
              >
                <QuickActions orgless={orgless} />
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

              {orgless ? (
                <SectionCard
                  description="需要科室归属后才能使用"
                  title="患者档案"
                >
                  <p className="text-muted-foreground text-sm text-pretty">
                    你的账号还没有归属科室，患者档案与影像上传暂不可用；请联系管理员在系统管理
                    → 待分配用户里分配科室。
                  </p>
                  <div className="mt-3">
                    <Button
                      nativeButton={false}
                      render={<Link to="/me" />}
                      size="sm"
                      variant="outline"
                    >
                      查看我的账号
                    </Button>
                  </div>
                </SectionCard>
              ) : (
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
              )}
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
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});
