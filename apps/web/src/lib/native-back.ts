import { useEffect } from "react";

/**
 * 安卓返回键/返回手势：优先回到上一页，已经在首屏时才退出 App。
 * 只在 Capacitor 原生壳里注册；浏览器/PWA 完全无副作用。
 */
export const useNativeBackButton = () => {
  useEffect(() => {
    let remove: (() => void) | undefined;
    let disposed = false;

    const setup = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");

        if (!Capacitor.isNativePlatform()) {
          return;
        }

        const { App } = await import("@capacitor/app");

        const listener = await App.addListener("backButton", (event) => {
          if (event.canGoBack) {
            window.history.back();

            return;
          }

          void App.exitApp();
        });

        if (disposed) {
          void listener.remove();

          return;
        }

        remove = () => {
          void listener.remove();
        };
      } catch {
        // 插件缺失或原生环境异常时保持默认行为，不影响网页端。
      }
    };

    void setup();

    return () => {
      disposed = true;
      remove?.();
    };
  }, []);
};
