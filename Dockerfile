FROM node:24-bookworm-slim AS build

WORKDIR /app

# pnpm 与仓库 engines 对齐
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@12.15.0

# 先复制依赖清单，利用 Docker 缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/api/package.json packages/api/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build


FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# 运行时保留工作区与依赖（dist 中仍有 workspace 包的外部引用）
COPY --from=build /app /app

RUN mkdir -p /data/storage \
  && chown -R node:node /app /data

USER node

ENV DATABASE_URL=/data/local.db \
    STORAGE_ROOT=/data/storage \
    BETTER_AUTH_URL=http://localhost:8080 \
    PORT=3000 \
    UPLOAD_MAX_BYTES=268435456

EXPOSE 3000

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "/app/docker/entrypoint.sh"]



