import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import {
  Building2Icon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  LaptopIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@medihub/ui/components/avatar";
import { Button } from "@medihub/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@medihub/ui/components/card";
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import { Separator } from "@medihub/ui/components/separator";

import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { RoleBadge } from "#src/components/app-shell/ui/status-badges.tsx";
import { api } from "#src/lib/api.ts";
import { authClient } from "#src/lib/auth.ts";
import { initials, roleLabel } from "#src/lib/format.ts";

const phoneOf = (user: unknown): string => {
  if (typeof user !== "object" || user === null || !("phone" in user)) {
    return "";
  }

  const value = user.phone;

  return typeof value === "string" ? value : "";
};

const imageOf = (user: unknown): string | undefined => {
  if (typeof user !== "object" || user === null || !("image" in user)) {
    return undefined;
  }

  const value = user.image;

  return typeof value === "string" ? value : undefined;
};

const THEME_OPTIONS = [
  { icon: SunIcon, label: "浅色", value: "light" },
  { icon: MoonIcon, label: "深色", value: "dark" },
  { icon: LaptopIcon, label: "跟随系统", value: "system" },
] as const;

const ThemeCard = () => {
  const { setTheme, theme } = useTheme();
  const activeTheme = theme ?? "system";

  return (
    <Card>
      <CardHeader>
        <CardTitle>外观</CardTitle>
        <CardDescription>主题偏好保存在本机浏览器。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = activeTheme === option.value;

            return (
              <Button
                aria-pressed={active}
                key={option.value}
                onClick={() => {
                  setTheme(option.value);
                }}
                variant={active ? "default" : "outline"}
              >
                <Icon />
                {option.label}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

interface ProfileFormProps {
  name: string;
  phone: string;
  title: string;
}

const ProfileForm = ({ name, phone, title }: ProfileFormProps) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [values, setValues] = useState({ name, phone, title });

  const updateMutation = useMutation(
    api.me.update.mutationOptions({
      onSuccess: async () => {
        toast.success("个人资料已更新");
        await queryClient.invalidateQueries({
          queryKey: api.me.profile.key({ type: "query" }),
        });
        await router.invalidate();
      },
    })
  );

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateMutation.mutate({
      name: values.name.trim(),
      phone: values.phone.trim(),
      title: values.title.trim(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本资料</CardTitle>
        <CardDescription>
          姓名会显示在素材归属与操作记录里；职称用于科室内的通讯录展示。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="profile-name">姓名</Label>
            <Input
              id="profile-name"
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }));
              }}
              required
              value={values.name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-title">职称 / 职务</Label>
            <Input
              id="profile-title"
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  title: event.target.value,
                }));
              }}
              placeholder="如：主治医师"
              value={values.title}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="profile-phone">联系电话</Label>
            <Input
              id="profile-phone"
              inputMode="tel"
              onChange={(event) => {
                setValues((current) => ({
                  ...current,
                  phone: event.target.value,
                }));
              }}
              placeholder="用于科室内部联系"
              value={values.phone}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={updateMutation.isPending} type="submit">
              {updateMutation.isPending ? "正在保存…" : "保存修改"}
            </Button>
            <Button
              onClick={() => {
                setValues({ name, phone, title });
              }}
              type="button"
              variant="ghost"
            >
              重置
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const SignOutCard = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>登录与安全</CardTitle>
        <CardDescription>
          退出登录会清空本地缓存；下次进入需要重新输入账号密码。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={() => {
            void handleSignOut();
          }}
          variant="destructive"
        >
          <LogOutIcon />
          退出登录
        </Button>
      </CardContent>
    </Card>
  );
};

const MePage = () => {
  const profileQuery = useQuery(api.me.profile.queryOptions());
  const { session } = useRouteContext({ from: "__root__" });
  const user: unknown = session?.user;
  const profile = profileQuery.data;

  if (profileQuery.isPending) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">我的</h1>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">正在加载账号资料…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="grid gap-4">
        <PageHeader title="我的" />
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              当前会话已失效，请重新登录。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { organization, viewer } = profile;

  return (
    <div className="grid gap-5">
      <PageHeader
        description="账号资料、所属科室与界面偏好。"
        meta={
          <>
            <span>{roleLabel(viewer.role)}</span>
            <span>·</span>
            <span>{organization?.name ?? "未归属科室"}</span>
          </>
        }
        title="我的"
      />

      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-16" size="lg">
              <AvatarImage alt="" src={imageOf(user)} />
              <AvatarFallback>{initials(viewer.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-lg font-semibold">
                  {viewer.name}
                </span>
                <RoleBadge role={viewer.role} />
              </div>
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <MailIcon aria-hidden="true" className="size-3.5" />
                {viewer.email}
              </p>
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Building2Icon aria-hidden="true" className="size-3.5" />
                {organization?.name ?? "未归属科室"}
                {organization?.code ? (
                  <span className="text-xs">（{organization.code}）</span>
                ) : null}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-5">
          <ProfileForm
            key={`${viewer.id}-${viewer.name}`}
            name={viewer.name}
            phone={phoneOf(user)}
            title={viewer.title ?? ""}
          />
          <SignOutCard />
        </div>

        <div className="grid h-fit gap-5">
          <Card>
            <CardHeader>
              <CardTitle>所属科室</CardTitle>
              <CardDescription>
                {organization?.description ?? "由管理员在系统管理中分配。"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">科室名称</span>
                  <span className="text-right font-medium">
                    {organization?.name ?? "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">科室代码</span>
                  <span className="text-right font-medium">
                    {organization?.code ?? "—"}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">你的角色</span>
                  <RoleBadge role={viewer.role} />
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">账号状态</span>
                  <span className="text-right font-medium">
                    {viewer.status === "active" ? "正常" : "已停用"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <ShieldCheckIcon aria-hidden="true" className="size-4" />
                  权限说明
                </span>
              </CardTitle>
              <CardDescription>
                数据可见范围由科室与角色共同决定，跨科室记录一律视为不存在。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {viewer.role === "member"
                  ? "科室成员可以查看并上传本科室资料；仅能删除自己创建的素材与会议。"
                  : "管理员可以管理科室成员、存储目标与全部本科室资料。"}
              </p>
            </CardContent>
          </Card>

          <ThemeCard />
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/me")({
  component: MePage,
});
