import { sql } from "drizzle-orm";
import { check, index, snakeCase, text } from "drizzle-orm/sqlite-core";

import { user } from "#src/schema/auth.ts";
import {
  primaryId,
  tagsColumn,
  timestamp,
  timestamps,
} from "#src/schema/common.ts";
import { organization } from "#src/schema/organization.ts";

export const learningSessionKind = [
  "lecture",
  "meeting",
  "training",
  "case_review",
  "other",
] as const;

/** 科室内的一次学习会议 / 讲课 / 病例讨论。 */
export const learningSession = snakeCase.table(
  "learning_session",
  {
    id: primaryId(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text().notNull(),
    kind: text({ enum: learningSessionKind }).notNull().default("lecture"),
    heldAt: timestamp().notNull(),
    location: text(),
    speaker: text(),
    description: text(),
    tags: tagsColumn(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [
    index("learning_session_organization_idx").on(
      table.organizationId,
      table.heldAt
    ),
    check(
      "learning_session_title_length",
      sql`length(trim(${table.title})) between 1 and 200`
    ),
  ]
);

export type LearningSession = typeof learningSession.$inferSelect;

export type LearningSessionKind = (typeof learningSessionKind)[number];
