// Capacitor CLI 7.6 在 Node 24 下加载 .ts 配置会崩（自定义 require hook 与新版 Node 不兼容），
// 所以用 JSON 配置 + 这个脚本按环境变量生成，CI 与本地都走同一条路径。
import { writeFileSync } from "node:fs";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();

const config = {
  appId: "com.medihub.app",
  appName: "医档通",
  webDir: "../web/dist",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://"),
        },
      }
    : {}),
};

writeFileSync(
  new URL("../capacitor.config.json", import.meta.url),
  `${JSON.stringify(config, null, 2)}\n`
);

console.log(
  serverUrl
    ? `Capacitor 配置：远程加载 ${serverUrl}`
    : "Capacitor 配置：未设置 CAPACITOR_SERVER_URL，使用本地 web 资源（接口不可用）"
);
