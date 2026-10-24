import { Link, createFileRoute } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { FileQuestionIcon } from "lucide-react";

import { buttonVariants } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { PostEditor } from "#src/components/posts/post-editor.tsx";

const PostEditPage = () => {
  const { postId } = Route.useParams();

  return <PostEditor postId={postId} />;
};

const messageOfError = (error: unknown): string =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : "文章可能已被删除，或者不属于当前科室。";

const PostEditError = ({ error }: ErrorComponentProps) => (
  <div className="grid gap-6">
    <PageHeader
      description="换一篇试试，或者回到列表重新查找。"
      title="无法打开这篇文章"
    />
    <EmptyState
      action={
        <Link className={cn(buttonVariants())} to="/posts">
          返回文章列表
        </Link>
      }
      description={messageOfError(error)}
      icon={FileQuestionIcon}
      title="文章不存在"
    />
  </div>
);

export const Route = createFileRoute("/_authenticated/posts/$postId")({
  component: PostEditPage,
  errorComponent: PostEditError,
});
