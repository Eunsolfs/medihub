// 只在生产环境注册 Service Worker：开发时缓存会干扰 Vite HMR。
if ("serviceWorker" in navigator && location.hostname !== "localhost") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 注册失败不影响主流程（例如浏览器禁用了 SW）。
    });
  });
}
