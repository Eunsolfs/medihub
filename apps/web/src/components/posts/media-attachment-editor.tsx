import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  EyeIcon,
  FilmIcon,
  LinkIcon,
  PlusIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import { Separator } from "@medihub/ui/components/separator";
import { cn } from "@medihub/ui/lib/utils";

import {
  AssetThumb,
  UploadButton,
  VideoEmbed,
} from "#src/components/media/index.ts";

import {
  assetFileUrl,
  assetKindOfMedia,
  assetLikeOf,
  extractBilibiliBv,
  firstUploadedAsset,
  mediaKindLabels,
  mediaKindOfAssetKind,
  mediaProviderLabels,
  normalizeBilibiliUrl,
} from "./post-utils.ts";
import type { MediaDraft, MediaKind, MediaProvider } from "./post-utils.ts";

const MAX_MEDIA = 30;

const ADD_MODES: { id: MediaProvider; label: string }[] = [
  { id: "asset", label: "本系统素材" },
  { id: "bilibili", label: "B 站视频" },
  { id: "external", label: "外部链接" },
];

const MEDIA_KINDS: MediaKind[] = ["video", "image", "audio", "file"];

interface MediaAttachmentEditorProps {
  disabled?: boolean;
  media: MediaDraft[];
  onChange: (media: MediaDraft[]) => void;
  postId?: string;
}

