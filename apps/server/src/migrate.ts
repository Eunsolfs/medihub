import { createDb } from "@medihub/db";
import { migrateDatabase } from "@medihub/db/migrate";

import { env } from "#src/env.ts";

const db = createDb(env.DATABASE_URL);

migrateDatabase(db);

db.$client.close();
