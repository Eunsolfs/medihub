import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { HeartPulseIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@medihub/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@medihub/ui/components/card";

import { fetchInstallStatus } from "#src/components/install/install-api.ts";
import type { InstallStatus } from "#src/components/install/install-api.ts";
import {
  InstallForm,
  InstallFormSkeleton,
  InstallSuccess,
} from "#src/components/install/install-form.tsx";

interface InstallShellProps {
  children: ReactNode;
}

const InstallShell = ({ children }: InstallShellProps) => (
  <div className="bg-background relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 py-10">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="bg-primary/10 absolute -top-40 -right-24 size-96 rounded-full blur-3xl" />
      <div className="bg-accent/70 absolute -bottom-40 -left-24 size-80 rounded-full blur-3xl" />
    </div>

    <div className="relative grid w-full max-w-[520px] gap-6">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl">
          <HeartPulseIcon className="size-5" strokeWidth={2.1} />
        </span>
        <span className="grid gap-0.5 leading-none">
          <span className="text-lg font-semibold tracking-tight">医档通</span>
          <span className="text-muted-foreground text-xs font-medium tracking-widest">
            MEDIHUB
          </span>
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          首次启动配置
        </span>
      </div>

      {children}

      <p className="text-muted-foreground text-center text-xs">
        内部系统 · 请妥善保管超级管理员账号
      </p>
    </div>
  </div>
);

interface InstallStatusErrorProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

const InstallStatusError = ({
  message,
  isRetrying,
  onRetry,
}: InstallStatusErrorProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-xl">无法读取安装状态</CardTitle>
      <CardDescription>{message}</CardDescription>
    </CardHeader>
    <CardContent>
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={isRetrying}
        onClick={onRetry}
        variant="outline"
      >
        {isRetrying ? "正在重试…" : "重试"}
      </Button>
    </CardContent>
  </Card>
);

interface InstallSuccessState {
  adminEmail: string;
  restartRequired: boolean;
}

/** 首次安装向导：状态判定 → 表单 → 完成态，单页完成。 */
export const InstallWizard = () => {
  const navigate = useNavigate();
  const [success, setSuccess] = useState<InstallSuccessState | null>(null);

  const statusQuery = useQuery({
    queryFn: fetchInstallStatus,
    queryKey: ["install", "status"],
    retry: false,
  });

  const installed = statusQuery.data?.installed === true;

  useEffect(() => {
    if (installed) {
      void navigate({ replace: true, to: "/login" });
    }
  }, [installed, navigate]);

  if (success) {
    return (
      <InstallShell>
        <InstallSuccess
          adminEmail={success.adminEmail}
          restartRequired={success.restartRequired}
        />
      </InstallShell>
    );
  }

  if (statusQuery.isPending || installed) {
    return (
      <InstallShell>
        <InstallFormSkeleton />
      </InstallShell>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    const message =
      statusQuery.error instanceof Error
        ? statusQuery.error.message
        : "安装状态查询失败，请稍后重试";

    return (
      <InstallShell>
        <InstallStatusError
          isRetrying={statusQuery.isFetching}
          message={message}
          onRetry={() => {
            void statusQuery.refetch();
          }}
        />
      </InstallShell>
    );
  }

  const status: InstallStatus = statusQuery.data;

  return (
    <InstallShell>
      <InstallForm
        onSuccess={(input) => {
          setSuccess(input);
        }}
        status={status}
      />
    </InstallShell>
  );
};
