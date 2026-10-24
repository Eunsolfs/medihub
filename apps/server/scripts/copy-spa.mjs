import { copyFile, cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/**
 * 生产环境由服务端托管 SPA：把 apps/web 的构建产物放进 apps/server/dist/public。
 * `src/index.ts` 只在 dist/public 存在时才注册静态文件中间件，所以这一步是
 * 「pnpm build 之后能直接 node dist/index.mjs 打开整站」的前提。
 */
const here = import.meta.dirname;
const source = path.resolve(here, "../../web/dist");
const target = path.resolve(here, "../dist/public");

const exists = await stat(source).then(
  (info) => info.isDirectory(),
  () => false
);

if (!exists) {
  throw new Error(
    `找不到前端构建产物 ${source}，请先执行 pnpm --filter @medihub/web build`
  );
}

await rm(target, { force: true, recursive: true });

await cp(source, target, { recursive: true });

console.log(`SPA 已复制到 ${path.relative(process.cwd(), target)}`);

// 升级执行器随构建产物一起发布，线上 dist 自包含，不依赖仓库其它目录。
const distScripts = path.resolve(here, "../dist/scripts");
await mkdir(distScripts, { recursive: true });
await copyFile(
  path.resolve(here, "updater.mjs"),
  path.join(distScripts, "updater.mjs")
);
console.log("升级执行器已复制到 dist/scripts/updater.mjs");
