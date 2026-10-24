import { eq } from "drizzle-orm";
import { z } from "zod";

import { user } from "@medihub/db/schema/auth";
import { organization } from "@medihub/db/schema/organization";

import { protectedProcedure } from "#src/procedures.ts";

export const meRouter = {
  /** 当前登录用户 + 所属科室，用于外壳与权限判断。 */
  profile: protectedProcedure.handler(async ({ context }) => {
    const { viewer } = context;

    if (!viewer) {
      return null;
    }

    const [organizationRow] = viewer.organizationId
      ? await context.db
          .select()
          .from(organization)
          .where(eq(organization.id, viewer.organizationId))
      : [];

    return { organization: organizationRow ?? null, viewer };
  }),

  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(60).optional(),
        phone: z.string().trim().max(30).optional(),
        title: z.string().trim().max(60).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const { viewer } = context;

      if (!viewer) {
        return null;
      }

      const [updated] = await context.db
        .update(user)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.phone === undefined ? {} : { phone: input.phone || null }),
          ...(input.title === undefined ? {} : { title: input.title || null }),
        })
        .where(eq(user.id, viewer.id))
        .returning();

      return updated ?? null;
    }),
};
