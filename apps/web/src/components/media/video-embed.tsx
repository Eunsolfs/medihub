import { ExternalLinkIcon } from "lucide-react";

import { cn } from "@medihub/ui/lib/utils";

import { assetFileUrl } from "./types.ts";

export type VideoProvider = "bilibili" | "asset" | "external";

export interface VideoEmbedProps {
  provider: VideoProvider;
  /** B 站填 BV 号或完整链接；asset 填素材 id 或 /api/files/... 地址。 */
  url?: string;
  title?: string;
  /** provider=asset 时可直接传素材 id，优先于 url。 */
  assetId?: string;
  className?: string;
}

const bilibiliSource = (value: string) => {
  const trimmed = value.trim();
  const bv = /(?<bvid>BV[0-9A-Za-z]{10})/u.exec(trimmed)?.groups?.bvid;

  if (bv) {
    return `//player.bilibili.com/player.html?bvid=${bv}&autoplay=0`;
  }

  const av = /(?:^|\/)(?<aid>av\d+)/iu.exec(trimmed)?.groups?.aid;

  if (av) {
    return `//player.bilibili.com/player.html?aid=${av.slice(2)}&autoplay=0`;
  }

  return null;
};

const assetSource = (url: string | undefined, assetId: string | undefined) => {
  const id = assetId?.trim() || url?.trim();

  if (!id) {
    return null;
  }

  if (
    id.startsWith("/") ||
    id.startsWith("http://") ||
    id.startsWith("https://")
  ) {
    return id;
  }

  return assetFileUrl(id);
};

/** 视频嵌入：B 站用 16:9 懒加载 iframe，本系统素材用原生 <video>。 */
export const VideoEmbed = ({
  provider,
  url,
  title = "视频",
  assetId,
  className,
}: VideoEmbedProps) => {
  const frame = (source: string) => (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg bg-black",
        className
      )}
    >
      <iframe
        src={source}
        title={title}
        loading="lazy"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );

  if (provider === "bilibili") {
    const source = url ? bilibiliSource(url) : null;

    if (!source) {
      return (
        <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          未识别到 B 站 BV 号或 av 号。
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-primary ml-1 inline-flex items-center gap-1 underline underline-offset-2"
            >
              打开原链接
              <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
        </div>
      );
    }

    return frame(source);
  }

  const source = assetSource(url, assetId);

  if (!source) {
    return (
      <div className="border-border bg-muted/40 text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        没有可播放的视频地址。
      </div>
    );
  }

  if (provider === "external") {
    return frame(source);
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg bg-black",
        className
      )}
    >
      <video
        src={source}
        title={title}
        controls
        playsInline
        preload="metadata"
        className="absolute inset-0 size-full object-contain"
      />
    </div>
  );
};
