import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { LibraryView } from "#src/components/library/library-view.tsx";

const LibraryPage = () => (
  <div className="grid gap-5">
    <PageHeader
      description="科室培训 PPT、文档、图片与会议资料的统一归档处；左侧按专题组织目录。"
      title="科室资料库"
    />
    <LibraryView />
  </div>
);

export const Route = createFileRoute("/_authenticated/library/")({
  component: LibraryPage,
});
