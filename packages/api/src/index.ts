import type { RouterClient } from "@orpc/server";

import { admissionsRouter } from "#src/routers/admissions.ts";
import { assetsRouter } from "#src/routers/assets.ts";
import { auditRouter } from "#src/routers/audit.ts";
import { collectionsRouter } from "#src/routers/collections.ts";
import { exportsRouter } from "#src/routers/exports.ts";
import { health } from "#src/routers/health.ts";
import { learningRouter } from "#src/routers/learning.ts";
import { meRouter } from "#src/routers/me.ts";
import { orgsRouter } from "#src/routers/orgs.ts";
import { patientsRouter } from "#src/routers/patients.ts";
import { postsRouter } from "#src/routers/posts.ts";
import { statsRouter } from "#src/routers/stats.ts";
import { storageRouter } from "#src/routers/storage.ts";
import { systemRouter } from "#src/routers/system.ts";
import { usersRouter } from "#src/routers/users.ts";

export {
  canPublishContent,
  isAdminRole,
  postViewGate,
  requireClinicalRights,
  requirePublishRights,
  toViewer,
} from "#src/access.ts";

export { loadAudience } from "#src/audience.ts";

export type {
  LatestRelease,
  UpdatePhase,
  UpdateState,
  UpdateStatus,
  UpdaterAccess,
} from "#src/update.ts";

export {
  signShareAccess,
  verifyShareAccess,
  verifySharePassword,
} from "#src/share-password.ts";

export type {
  PostGateReason,
  PostShareRecord,
  PostShareVisibility,
  Role,
  ShareAudience,
  Viewer,
} from "#src/access.ts";

export type {
  Context,
  Context as ApiContext,
  StorageAccess,
} from "#src/context.ts";

export const appRouter = {
  admissions: admissionsRouter,
  assets: assetsRouter,
  audit: auditRouter,
  collections: collectionsRouter,
  exports: exportsRouter,
  health,
  learning: learningRouter,
  me: meRouter,
  orgs: orgsRouter,
  patients: patientsRouter,
  posts: postsRouter,
  stats: statsRouter,
  storage: storageRouter,
  system: systemRouter,
  users: usersRouter,
};

export type AppRouter = typeof appRouter;

export type AppRouterClient = RouterClient<AppRouter>;
