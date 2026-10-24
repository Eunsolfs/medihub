import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import {
  DEFAULT_LIBRARY_SOURCE,
  isLibrarySource,
} from "#src/components/library/library-source.ts";
import type { LibrarySource } from "#src/components/library/library-source.ts";
import { LibraryView } from "#src/components/library/library-view.tsx";

interface LibrarySearch {
  source?: LibrarySource;
}

const validateSearch = (search: { source?: unknown }): LibrarySearch =>
  typeof search.source === "string" && isLibrarySource(search.source)
    ? { source: search.source }
    : {};

const LibraryPage = () => {
  const navigate = useNavigate();
  const { source } = Route.useSearch();
  const activeSource = source ?? DEFAULT_LIBRARY_SOURCE;

  return (
    <div className="grid gap-5">
      <PageHeader
        description="患者影像、会议资料、科室培训文件与教学附件各自归位；顶部按来源切换。"
        title="科室资料库"
      />
      <LibraryView
        onSourceChange={(next) => {
          void navigate({
            search: next === DEFAULT_LIBRARY_SOURCE ? {} : { source: next },
            to: "/library",
          });
        }}
        source={activeSource}
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/library/")({
  component: LibraryPage,
  validateSearch,
});
