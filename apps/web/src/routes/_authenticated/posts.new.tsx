import { createFileRoute } from "@tanstack/react-router";

import { PostEditor } from "#src/components/posts/post-editor.tsx";

const NewPostPage = () => <PostEditor />;

export const Route = createFileRoute("/_authenticated/posts/new")({
  component: NewPostPage,
});
