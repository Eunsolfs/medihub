# 本地 Docker 部署

> **这只是「本地试运行 / 手动 compose」的页面。**
> 生产要容器化部署 → [DOCKER-OPS.md](./DOCKER-OPS.md)：`medihub-ops.sh` 一条命令装好，
> 并负责升级、回滚、备份、恢复与自检（推荐）。
> 用 systemd 装到宿主机 → [1PANEL-FIRST-DEPLOY.md](./1PANEL-FIRST-DEPLOY.md)。

用于本机验收、演示与回归测试；本页的 compose 是给「自己动手」场景的参考，
生产环境建议走上面对应的两条路径之一（systemd 有页面在线升级，Docker 一键运维有 `ops.sh upgrade`）。

## 快速开始

```bash
docker compose up -d --build
```

默认映射到 `http://localhost:8080`（宿主 `MEDIHUB_PORT` → 容器内固定 `3000`）。
首次启动**只做数据库迁移，是一台空库**：不写入任何演示账号或演示数据。打开
`http://localhost:8080/install` 创建第一个超级管理员，即可登录使用。

## 换端口

```bash
MEDIHUB_PORT=18080 docker compose up -d
```

`BETTER_AUTH_URL` 与可信来源会同步使用该端口。

## 确认版本 / 健康检查

```bash
curl -fsS http://localhost:8080/api/health        # {"status":"ok","version":"1.10.3"}
docker compose exec medihub sh -c 'grep "\"version\"" /app/package.json'
```

## 数据持久化

SQLite、素材文件都在命名卷 `medihub-data` 的 `/data` 下：

```bash
docker compose exec medihub ls -lh /data
docker compose exec medihub ls -lh /data/storage | head
```

备份：

```bash
docker compose exec medihub sh -c 'tar czf - -C /data .' > medihub-data.tar.gz
```

恢复前先 `docker compose down`，解包回卷后再启动。

## 环境变量

在 `docker-compose.yml` 的 `environment` 中修改；生产必须替换：

- `BETTER_AUTH_SECRET`：至少 32 字符随机值（`openssl rand -hex 32`）——默认值仅供本地测试，
  对外提供服务前必须替换；

其余变量含义见 [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md) 的环境变量章节。

## 重置密码

```bash
# 列出账号（Node 24 直接跑 TS，走容器里已有的 DATABASE_URL）
docker compose exec medihub node apps/server/src/reset-password.ts --list
# 重置（不传密码会随机生成并打印）
docker compose exec medihub node apps/server/src/reset-password.ts <你的管理员邮箱> '新密码'
```

> 容器里**没有** pnpm（构建阶段的全局 pnpm 不会带进运行时镜像），所以不要用
> `pnpm --filter ... reset-password`；上面的 `node ...ts` 才是容器里的正确写法。

## 从 GHCR 拉取镜像（可选）

仓库的 `docker-ghcr` workflow 会把镜像发布到 GitHub Container Registry：

```bash
docker pull ghcr.io/eunsolfs/medihub:latest
# 或指定版本
docker pull ghcr.io/eunsolfs/medihub:1.10.3
```

不想在本机构建时，用仓库里的 GHCR compose：

```bash
# 先修改 docker-compose.ghcr.yml 里的 BETTER_AUTH_SECRET 和端口
docker compose -f docker-compose.ghcr.yml up -d
```

- 镜像只包含 amd64；
- 本仓库的包当前是 **public**，可直接匿名拉取；如果你 fork 后自己构建，包默认可能是 private，
  需要在 GitHub Package settings 改为 public，或先登录：
  `echo $GHCR_TOKEN | docker login ghcr.io -u 你的GitHub用户名 --password-stdin`；
- 镜像同样是**纯净版空库**：首次打开 `/install` 创建管理员，再建第一个科室；
- 升级镜像：`docker compose -f docker-compose.ghcr.yml pull && docker compose -f docker-compose.ghcr.yml up -d`；
- 数据仍在命名卷 `medihub-data:/data`，换镜像不会丢数据。

## 能力边界

- 镜像内**没有** LibreOffice 与 OnlyOffice，docx/xlsx/pptx 只能下载后本地打开；
- Docker 模式**不启用**在线升级（镜像层会被重启覆盖）；升级用
  `docker compose build --pull && docker compose up -d`，详见 [UPGRADE.md §5.3](./UPGRADE.md#53-1panel-与容器容器方案不适用本机制)；
- 反向代理/HTTPS 由宿主机 Nginx/1Panel 负责；跨域登录需把外部地址加入
  `BETTER_AUTH_TRUSTED_ORIGINS`。

## 常用命令

```bash
docker compose logs -f medihub        # 日志
docker compose exec medihub node apps/server/src/reset-password.ts --list
docker compose exec medihub node apps/server/src/reset-password.ts <你的管理员邮箱> '新密码'
docker compose exec medihub node apps/server/dist/migrate.mjs   # 手工补迁移
docker compose down                   # 停止（保留数据）
docker compose down -v                # 停止并删除数据卷（清空重来）
```
