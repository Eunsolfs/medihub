/**
 * 科室作用域的「存储层」：只读写 localStorage，不依赖 React 与 API 客户端。
 * `lib/api.ts`、`lib/upload.ts` 在发请求前读它；`lib/org-scope.ts` 的 hook 在
 * 它之上再包一层状态。这样拆分是为了避免 api ↔ hook 的循环依赖。
 */
const STORAGE_KEY = "medihub:org-scope";
const EVENT = "medihub:org-scope-change";

/** 空字符串表示「未指定」，此时由服务端回落到第一个科室 / 自己的科室。 */
export const scopeOrganizationId = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

/** 供 fetch / XHR 使用：把当前选中的科室带给所有 oRPC 与上传请求。 */
export const scopeHeaders = (): Record<string, string> => {
  const id = scopeOrganizationId();

  return id ? { "x-org-scope": id } : {};
};

export const setScopeOrganizationId = (id: string) => {
  try {
    if (id) {
      window.localStorage.setItem(STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 隐私模式下 localStorage 不可写：本次会话仍按内存值工作。
  }

  window.dispatchEvent(new Event(EVENT));
};

export const subscribeScope = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);

  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
};
