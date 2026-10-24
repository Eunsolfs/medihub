import {
  Link,
  createFileRoute,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  Building2Icon,
  HardDriveIcon,
  ScrollTextIcon,
  ShieldXIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@medihub/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@medihub/ui/components/tabs";

import { AuditPanel } from "#src/components/admin/audit-panel.tsx";
import { OfficeStatusCard } from "#src/components/admin/office-status-card.tsx";
import { OrgsPanel } from "#src/components/admin/orgs-panel.tsx";
import { StoragePanel } from "#src/components/admin/storage-panel.tsx";
import type { AdminViewer } from "#src/components/admin/types.ts";
import { UsersPanel } from "#src/components/admin/users-panel.tsx";
import { isAdminRole } from "#src/components/app-shell/roles.ts";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { roleLabel } from "#src/lib/format.ts";

interface SessionUserIdentity {
  id: string;
  organizationId?: string | null;
  role?: string;
}

/** 会话里的 role 是字符串字段，进入页面前收敛成页面需要的管理员角色。 */
const toAdminViewer = (
  user: SessionUserIdentity | undefined
): AdminViewer | null => {
  if (!user || !isAdminRole(user.role)) {
    return null;
  }

  return {
    id: user.id,
    organizationId: user.organizationId ?? null,
    role: user.role === "root" ? "root" : "dept_admin",
  };
};

const AdminNoAccess = () => (
  <div className="grid gap-5">
    <PageHeader
      description="仅超级管理员与科室管理员可以进入。"
      title="系统管理"
    />
    <EmptyState
      action={
        <Button render={<Link to="/dashboard" />} variant="outline">
          返回工作台
        </Button>
      }
      description="当前账号没有系统管理权限。如需管理账号、科室或存储配置，请联系超级管理员开通。"
      icon={ShieldXIcon}
      title="无权访问"
    />
  </div>
);

const AdminRouteError = ({ error }: ErrorComponentProps) => {
  const router = useRouter();

  return (
    <div className="grid gap-5">
      <PageHeader description="账号、科室与存储配置。" title="系统管理" />
      <EmptyState
        action={
          <Button
            onClick={() => {
              void router.invalidate();
            }}
            variant="outline"
          >
            重试
          </Button>
        }
        description={
          error instanceof Error ? error.message : "请稍后重试，或刷新页面。"
        }
        icon={TriangleAlertIcon}
        title="系统管理数据加载失败"
      />
    </div>
  );
};

const AdminPage = () => {
  const { session } = useRouteContext({ from: "__root__" });
  const sessionUser = session?.user as SessionUserIdentity | undefined;
  const viewer = toAdminViewer(sessionUser);

  if (!viewer) {
    return <AdminNoAccess />;
  }

  const isRoot = viewer.role === "root";

  return (
    <div className="grid gap-5">
      <PageHeader
        description="管理账号与角色、科室内存储后端，并查看敏感操作审计。"
        meta={
          <>
            <span>{roleLabel(viewer.role)}</span>
            <span>·</span>
            <span>
              {isRoot ? "可管理全部科室与全局存储" : "仅限本科室成员与本室存储"}
            </span>
          </>
        }
        title="系统管理"
      />

      {isRoot ? (
        <p className="text-muted-foreground -mt-2 text-xs text-pretty">
          你当前是全局管理员，可在顶部切换科室查看该科室的成员与存储配置；全局管理员账号本身不归属任何科室。
        </p>
      ) : null}

      <OfficeStatusCard />

      <Tabs defaultValue="users">
        <TabsList
          aria-label="系统管理分区"
          className="max-w-full justify-start overflow-x-auto"
        >
          <TabsTrigger value="users">
            <UsersIcon />
            用户
          </TabsTrigger>
          {isRoot ? (
            <TabsTrigger value="orgs">
              <Building2Icon />
              科室
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="storage">
            <HardDriveIcon />
            存储
          </TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollTextIcon />
            审计
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersPanel viewer={viewer} />
        </TabsContent>

        {isRoot ? (
          <TabsContent value="orgs">
            <OrgsPanel />
          </TabsContent>
        ) : null}

        <TabsContent value="storage">
          <StoragePanel viewer={viewer} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  errorComponent: AdminRouteError,
});
