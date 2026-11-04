#!/bin/sh
set -eu

node apps/server/dist/migrate.mjs

if [ "${SEED_ON_START:-false}" = "true" ]; then
  HAS_USER="$(
    node -e '
      const { DatabaseSync } = require("node:sqlite");
      try {
        const db = new DatabaseSync(process.env.DATABASE_URL);
        const row = db.prepare("select count(*) as c from user").get();
        console.log(row.c);
      } catch {
        console.log(0);
      }
    ' 2>/dev/null || echo 0
  )"

  if [ "${HAS_USER:-0}" = "0" ]; then
    echo "[docker] 首次启动，写入演示数据…"
    node apps/server/src/seed.ts
  else
    echo "[docker] 已有账号，跳过 seed"
  fi
fi

exec node apps/server/dist/index.mjs
