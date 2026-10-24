import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";

import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { DEFAULT_LIBRARY_SOURCE } from "#src/components/library/library-source.ts";
import { LibraryView } from "#src/components/library/library-view.tsx";

const LibraryCollectionPage = () => {
  const { collectionId } = useParams({
    from: "/_authenticated/library/$collectionId",
  });

  const navigate = useNavigate();

  return (
    <div className="grid gap-5">
      <PageHeader
        description="当前目录下的素材；可以批量移动、打包下载或删除。"
        title="科室资料库"
      />
      <LibraryView
        collectionId={collectionId}
        key={collectionId}
        onSourceChange={(next) => {
          void navigate({
            search: next === DEFAULT_LIBRARY_SOURCE ? {} : { source: next },
            to: "/library",
          });
        }}
        source="collections"
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/library/$collectionId")({
  component: LibraryCollectionPage,
});
