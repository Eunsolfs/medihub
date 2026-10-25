import { integer, snakeCase, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { primaryId, timestamps } from "#src/schema/common.ts";

/**
 * A department. Every patient, asset and post belongs to exactly one
 * organization, which is the boundary the RBAC rules scope to.
 *
 * `personal` organizations are created for users without a department: they own
 * a private workspace of the same tables, so one permission model covers both.
 */
export const organization = snakeCase.table(
  "organization",
  {
    id: primaryId(),
    /** Human readable short code used in URLs and exports, e.g. `plastic-surgery`. */
    code: text().notNull(),
    kind: text({ enum: ["department", "personal"] as const })
      .notNull()
      .default("department"),
    description: text(),
    name: text().notNull(),
    /** 该科室可用的媒体存储上限（字节）；null 表示不单独限制，受全站总量约束。 */
    quotaBytes: integer(),
    ...timestamps,
  },
  (table) => [uniqueIndex("organization_code_unique").on(table.code)]
);

export type Organization = typeof organization.$inferSelect;
