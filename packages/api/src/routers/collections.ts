import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { asset, assetVisibility, collection } from "@medihub/db/schema/content";

import {
  canEditOwned,
  organizationIdOf,
  requirePublishRights,
} from "#src/access.ts";
import { organizationProcedure } from "#src/procedures.ts";

const collectionInput = z.object({
  description: z.string().max(2000).nullish(),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().min(1).nullish(),
  sortOrder: z.int().min(0).max(9999).default(0),
  visibility: z.enum(assetVisibility).default("org"),
});

export const collectionsRouter = {
  /** 平铺返回，前端自行组树；科室规模下数据量很小。 */
  list: organizationProcedure.handler(async ({ context }) => {
    const organizationId = organizationIdOf(context);

    return await context.db
      .select({
        _count: context.db.$count(asset, eq(asset.collectionId, collection.id)),
        createdAt: collection.createdAt,
        createdBy: collection.createdBy,
        description: collection.description,
        id: collection.id,
        name: collection.name,
        parentId: collection.parentId,
        sortOrder: collection.sortOrder,
        visibility: collection.visibility,
      })
      .from(collection)
      .where(eq(collection.organizationId, organizationId))
      .orderBy(asc(collection.sortOrder), asc(collection.name));
  }),

  create: organizationProcedure
    .input(collectionInput)
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      requirePublishRights(viewer);

      const [created] = await context.db
        .insert(collection)
        .values({
          createdBy: context.viewer?.id ?? null,
          description: input.description?.trim() || null,
          name: input.name,
          organizationId,
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder,
          visibility: input.visibility,
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "创建文件夹失败" });
      }

      return created;
    }),

  update: organizationProcedure
    .input(collectionInput.partial().extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { id, ...values } = input;

      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ createdBy: collection.createdBy })
        .from(collection)
        .where(
          and(
            eq(collection.id, id),
            eq(collection.organizationId, organizationId)
          )
        );

      if (!existing || !canEditOwned(viewer, existing.createdBy)) {
        throw new ORPCError("NOT_FOUND", { message: "文件夹不存在" });
      }

      if (values.parentId === id) {
        throw new ORPCError("BAD_REQUEST", {
          message: "文件夹不能作为自己的上级",
        });
      }

      const [updated] = await context.db
        .update(collection)
        .set({
          ...(values.description === undefined
            ? {}
            : { description: values.description?.trim() || null }),
          ...(values.name === undefined ? {} : { name: values.name }),
          ...(values.parentId === undefined
            ? {}
            : { parentId: values.parentId ?? null }),
          ...(values.sortOrder === undefined
            ? {}
            : { sortOrder: values.sortOrder }),
          ...(values.visibility === undefined
            ? {}
            : { visibility: values.visibility }),
        })
        .where(
          and(
            eq(collection.id, id),
            eq(collection.organizationId, organizationId)
          )
        )
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "文件夹不存在" });
      }

      return updated;
    }),

  remove: organizationProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = organizationIdOf(context);
      const { viewer } = context;

      if (!viewer) {
        throw new ORPCError("UNAUTHORIZED");
      }

      const [existing] = await context.db
        .select({ createdBy: collection.createdBy })
        .from(collection)
        .where(
          and(
            eq(collection.id, input.id),
            eq(collection.organizationId, organizationId)
          )
        );

      if (!existing || !canEditOwned(viewer, existing.createdBy)) {
        throw new ORPCError("NOT_FOUND", { message: "文件夹不存在" });
      }

      await context.db
        .update(collection)
        .set({ parentId: null })
        .where(
          and(
            eq(collection.parentId, input.id),
            eq(collection.organizationId, organizationId)
          )
        );

      const [removed] = await context.db
        .delete(collection)
        .where(
          and(
            eq(collection.id, input.id),
            eq(collection.organizationId, organizationId)
          )
        )
        .returning({ id: collection.id });

      if (!removed) {
        throw new ORPCError("NOT_FOUND", { message: "文件夹不存在" });
      }

      return removed;
    }),
};
