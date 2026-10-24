import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import {
  FolderHeartIcon,
  GraduationCapIcon,
  HeartPulseIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { AuthForm } from "#src/components/auth-form.tsx";
import { APP_VERSION_LABEL } from "#src/lib/app-version.ts";

const sameOriginPath = /^\/(?!\/)/u;

const isSameOriginRedirect = (value: unknown): value is string =>
  typeof value === "string" && sameOriginPath.test(value);

const validateSearch = (search: {
  redirect?: unknown;
}): { redirect?: string } =>
  isSameOriginRedirect(search.redirect) ? { redirect: search.redirect } : {};

const FEATURES = [
  {
    icon: FolderHeartIcon,
    title: "患者影像时间线",
    description: "按入院与手术节点归档伤口、术中照片与病理资料",
  },
  {
    icon: GraduationCapIcon,
    title: "科室资料与教学分享",
    description: "培训课件、教学文章与手术视频，可见范围可控",
  },
  {
    icon: ShieldCheckIcon,
    title: "权限与导出管控",
    description: "按角色分配权限，导出全程留痕",
  },
] as const;

const BrandPanel = () => (
  <aside className="bg-sidebar border-border relative hidden overflow-hidden border-r lg:flex lg:flex-col lg:justify-between lg:p-10">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="bg-grid absolute inset-0 opacity-70" />
      <div className="bg-primary/10 absolute -top-32 -left-24 size-96 rounded-full blur-3xl" />
      <div className="bg-accent absolute -right-24 bottom-0 size-80 rounded-full blur-3xl" />
    </div>

    <div className="relative flex items-center gap-2.5">
      <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl">
        <HeartPulseIcon className="size-5" strokeWidth={2.1} />
      </span>
      <span className="grid gap-0.5 leading-none">
        <span className="text-lg font-semibold tracking-tight">医档通</span>
        <span className="text-muted-foreground text-xs font-medium tracking-widest">
          MEDIHUB
        </span>
      </span>
    </div>

    <div className="relative grid max-w-md gap-7">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          科室多媒体与病历资料管理
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          面向整形与创伤科室的内部系统：患者影像、培训资料、教学分享与导出，
          在一个工作台里完成。
        </p>
      </div>
      <ul className="grid gap-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;

          return (
            <li className="flex items-start gap-3" key={feature.title}>
              <span className="bg-accent text-accent-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{feature.title}</span>
                <span className="text-muted-foreground text-xs text-pretty">
                  {feature.description}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>

    <p className="text-muted-foreground relative text-xs">
      内部系统 · 请勿共享账号
    </p>
  </aside>
);

const LoginPage = () => {
  const router = useRouter();
  const search = Route.useSearch();

  const handleSuccess = async () => {
    await router.invalidate();
    await router.navigate({ href: search.redirect ?? "/dashboard" });
  };

  return (
    <div className="bg-background min-h-svh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />

      <div className="flex min-h-svh flex-col lg:justify-center lg:px-10">
        <div className="border-border flex h-14 shrink-0 items-center gap-2.5 border-b px-4 lg:hidden">
          <span className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
            <HeartPulseIcon className="size-4" strokeWidth={2.1} />
          </span>
          <span className="grid gap-0.5 leading-none">
            <span className="text-sm font-semibold tracking-tight">医档通</span>
            <span className="text-muted-foreground text-xs tracking-widest">
              MEDIHUB
            </span>
          </span>
        </div>

        <main className="mx-auto grid w-full max-w-[420px] flex-1 content-start gap-8 px-5 pt-10 pb-8 lg:flex-none lg:content-center lg:px-0 lg:py-0">
          <AuthForm onSuccess={handleSuccess} />
          <p className="text-muted-foreground flex items-center justify-center gap-2 text-center text-xs">
            <span>内部系统 · 请勿共享账号</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{APP_VERSION_LABEL}</span>
          </p>
        </main>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/login")({
  validateSearch,
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      throw redirect({ href: search.redirect ?? "/dashboard" });
    }
  },
  component: LoginPage,
});
