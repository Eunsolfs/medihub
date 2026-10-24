import { sql } from "drizzle-orm";
import { index, integer, snakeCase, text } from "drizzle-orm/sqlite-core";

import { organization } from "#src/schema/organization.ts";

const now = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

const timestamp = () => integer({ mode: "timestamp_ms" });

const timestamps = {
  createdAt: timestamp().notNull().default(now),
  updatedAt: timestamp()
    .notNull()
    .default(now)
    .$onUpdate(() => new Date()),
};

/** root 最高权限管理员 / 科室管理员 / 科室成员 / 无所属组织的自然人。 */
export const userRole = ["root", "dept_admin", "member", "individual"] as const;

export const userStatus = ["active", "disabled"] as const;

export const user = snakeCase.table(
  "user",
  {
    email: text().notNull().unique(),
    emailVerified: integer({ mode: "boolean" }).notNull().default(false),
    id: text().primaryKey(),
    image: text(),
    name: text().notNull(),
    role: text({ enum: userRole }).notNull().default("individual"),
    organizationId: text().references(() => organization.id, {
      onDelete: "set null",
    }),
    status: text({ enum: userStatus }).notNull().default("active"),
    /** 职称 / 职务，如「主治医师」。 */
    title: text(),
    phone: text(),
    ...timestamps,
  },
  (table) => [index("user_organization_idx").on(table.organizationId)]
);

export type UserRole = (typeof userRole)[number];

export const session = snakeCase.table(
  "session",
  {
    expiresAt: timestamp().notNull(),
    id: text().primaryKey(),
    ipAddress: text(),
    token: text().notNull().unique(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = snakeCase.table(
  "account",
  {
    accessToken: text(),
    accessTokenExpiresAt: timestamp(),
    accountId: text().notNull(),
    id: text().primaryKey(),
    idToken: text(),
    password: text(),
    providerId: text().notNull(),
    refreshToken: text(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verification = snakeCase.table(
  "verification",
  {
    expiresAt: timestamp().notNull(),
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
