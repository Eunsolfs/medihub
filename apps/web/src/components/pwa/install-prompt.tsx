import { DownloadIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { buttonVariants } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isInstallPromptEvent = (
  event: Event
): event is BeforeInstallPromptEvent =>
  "prompt" in event &&
  typeof (event as { prompt?: unknown }).prompt === "function";

const DISMISS_KEY = "medihub:install-dismissed";

/** 安卓/桌面 Chrome：可安装时在底部给一次「安装到手机桌面」的机会。 */
export const InstallPrompt = () => {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (event: Event) => {
      if (!isInstallPromptEvent(event)) {
        return;
      }

      event.preventDefault();
      setInstallEvent(event);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  if (!installEvent || dismissed) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);

    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 隐私模式下写不了 localStorage，本次隐藏即可。
    }
  };

  return (
    <div className="bg-background/95 fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur md:bottom-6 print:hidden">
      <div className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
        <DownloadIcon aria-hidden className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">安装到手机桌面</p>
        <p className="text-muted-foreground text-xs leading-5">
          像独立 App 一样全屏打开，拍照上传更快
        </p>
      </div>
      <button
        type="button"
        className={cn(buttonVariants({ size: "sm" }), "min-h-11 shrink-0")}
        onClick={() => {
          void (async () => {
            await installEvent.prompt();
            await installEvent.userChoice;
            dismiss();
          })();
        }}
      >
        安装
      </button>
      <button
        type="button"
        aria-label="关闭安装提示"
        className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center rounded-md"
        onClick={dismiss}
      >
        <XIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
};
