import { defineRelations } from "drizzle-orm";

import { account, session, user, verification } from "#src/schema/auth.ts";
import { asset, collection, post, postMedia } from "#src/schema/content.ts";
import { learningSession } from "#src/schema/learning.ts";
import { organization } from "#src/schema/organization.ts";
import { admission, patient } from "#src/schema/patients.ts";
import { auditLog, exportJob, storageTarget } from "#src/schema/system.ts";

export const relations = defineRelations(
  {
    account,
    admission,
    asset,
    auditLog,
    collection,
    exportJob,
    learningSession,
    organization,
    patient,
    post,
    postMedia,
    session,
    storageTarget,
    user,
    verification,
  },
  (r) => ({
    account: {
      user: r.one.user({ from: r.account.userId, to: r.user.id }),
    },
    admission: {
      assets: r.many.asset(),
      organization: r.one.organization({
        from: r.admission.organizationId,
        to: r.organization.id,
      }),
      patient: r.one.patient({
        from: r.admission.patientId,
        to: r.patient.id,
      }),
    },
    asset: {
      admission: r.one.admission({
        from: r.asset.admissionId,
        to: r.admission.id,
      }),
      collection: r.one.collection({
        from: r.asset.collectionId,
        to: r.collection.id,
      }),
      organization: r.one.organization({
        from: r.asset.organizationId,
        to: r.organization.id,
      }),
      owner: r.one.user({ from: r.asset.ownerId, to: r.user.id }),
      patient: r.one.patient({ from: r.asset.patientId, to: r.patient.id }),
      post: r.one.post({ from: r.asset.postId, to: r.post.id }),
      session: r.one.learningSession({
        from: r.asset.sessionId,
        to: r.learningSession.id,
      }),
    },
    auditLog: {
      actor: r.one.user({ from: r.auditLog.actorId, to: r.user.id }),
      organization: r.one.organization({
        from: r.auditLog.organizationId,
        to: r.organization.id,
      }),
    },
    collection: {
      assets: r.many.asset(),
      children: r.many.collection({
        from: r.collection.id,
        to: r.collection.parentId,
      }),
      organization: r.one.organization({
        from: r.collection.organizationId,
        to: r.organization.id,
      }),
      parent: r.one.collection({
        from: r.collection.parentId,
        to: r.collection.id,
      }),
    },
    exportJob: {
      organization: r.one.organization({
        from: r.exportJob.organizationId,
        to: r.organization.id,
      }),
      requester: r.one.user({
        from: r.exportJob.requestedBy,
        to: r.user.id,
      }),
    },
    learningSession: {
      assets: r.many.asset(),
      organization: r.one.organization({
        from: r.learningSession.organizationId,
        to: r.organization.id,
      }),
    },
    organization: {
      admissions: r.many.admission(),
      assets: r.many.asset(),
      collections: r.many.collection(),
      learningSessions: r.many.learningSession(),
      patients: r.many.patient(),
      posts: r.many.post(),
      storageTargets: r.many.storageTarget(),
      users: r.many.user(),
    },
    patient: {
      admissions: r.many.admission(),
      assets: r.many.asset(),
      organization: r.one.organization({
        from: r.patient.organizationId,
        to: r.organization.id,
      }),
    },
    post: {
      assets: r.many.asset(),
      author: r.one.user({ from: r.post.authorId, to: r.user.id }),
      media: r.many.postMedia(),
      organization: r.one.organization({
        from: r.post.organizationId,
        to: r.organization.id,
      }),
    },
    postMedia: {
      asset: r.one.asset({ from: r.postMedia.assetId, to: r.asset.id }),
      post: r.one.post({ from: r.postMedia.postId, to: r.post.id }),
    },
    session: {
      user: r.one.user({ from: r.session.userId, to: r.user.id }),
    },
    storageTarget: {
      organization: r.one.organization({
        from: r.storageTarget.organizationId,
        to: r.organization.id,
      }),
    },
    user: {
      accounts: r.many.account(),
      assets: r.many.asset(),
      organization: r.one.organization({
        from: r.user.organizationId,
        to: r.organization.id,
      }),
      posts: r.many.post(),
      sessions: r.many.session(),
    },
  })
);
