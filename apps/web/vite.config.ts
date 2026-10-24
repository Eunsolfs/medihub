import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

export default defineConfig(({ mode }) => {
  const { SERVER_URL = "http://localhost:3000" } = loadEnv(
    mode,
    import.meta.dirname,
    ""
  );

  return {
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react({ compiler: true }),
      tailwindcss(),
    ],
    server: {
      // 绑定双栈：Windows 上 localhost 解析到 ::1，只监听 127.0.0.1 会连不上；
      // 同时让同一局域网内的手机可以直接访问开发服务器做移动端调试。
      host: "::",
      port: 5173,
      proxy: {
        "/api": SERVER_URL,
        "/rpc": SERVER_URL,
      },
    },
  };
});
