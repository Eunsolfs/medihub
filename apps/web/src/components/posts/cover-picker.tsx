import { useQuery } from "@tanstack/react-query";
import { ImagesIcon, ImageUpIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { cn } from "@medihub/ui/lib/utils";

import { UploadButton } from "#src/components/media/index.ts";
import { api } from "#src/lib/api.ts";

import { PostCover } from "./post-cover.tsx";
import { assetFileUrl } from "./post-utils.ts";

interface CoverPickerProps {
  assetId: string | null;
  disabled?: boolean;
  onChange: (assetId: string | null) => void;
  postId?: string;
}

interface Identifiable {
  id: string;
}

const isIdentifiable = (value: unknown): value is Identifiable =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  typeof (value as { id?: unknown }).id === "string";

const firstUploadedId = (uploaded: unknown): string | null => {
  const candidate: unknown = Array.isArray(uploaded)
    ? (uploaded as unknown[])[0]
    : uploaded;

  return isIdentifiable(candidate) ? candidate.id : null;
};

/** 封面：可以现传一张，也可以从资料库最近的图片里挑。 */
export const CoverPicker = ({
  assetId,
  disabled = false,
  onChange,
  postId,
}: CoverPickerProps) => {
  const [open, setOpen] = useState(false);

  const imagesQuery = useQuery(
    api.assets.list.queryOptions({
      enabled: open,
      input: { kind: "image", page: 1, pageSize: 24 },
    })
  );

  const handleUploaded = (uploaded: unknown) => {
    const id = firstUploadedId(uploaded);

    if (!id) {
      toast.error("没有拿到上传后的素材 ID");

      return;
    }

    onChange(id);
    setOpen(false);
    toast.success("封面已更新");
  };

  return (
    <div className="grid gap-2">
      <div className="border-border bg-muted/40 relative aspect-[16/9] overflow-hidden rounded-lg border">
        <PostCover assetId={assetId} name="封面" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button
          disabled={disabled}
          onClick={() => {
            setOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          <ImagesIcon />
          {assetId ? "更换封面" : "选择封面"}
        </Button>
        {assetId ? (
          <Button
            disabled={disabled}
            onClick={() => {
              onChange(null);
            }}
            size="sm"
            variant="ghost"
          >
            移除
          </Button>
        ) : null}
      </div>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>选择封面</DialogTitle>
            <DialogDescription>
              从资料库里挑一张图片，或者直接上传新的封面。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <UploadButton
              accept="image/*"
              label="上传封面"
              onUploaded={handleUploaded}
              target={postId ? { postId } : {}}
            />
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <ImageUpIcon className="size-3.5" />
              支持 JPG / PNG / WebP
            </span>
          </div>

          <p className="text-muted-foreground text-xs leading-relaxed">
            上传的封面会绑定到这篇文章，公开分享时匿名访客也能看到；从资料库选取的图片沿用素材自身的可见范围。
          </p>

          <div className="max-h-[50vh] overflow-y-auto pr-1">
            {imagesQuery.isPending ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton className="aspect-square rounded-lg" key={index} />
                ))}
              </div>
            ) : null}

            {imagesQuery.isError ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                资料库图片加载失败，可以直接上传一张。
              </p>
            ) : null}

            {imagesQuery.data && imagesQuery.data.items.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                资料库里还没有图片，先上传一张吧。
              </p>
            ) : null}

            {imagesQuery.data && imagesQuery.data.items.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {imagesQuery.data.items.map((asset) => {
                  const active = asset.id === assetId;

                  return (
                    <button
                      aria-label={`选择封面 ${asset.originalName}`}
                      aria-pressed={active}
                      className={cn(
                        "bg-muted/50 relative aspect-square overflow-hidden rounded-lg border transition-colors",
                        active
                          ? "border-primary ring-primary/40 ring-2"
                          : "hover:border-foreground/30"
                      )}
                      key={asset.id}
                      onClick={() => {
                        onChange(asset.id);
                        setOpen(false);
                      }}
                      type="button"
                    >
                      <img
                        alt={asset.originalName}
                        className="size-full object-cover"
                        loading="lazy"
                        src={assetFileUrl(asset.id)}
                      />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setOpen(false);
              }}
              variant="outline"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
