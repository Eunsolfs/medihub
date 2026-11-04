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

# 只复制运行所需的构建产物：dist 已经 bundle 了服务端依赖与 SPA，
# 不再把整个 build stage 的 node_modules / 源码 / 测试搬进运行镜像。
COPY --chown=node:node --from=build /app/package.json /app/package.json
COPY --chown=node:node --from=build /app/apps/server/package.json /app/apps/server/package.json
COPY --chown=node:node --from=build /app/apps/server/dist /app/apps/server/dist
COPY --chown=node:node docker/entrypoint.sh /app/docker/entrypoint.sh

# /app 已通过 COPY --chown 设置属主；这里只处理可写数据目录，避免 chown 整个 /app 产生额外镜像层。
RUN mkdir -p /data/storage \
  && chown node:node /data /data/storage

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
