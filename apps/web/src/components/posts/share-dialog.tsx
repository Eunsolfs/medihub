import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  PrinterIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { cn } from "@medihub/ui/lib/utils";

import { copyText, publicPostUrl } from "./post-utils.ts";

interface SharePostDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
  title: string;
  /** 公开阅读页的分享区可以直接打印成 PDF / 纸质讲义。 */
  withPrint?: boolean;
}

export const SharePostDialog = ({
  onOpenChange,
  open,
  slug,
  title,
  withPrint = false,
}: SharePostDialogProps) => {
  const [copied, setCopied] = useState(false);
  const url = publicPostUrl(slug);

  const handleCopy = async () => {
    try {
      await copyText(url);
      setCopied(true);
      toast.success("分享链接已复制");
      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "复制失败，请手动复制"
      );
    }
  };

  const handlePrint = () => {
    onOpenChange(false);
    window.setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享文章</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {title}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <QRCodeSVG
              bgColor="#ffffff"
              fgColor="#111827"
              level="M"
              marginSize={1}
              size={168}
              title={`${title} 的分享二维码`}
              value={url}
            />
          </div>
          <p className="text-muted-foreground text-center text-xs">
            用手机扫码即可在浏览器里打开这篇文章
          </p>
        </div>

        <div className="bg-muted/60 rounded-lg px-3 py-2">
          <p className="text-muted-foreground truncate font-mono text-xs">
            {url}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={handleCopy} size="sm" variant="outline">
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "已复制" : "复制链接"}
          </Button>
          <a
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            href={url}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon />
            打开阅读页
          </a>
          {withPrint ? (
            <Button onClick={handlePrint} size="sm" variant="outline">
              <PrinterIcon />
              打印
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
