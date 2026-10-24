import { toViewer } from "@medihub/api";
import type { Viewer } from "@medihub/api";

import { auth } from "#src/context.ts";

export const viewerOf = async (request: Request): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: request.headers });

  return session ? toViewer(session.user) : null;
};
