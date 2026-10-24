import { readFileSync } from "node:fs";

/**
 * 应用版本号：构建/运行时从仓库根 `package.json` 读取。
 * `src/index.ts` 与打包后的 `dist/index.mjs` 到仓库根的相对深度一致，
 * 因此同一个路径在开发与生产都成立；打包进容器等非常规布局时回退 `unknown`。
 */
export const appVersion = (() => {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf-8")
    ) as { version?: string };

    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
})();
