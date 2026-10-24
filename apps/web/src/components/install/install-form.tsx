import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";

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
import { Skeleton } from "@medihub/ui/components/skeleton";

import { runInstall } from "#src/components/install/install-api.ts";
import type { InstallStatus } from "#src/components/install/install-api.ts";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const httpPattern = /^https?:\/\//iu;

interface InstallFormProps {
  status: InstallStatus;
  onSuccess: (input: { adminEmail: string; restartRequired: boolean }) => void;
}

export const InstallForm = ({ status, onSuccess }: InstallFormProps) => {
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [onlyOfficeOpen, setOnlyOfficeOpen] = useState(false);
  const [onlyOfficeUrl, setOnlyOfficeUrl] = useState("");
  const [onlyOfficeJwtSecret, setOnlyOfficeJwtSecret] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const name = adminName.trim();
    const email = adminEmail.trim();

    if (name.length < 1) {
      return "请填写管理员姓名";
    }

    if (name.length > 60) {
      return "管理员姓名最多 60 个字符";
    }

    if (!emailPattern.test(email)) {
      return "请输入有效的管理员邮箱";
    }

    if (adminPassword.length < 8) {
      return "密码至少 8 位";
    }

    if (adminPassword !== confirmPassword) {
      return "两次输入的密码不一致";
    }

    const onlyOfficeUrlValue = onlyOfficeUrl.trim();
    const onlyOfficeSecretValue = onlyOfficeJwtSecret.trim();

    if (Boolean(onlyOfficeUrlValue) !== Boolean(onlyOfficeSecretValue)) {
      return "OnlyOffice 地址与 JWT 密钥需要同时填写";
    }

    if (onlyOfficeUrlValue && !httpPattern.test(onlyOfficeUrlValue)) {
      return "OnlyOffice 地址必须以 http(s):// 开头";
    }

    return null;
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const validationError = validate();

    if (validationError) {
      setErrorMessage(validationError);

      return;
    }

    setSubmitting(true);

    try {
      const onlyOfficeUrlValue = onlyOfficeUrl.trim();
      const onlyOfficeSecretValue = onlyOfficeJwtSecret.trim();

      const result = await runInstall({
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim(),
        adminPassword,
        ...(onlyOfficeUrlValue
          ? {
              onlyOfficeJwtSecret: onlyOfficeSecretValue,
              onlyOfficeUrl: onlyOfficeUrlValue,
            }
          : {}),
      });

      onSuccess({
        adminEmail: adminEmail.trim(),
        restartRequired: result.restartRequired,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "安装失败，请稍后重试"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">初始化医档通</CardTitle>
        <CardDescription>
          这是第一次启动，先创建超级管理员账号。安装完成后即可登录使用。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="install-site-url">当前站点地址</Label>
            <Input
              className="font-mono"
              id="install-site-url"
              readOnly
              value={status.siteUrl}
            />
            <p className="text-muted-foreground text-xs text-pretty">
              请确认浏览器地址与它一致，否则登录会 403。
            </p>
          </div>

          {errorMessage ? (
            <p
              className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
              role="alert"
            >
              <TriangleAlertIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="break-all">{errorMessage}</span>
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="install-admin-name">管理员姓名</Label>
              <Input
                autoComplete="name"
                id="install-admin-name"
                maxLength={60}
                onChange={(event) => {
                  setAdminName(event.target.value);
                }}
                placeholder="如：李主任"
                required
                value={adminName}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="install-admin-email">管理员邮箱</Label>
              <Input
                autoComplete="email"
                id="install-admin-email"
                maxLength={160}
                onChange={(event) => {
                  setAdminEmail(event.target.value);
                }}
                placeholder="admin@example.com"
                required
                type="email"
                value={adminEmail}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="install-admin-password">密码</Label>
              <Input
                autoComplete="new-password"
                id="install-admin-password"
                maxLength={128}
                minLength={8}
                onChange={(event) => {
                  setAdminPassword(event.target.value);
                }}
                placeholder="至少 8 位"
                required
                type="password"
                value={adminPassword}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="install-confirm-password">确认密码</Label>
              <Input
                autoComplete="new-password"
                id="install-confirm-password"
                maxLength={128}
                minLength={8}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                placeholder="再次输入密码"
                required
                type="password"
                value={confirmPassword}
              />
            </div>
          </div>

          <div className="rounded-lg border">
            <button
              aria-controls="install-onlyoffice-fields"
              aria-expanded={onlyOfficeOpen}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
              onClick={() => {
                setOnlyOfficeOpen((current) => !current);
              }}
              type="button"
            >
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">
                  OnlyOffice（可选，可稍后填写）
                </span>
                <span className="text-muted-foreground text-xs">
                  填写 Document Server 地址与 JWT 密钥后可在桌面端在线编辑。
                </span>
              </span>
              <ChevronDownIcon
                aria-hidden="true"
                className={`text-muted-foreground size-4 shrink-0 transition-transform ${
                  onlyOfficeOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {onlyOfficeOpen ? (
              <div
                className="grid gap-4 border-t px-3 py-3"
                id="install-onlyoffice-fields"
              >
                <div className="grid gap-2">
                  <Label htmlFor="install-onlyoffice-url">
                    Document Server 地址
                  </Label>
                  <Input
                    id="install-onlyoffice-url"
                    onChange={(event) => {
                      setOnlyOfficeUrl(event.target.value);
                    }}
                    placeholder="https://office.example.com"
                    value={onlyOfficeUrl}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="install-onlyoffice-secret">JWT 密钥</Label>
                  <Input
                    autoComplete="new-password"
                    id="install-onlyoffice-secret"
                    onChange={(event) => {
                      setOnlyOfficeJwtSecret(event.target.value);
                    }}
                    placeholder="与 Document Server 的 JWT_SECRET 一致"
                    type="password"
                    value={onlyOfficeJwtSecret}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <Button
            className="min-h-11 w-full"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "正在初始化…" : "完成安装"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

interface InstallSuccessProps {
  adminEmail: string;
  restartRequired: boolean;
}

export const InstallSuccess = ({
  adminEmail,
  restartRequired,
}: InstallSuccessProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void navigate({ replace: true, to: "/login" });
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <Card>
      <CardHeader>
        <span className="bg-success/10 text-success mb-1 grid size-11 place-items-center rounded-full">
          <CheckCircle2Icon className="size-6" />
        </span>
        <CardTitle className="text-xl">✅ 配置完成</CardTitle>
        <CardDescription className="break-all">
          已创建超级管理员 {adminEmail}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {restartRequired ? (
          <p className="bg-info/10 text-info rounded-lg px-3 py-2 text-sm text-pretty">
            OnlyOffice 配置已保存，重启服务后生效。
          </p>
        ) : null}

        <Button
          className="min-h-11 w-full"
          onClick={() => {
            void navigate({ replace: true, to: "/login" });
          }}
        >
          前往登录
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          3 秒后自动前往登录页…
        </p>
      </CardContent>
    </Card>
  );
};

export const InstallFormSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full max-w-sm" />
    </CardHeader>
    <CardContent className="grid gap-5">
      <Skeleton className="h-9 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-11 w-full" />
    </CardContent>
  </Card>
);
