export interface InstallStatus {
  installed: boolean;
  onlyOfficeConfigured: boolean;
  siteUrl: string;
  version: string;
}

interface InstallInput {
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  onlyOfficeJwtSecret?: string;
  onlyOfficeUrl?: string;
}

interface InstallResult {
  ok: true;
  restartRequired: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isInstallStatus = (value: unknown): value is InstallStatus => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.installed === "boolean" &&
    typeof value.onlyOfficeConfigured === "boolean" &&
    typeof value.siteUrl === "string" &&
    typeof value.version === "string"
  );
};

const isInstallResult = (value: unknown): value is InstallResult => {
  if (!isRecord(value)) {
    return false;
  }

  return value.ok === true && typeof value.restartRequired === "boolean";
};

const readErrorMessage = (payload: unknown) => {
  if (!isRecord(payload) || typeof payload.error !== "string") {
    return null;
  }

  return payload.error.trim() || null;
};

/** 安装状态是公开接口，失败时把错误收敛成安装页自己的文案。 */
export const fetchInstallStatus = async (): Promise<InstallStatus> => {
  const response = await fetch("/api/install/status", {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error("安装状态查询失败，请稍后重试");
  }

  const payload: unknown = await response.json();

  if (!isInstallStatus(payload)) {
    throw new Error("安装状态响应格式不正确");
  }

  return payload;
};

/** 提交首次安装；后端 4xx 的 error 原样抛给表单展示。 */
export const runInstall = async (
  input: InstallInput
): Promise<InstallResult> => {
  const response = await fetch("/api/install/run", {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const fallback =
      response.status === 429
        ? "尝试次数过多，请稍后再试"
        : response.status === 409
          ? "系统已经完成安装，请直接登录"
          : "安装失败，请稍后重试";

    throw new Error(readErrorMessage(payload) ?? fallback);
  }

  if (!isInstallResult(payload)) {
    throw new Error("安装响应格式不正确");
  }

  return payload;
};
