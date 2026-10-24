import type { CollectionNode } from "#src/components/library/collection-tree.tsx";
import type { LibrarySource } from "#src/components/library/library-source.ts";
import type { MediaAsset } from "#src/components/media/index.ts";
import { formatDate } from "#src/lib/format.ts";

const captionLinkClass =
  "hover:text-foreground inline-flex max-w-full items-center gap-1 truncate font-normal hover:underline";

const mutedClass = "text-muted-foreground";

const FolderCaption = ({
  collections,
  collectionId,
}: {
  collections: readonly CollectionNode[];
  collectionId: string;
}) => {
  const folder = collections.find((node) => node.id === collectionId);

  return (
    <a className={captionLinkClass} href={`/library/${collectionId}`}>
      {folder?.name ?? "资料库目录"}
    </a>
  );
};

const PatientCaption = ({ asset }: { asset: MediaAsset }) => {
  const date = formatDate(asset.capturedAt ?? asset.createdAt);

  if (!asset.patientId) {
    return <span className={mutedClass}>患者记录</span>;
  }

  return (
    <>
      <a className={captionLinkClass} href={`/patients/${asset.patientId}`}>
        {asset.patientName ?? "患者档案"}
      </a>
      {/* 窄屏上文件信息行已经有日期，归属行只保留患者名，避免换行。 */}
      <span className={`${mutedClass} hidden whitespace-nowrap sm:inline`}>
        {" "}
        · {date}
      </span>
    </>
  );
};

const SessionCaption = ({ asset }: { asset: MediaAsset }) => {
  if (!asset.sessionId) {
    return <span className={mutedClass}>会议资料</span>;
  }

  return (
    <a className={captionLinkClass} href={`/sessions/${asset.sessionId}`}>
      {asset.sessionTitle ?? "学习会议"}
    </a>
  );
};

interface AssetCaptionProps {
  asset: MediaAsset;
  collections: readonly CollectionNode[];
  source: LibrarySource;
}

/**
 * 卡片底部的归属行：告诉用户这份素材从哪来、能点回源头。
 * 分类视图各自只展示对应来源；「全部素材」按 患者 → 会议 → 文章 → 目录 的优先级判断。
 */
export const AssetCaption = ({
  asset,
  collections,
  source,
}: AssetCaptionProps) => {
  if (source === "patients") {
    return <PatientCaption asset={asset} />;
  }

  if (source === "sessions") {
    return <SessionCaption asset={asset} />;
  }

  if (source === "posts") {
    return <span className={mutedClass}>文章附件</span>;
  }

  if (source === "collections") {
    return asset.collectionId ? (
      <FolderCaption
        collectionId={asset.collectionId}
        collections={collections}
      />
    ) : (
      <span className={mutedClass}>未归档文件夹</span>
    );
  }

  if (asset.patientId) {
    return <PatientCaption asset={asset} />;
  }

  if (asset.sessionId) {
    return <SessionCaption asset={asset} />;
  }

  if (asset.postId) {
    return <span className={mutedClass}>文章附件</span>;
  }

  if (asset.collectionId) {
    return (
      <FolderCaption
        collectionId={asset.collectionId}
        collections={collections}
      />
    );
  }

  return <span className={mutedClass}>未归类</span>;
};
