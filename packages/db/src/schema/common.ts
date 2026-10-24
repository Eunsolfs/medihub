import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";

/** SQLite has no native uuid; ids are generated in the application layer. */
export const primaryId = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const timestamp = () => integer({ mode: "timestamp_ms" });

export const timestamps = {
  createdAt: timestamp().notNull().default(now),
  updatedAt: timestamp()
    .notNull()
    .default(now)
    .$onUpdate(() => new Date()),
};

/** Free-form tags, stored as a JSON array of short labels. */
export const tagsColumn = () =>
  text({ mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`);
