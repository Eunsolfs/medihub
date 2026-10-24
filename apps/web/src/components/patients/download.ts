import { toast } from "sonner";

interface DownloadableAsset {
  id: string;
}

/**
 * 批量下载：逐个触发 /api/files/<id>/download。
 * 浏览器对并发下载有限制，这里串行错开 200ms。
 */
export const downloadAssets = (assets: readonly DownloadableAsset[]) => {
  if (assets.length === 0) {
    return;
  }

  for (const [index, asset] of assets.entries()) {
    window.setTimeout(() => {
      const link = document.createElement("a");
      link.href = `/api/files/${asset.id}/download`;
      link.rel = "noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    }, index * 200);
  }

  toast.success(
    assets.length === 1 ? "已开始下载" : `已开始下载 ${assets.length} 个文件`
  );
};
