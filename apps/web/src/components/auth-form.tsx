import { useMutation } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";

import { authClient } from "#src/lib/auth.ts";

type Mode = "sign-in" | "sign-up";

const copy = {
  "sign-in": {
    title: "登录医档通",
    description: "使用科室分配的邮箱登录",
    submit: "登录",
    switchHint: "还没有账号？",
    switchAction: "注册",
  },
  "sign-up": {
    title: "注册账号",
    description: "使用科室分配的邮箱创建账号",
    submit: "注册",
    switchHint: "已有账号？",
    switchAction: "登录",
  },
} as const;

const formValue = (form: FormData, name: string) => {
  const value = form.get(name);

  if (value === null || value instanceof File) {
    return "";
  }

  return value;
};

/** Better Auth 的错误是英文的，映射成可操作的中文提示。 */
export const authErrorMessage = (mode: Mode, message: string): string => {
  const text = message.toLowerCase();

  if (text.includes("invalid email or password")) {
    return "邮箱或密码不正确";
  }

  if (text.includes("already exists")) {
    return "该邮箱已注册，请直接登录";
  }

  if (text.includes("password") && text.includes("8")) {
    return "密码至少 8 位";
  }

  if (text.includes("invalid email")) {
    return "请输入有效的邮箱地址";
  }

  if (text.includes("name")) {
    return "请填写姓名";
  }

  if (text.includes("network") || text.includes("fetch")) {
    return "网络异常，请稍后重试";
  }

  return mode === "sign-in"
    ? "登录失败，请检查邮箱与密码"
    : "注册失败，请稍后重试";
};

const authenticate = async (mode: Mode, form: FormData) => {
  const email = formValue(form, "email").trim();
  const password = formValue(form, "password");

  if (password.length < 8) {
    throw new Error("Password too short, minimum 8 characters");
  }

  const { error } =
    mode === "sign-in"
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({
          email,
          password,
          name: formValue(form, "name").trim(),
        });

  if (error) {
    throw new Error(error.message ?? error.statusText);
  }
};

interface AuthFormProps {
  onSuccess: () => Promise<void>;
}

export const AuthForm = ({ onSuccess }: AuthFormProps) => {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const text = copy[mode];

  const { mutate, isPending } = useMutation({
    mutationFn: async (form: FormData) => {
      await authenticate(mode, form);
    },
    onError: (error) => {
      setErrorMessage(authErrorMessage(mode, error.message));
    },
    onSuccess,
  });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    mutate(new FormData(event.currentTarget));
  };

  const switchMode = () => {
    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
    setErrorMessage(null);
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{text.title}</h1>
        <p className="text-muted-foreground text-sm">{text.description}</p>
      </header>

      <form className="grid gap-4" noValidate={false} onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <div className="grid gap-2">
            <Label htmlFor="name">姓名</Label>
            <Input
              autoComplete="name"
              id="name"
              name="name"
              placeholder="请输入真实姓名"
              required
            />
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            autoComplete="email"
            id="email"
            name="email"
            placeholder="name@hospital.cn"
            required
            type="email"
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">密码</Label>
            <span className="text-muted-foreground text-xs">至少 8 位</span>
          </div>
          <Input
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            id="password"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </div>

        {errorMessage === null ? null : (
          <p
            className="text-destructive flex items-start gap-1.5 text-sm"
            role="alert"
          >
            <TriangleAlertIcon
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {errorMessage}
          </p>
        )}

        <Button className="w-full" disabled={isPending} type="submit">
          {isPending ? "处理中…" : text.submit}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        {text.switchHint}{" "}
        <button
          className="text-primary font-medium underline-offset-4 hover:underline"
          onClick={switchMode}
          type="button"
        >
          {text.switchAction}
        </button>
      </p>
    </div>
  );
};
