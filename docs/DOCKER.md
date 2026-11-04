# 本地 Docker 部署

用于本机验收、演示与回归测试；生产环境仍推荐按 [INSTALL-1PANEL.md](./INSTALL-1PANEL.md) 安装，
以便使用 systemd、在线升级和 1Panel 反向代理。

## 快速开始

```bash
docker compose up -d --build
```

默认映射到 `http://localhost:8080`。首次启动会自动：

- 执行数据库迁移；
- 写入演示数据（2 个科室、3 个账号、示例患者/素材/帖子/学习会议）；
- 之后重启不会重复 seed。

初始账号（密码均为 `Medihub@2026`）：

| 账号                   | 角色       |
| ---------------------- | ---------- |
| `root@medihub.local`   | 超级管理员 |
| `admin@medihub.local`  | 科室管理员 |
| `doctor@medihub.local` | 科室成员   |

## 换端口

```bash
MEDIHUB_PORT=18080 docker compose up -d
```

`BETTER_AUTH_URL` 与可信来源会同步使用该端口。

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

- `BETTER_AUTH_SECRET`：至少 32 字符随机值（`openssl rand -hex 32`）；
- `SEED_ROOT_PASSWORD`：演示密码，正式使用前改掉或在管理端重置；
- `SEED_ON_START`：首次初始化后建议改为 `false`（已有账号本来也会跳过）。

其余变量含义见 [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md) 的环境变量章节。

## 能力边界

- 镜像内**没有** LibreOffice 与 OnlyOffice，docx/xlsx/pptx 只能下载后本地打开；
- Docker 模式不启用在线升级（升级用 `docker compose build --pull && docker compose up -d`）；
- 反向代理/HTTPS 由宿主机 Nginx/1Panel 负责；跨域登录需把外部地址加入
  `BETTER_AUTH_TRUSTED_ORIGINS`。

## 常用命令

```bash
docker compose logs -f medihub        # 日志
docker compose exec medihub node apps/server/src/reset-password.ts --list
docker compose exec medihub node apps/server/src/reset-password.ts root@medihub.local '新密码'
docker compose down                   # 停止（保留数据）
docker compose down -v                # 停止并删除数据卷（清空重来）
```