/** 媒体附件：本系统素材 / B 站视频 / 外部链接，可排序、删除、预览。 */
export const MediaAttachmentEditor = ({
  disabled = false,
  media,
  onChange,
  postId,
}: MediaAttachmentEditorProps) => {
  const [mode, setMode] = useState<MediaProvider>("asset");
  const [assetIdInput, setAssetIdInput] = useState("");
  const [assetKind, setAssetKind] = useState<MediaKind>("video");
  const [bilibiliInput, setBilibiliInput] = useState("");
  const [bilibiliTitle, setBilibiliTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalTitle, setExternalTitle] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const append = (draft: MediaDraft) => {
    if (media.length >= MAX_MEDIA) {
      toast.error(`最多添加 ${MAX_MEDIA} 个媒体附件`);

      return;
    }

    onChange([...media, draft]);
  };

  const handleUploaded = (uploaded: unknown) => {
    const asset = firstUploadedAsset(uploaded);

    if (!asset) {
      toast.error("没有拿到上传后的素材 ID");

      return;
    }

    append({
      assetId: asset.id,
      durationSeconds: null,
      kind: mediaKindOfAssetKind(asset.kind),
      provider: "asset",
      title: asset.name,
      url: null,
    });
    toast.success("已添加素材附件");
  };

  const addAssetById = () => {
    const assetId = assetIdInput.trim();

    if (!assetId) {
      toast.error("请先填写素材 ID");

      return;
    }

    append({
      assetId,
      durationSeconds: null,
      kind: assetKind,
      provider: "asset",
      title: null,
      url: null,
    });
    setAssetIdInput("");
  };

  const addBilibili = () => {
    const url = normalizeBilibiliUrl(bilibiliInput);

    if (!url) {
      toast.error("没有找到 BV 号，请粘贴 B 站视频链接或 BV 号");

      return;
    }

    append({
      assetId: null,
      durationSeconds: null,
      kind: "video",
      provider: "bilibili",
      title: bilibiliTitle.trim() || null,
      url,
    });
    setBilibiliInput("");
    setBilibiliTitle("");
  };

  const addExternal = () => {
    const url = externalUrl.trim();

    if (!/^https?:\/\//u.test(url)) {
      toast.error("外部链接需要以 http:// 或 https:// 开头");

      return;
    }

    append({
      assetId: null,
      durationSeconds: null,
      kind: "file",
      provider: "external",
      title: externalTitle.trim() || null,
      url,
    });
    setExternalUrl("");
    setExternalTitle("");
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;

    if (target < 0 || target >= media.length) {
      return;
    }

    const next = [...media];
    const [item] = next.splice(index, 1);

    if (item) {
      next.splice(target, 0, item);
    }

    setPreviewIndex(null);
    onChange(next);
  };

  const remove = (index: number) => {
    setPreviewIndex(null);
    onChange(media.filter((_, current) => current !== index));
  };

  const bilibiliBv = extractBilibiliBv(bilibiliInput);

  return (
    <div className="grid gap-3">
      <div
        aria-label="添加媒体类型"
        className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
        role="tablist"
      >
        {ADD_MODES.map((item) => (
          <button
            aria-selected={mode === item.id}
            className={cn(
              "rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
              mode === item.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            disabled={disabled}
            key={item.id}
            onClick={() => {
              setMode(item.id);
            }}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "asset" ? (
        <div className="grid gap-2">
          <UploadButton
            disabled={disabled}
            label="上传素材"
            onUploaded={handleUploaded}
            target={postId ? { postId } : {}}
          />
          <p className="text-muted-foreground text-xs">
            也可以填写资料库里已有素材的 ID。
          </p>
          <div className="flex gap-1.5">
            <Input
              disabled={disabled}
              onChange={(event) => {
                setAssetIdInput(event.target.value);
              }}
              placeholder="素材 ID"
              value={assetIdInput}
            />
            <Button
              disabled={disabled}
              onClick={addAssetById}
              size="icon"
              title="添加素材"
              variant="outline"
            >
              <PlusIcon />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {MEDIA_KINDS.map((kind) => (
              <button
                aria-pressed={assetKind === kind}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs transition-colors",
                  assetKind === kind
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                disabled={disabled}
                key={kind}
                onClick={() => {
                  setAssetKind(kind);
                }}
                type="button"
              >
                {mediaKindLabels[kind]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "bilibili" ? (
        <div className="grid gap-2">
          <Input
            disabled={disabled}
            onChange={(event) => {
              setBilibiliInput(event.target.value);
            }}
            placeholder="粘贴链接或 BV 号，如 BV1xx411c7mD"
            value={bilibiliInput}
          />
          <Input
            disabled={disabled}
            onChange={(event) => {
              setBilibiliTitle(event.target.value);
            }}
            placeholder="标题（可选）"
            value={bilibiliTitle}
          />
          <p className="text-muted-foreground text-xs">
            {bilibiliBv
              ? `已识别 BV 号：${bilibiliBv}`
              : "支持完整链接或纯 BV 号"}
          </p>
          <Button
            disabled={disabled || !bilibiliBv}
            onClick={addBilibili}
            size="sm"
            variant="outline"
          >
            <VideoIcon />
            添加 B 站视频
          </Button>
        </div>
      ) : null}

      {mode === "external" ? (
        <div className="grid gap-2">
          <Input
            disabled={disabled}
            onChange={(event) => {
              setExternalUrl(event.target.value);
            }}
            placeholder="https://example.com/article"
            value={externalUrl}
          />
          <Input
            disabled={disabled}
            onChange={(event) => {
              setExternalTitle(event.target.value);
            }}
            placeholder="标题（可选）"
            value={externalTitle}
          />
          <Button
            disabled={disabled || externalUrl.trim().length === 0}
            onClick={addExternal}
            size="sm"
            variant="outline"
          >
            <LinkIcon />
            添加外部链接
          </Button>
        </div>
      ) : null}

      <Separator />

      <div className="grid gap-2">
        <p className="text-muted-foreground flex items-center justify-between text-xs">
          <span>媒体附件</span>
          <span className="tabular-nums">
            {media.length}/{MAX_MEDIA}
          </span>
        </p>

        {media.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
            还没有附件，可以嵌入本系统的视频、B 站视频或外链。
          </p>
        ) : null}

        {media.map((item, index) => {
          const key = `${item.provider}-${item.assetId ?? item.url ?? index}`;

          return (
            <div className="bg-card grid gap-2 rounded-lg border p-2" key={key}>
              <div className="flex items-start gap-2">
                <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-md">
                  {item.provider === "asset" && item.assetId ? (
                    <AssetThumb
                      asset={assetLikeOf(item.assetId, {
                        kind: assetKindOfMedia(item.kind),
                        name: item.title ?? "素材",
                      })}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground grid size-full place-items-center">
                      {item.provider === "bilibili" ? (
                        <VideoIcon className="size-5" />
                      ) : (
                        <LinkIcon className="size-5" />
                      )}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {item.title ??
                      extractBilibiliBv(item.url) ??
                      item.url ??
                      "未命名附件"}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1 text-[0.7rem]">
                    <span>{mediaProviderLabels[item.provider]}</span>
                    <span aria-hidden="true">·</span>
                    <span>{mediaKindLabels[item.kind]}</span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-0.5">
                  <div className="flex">
                    <Button
                      aria-label="上移"
                      disabled={disabled || index === 0}
                      onClick={() => {
                        move(index, -1);
                      }}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      aria-label="下移"
                      disabled={disabled || index === media.length - 1}
                      onClick={() => {
                        move(index, 1);
                      }}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <ChevronDownIcon />
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    {item.provider === "bilibili" ? (
                      <Button
                        aria-label="预览 B 站视频"
                        disabled={disabled}
                        onClick={() => {
                          setPreviewIndex(
                            previewIndex === index ? null : index
                          );
                        }}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <EyeIcon />
                      </Button>
                    ) : null}
                    <Button
                      aria-label="删除附件"
                      disabled={disabled}
                      onClick={() => {
                        remove(index);
                      }}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              </div>

              {item.provider === "bilibili" && previewIndex === index ? (
                <div className="bg-muted aspect-video overflow-hidden rounded-md">
                  <VideoEmbed
                    provider="bilibili"
                    title={item.title ?? "B 站视频"}
                    url={item.url ?? ""}
                  />
                </div>
              ) : null}

              {item.provider === "asset" && item.assetId ? (
                <a
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[0.7rem]"
                  href={assetFileUrl(item.assetId)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLinkIcon className="size-3" />
                  在浏览器中打开
                </a>
              ) : null}

              {item.provider === "external" && item.url ? (
                <a
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate text-[0.7rem]"
                  href={item.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <FilmIcon className="size-3 shrink-0" />
                  <span className="truncate">{item.url}</span>
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
