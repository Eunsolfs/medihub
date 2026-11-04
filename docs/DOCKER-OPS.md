# Docker 一键运维（medihub-ops.sh）

用**一个脚本 + Docker Compose** 把医档通装起来，并且顺手把日常运维也包了：升级、回滚、备份、
恢复、看日志、环境自检。不自建 Node、不碰 systemd，容器里跑的就是 GHCR 上的镜像。

- 脚本：`scripts/medihub-ops.sh`，随每个 Release 发布为资产 `medihub-ops.sh`（v1.10.2）；
- 镜像：`ghcr.io/eunsolfs/medihub:<tag>`（public，可直接匿名拉取）；
- 默认：安装目录 `/opt/medihub-docker`、宿主端口 `8080`、Compose project `medihub-docker`、
  数据卷 `medihub_data`（`/data/local.db` + `/data/storage`）。

> 本文是**容器化一键运维**的主文档。只想快速在本机跑一下 → [DOCKER.md](./DOCKER.md)；
> 用 systemd 装到宿主机 → [1PANEL-FIRST-DEPLOY.md](./1PANEL-FIRST-DEPLOY.md)。

## 目录

1. [选哪条路](#1-选哪条路)
2. [前置条件](#2-前置条件)
3. [安装](#3-安装)
4. [反向代理与 HTTPS](#4-反向代理与-https)
5. [初始化管理员与第一个科室](#5-初始化管理员与第一个科室)
6. [日常运维命令](#6-日常运维命令)
7. [备份与恢复](#7-备份与恢复)
8. [升级与回滚](#8-升级与回滚)
9. [数据卷、目录与迁移](#9-数据卷目录与迁移)
10. [故障排查](#10-故障排查)
11. [定时任务（1Panel 计划任务）](#11-定时任务1panel-计划任务)
12. [相关文档](#12-相关文档)

---

## 1. 选哪条路

一台机器**只能选一种**安装方式，别混用：

| 方式                                                 | 装在哪                                                  | 谁管升级                                         | 适合                                   |
| ---------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| **systemd 一键（install-1panel.sh）**                | 宿主机 `/opt/medihub`，Node 24 + pnpm                   | 「系统管理 → 版本与升级」在线升级，或 `--update` | 1Panel 上长期运行，想用页面点升级      |
| **手工 Docker（docker-compose.yml / GHCR compose）** | 你自己建 compose 文件                                   | 手动 `docker compose pull && up -d`              | 本地演示、验收、已有编排体系           |
| **Docker 一键运维（本文脚本）**                      | `/opt/medihub-docker`，Compose project `medihub-docker` | `ops.sh upgrade`（自动备份、失败回滚镜像配置）   | 想用容器统一管理、又要有备份/回滚/自检 |

为什么 Docker 下不能用页面里的在线升级：那套机制要在安装目录里替换 `apps/server/dist` 并重启
systemd 服务；容器里 `dist` 属于镜像层，一重启就还原。**Docker 的升级入口只有 `ops.sh upgrade`。**

> ⚠️ 本脚本与 systemd 一键安装**互斥**：它生成的 `.env` 与 `docker-compose.yml` 放在
> `/opt/medihub-docker`，而 systemd 安装在 `/opt/medihub`。同一台机器请只保留一种；
> 如果误把 `MH_DIR` 指到 systemd 的目录，脚本会直接拒绝（检测到非本脚本生成的 `.env`）。

---

## 2. 前置条件

| 项目    | 要求                                                                              |
| ------- | --------------------------------------------------------------------------------- |
| 系统    | Linux（Debian / Ubuntu / Rocky / Alma / CentOS Stream 均可）                      |
| Docker  | **Engine 24+**，且当前用户有权限（脚本一般用 `sudo` 运行）                        |
| Compose | **Docker Compose v2**（`docker compose version` 可用；不是老的 `docker-compose`） |
| 网络    | 能访问 `ghcr.io`（拉镜像）、`github.com`（下载脚本）                              |
| 1Panel  | 已装 1Panel 且其 Docker 可用（脚本只用一个 compose project，不依赖 1Panel API）   |
| 端口    | 一个宿主端口（默认 `8080`，可改）；公网只需放行 80/443                            |

自查：

```bash
docker --version
docker compose version
docker info >/dev/null && echo "Docker 权限 OK"
```

装完脚本后也可以让它自查：

```bash
sudo bash /opt/medihub-docker/ops.sh doctor
```

---

## 3. 安装

### 3.1 下载并安装（推荐）

```bash
curl -fsSL https://github.com/Eunsolfs/medihub/releases/latest/download/medihub-ops.sh -o /tmp/medihub-ops.sh
sudo bash /tmp/medihub-ops.sh install
```

交互式会问你两项：

1. **对外访问地址**（域名或 `http://IP:端口`）→ 写入 `MH_URL` 与 `BETTER_AUTH_URL`；
2. **宿主机端口**（默认 8080）。

脚本随后会：生成 `/opt/medihub-docker/.env` 与 `docker-compose.yml` → 拉镜像 → `compose up -d`
→ 轮询 `/api/health` → 打印访问地址、数据卷与后续命令，并把脚本自身复制成
`/opt/medihub-docker/ops.sh`（以后用它做运维）。

### 3.2 非交互安装

```bash
sudo bash /tmp/medihub-ops.sh install --url https://medihub.summerecho.cn --port 18080
```

| 参数           | 说明                                                    |
| -------------- | ------------------------------------------------------- |
| `--url URL`    | 对外访问地址（必须是 `http(s)://`；结尾斜杠会去掉）     |
| `--port 端口`  | 宿主端口，1–65535 的数字                                |
| `--tag 版本`   | 用 `ghcr.io/eunsolfs/medihub:<版本>`，如 `--tag 1.10.2` |
| `--image 镜像` | 直接用完整镜像地址（私有仓库/自建镜像时用）             |
| `--dir 目录`   | 安装目录（默认 `/opt/medihub-docker`）                  |
| `--yes`        | 自动确认                                                |

也可以用环境变量覆盖：`MH_DIR` / `MH_IMAGE` / `MH_PORT` / `MH_URL` / `MH_YES` /
`MH_DRY_RUN` / `MH_SKIP_PULL`。

### 3.3 先看它要做什么（不写盘、不启动）

```bash
MH_DIR=/tmp/medihub-docker MH_DRY_RUN=1 \
  sudo -E bash /tmp/medihub-ops.sh install --url https://medihub.example.com --port 18080
# 只生成 /tmp/medihub-docker 下的 .env 与 docker-compose.yml，不拉镜像、不启动容器
```

> `MH_DRY_RUN=1` 会真的写 `.env` 与 compose 文件（方便你 review），但不会 pull/up。

### 3.4 生成的文件

```
/opt/medihub-docker/
├─ .env                 # MH_IMAGE / MH_PORT / MH_URL / MH_SERVER_IP / BETTER_AUTH_SECRET / TZ / UPLOAD_MAX_BYTES（chmod 600）
├─ docker-compose.yml   # project 名 medihub-docker，端口 ${MH_PORT}:3000，卷 medihub_data:/data
├─ ops.sh               # 脚本自身的副本（以后运维用它）
└─ backups/             # 备份产物
```

> `.env` 里有会话密钥，**不要**提交到 Git，也不要随备份发到不安全的位置（备份包本身是 `chmod 600`）。

---

## 4. 反向代理与 HTTPS

应用映射到宿主机的 `MH_PORT`（默认 `8080:3000`，容器内固定 3000）。注意 Compose 默认绑定
**所有网卡**（`0.0.0.0:8080`），所以：防火墙/安全组只放行 80、443，**不要**把 8080 暴露到公网；
反代是同机直连，填 `http://127.0.0.1:<MH_PORT>` 即可。

**界面：1Panel → 网站 → 创建网站 → 反向代理**，代理地址填 `http://127.0.0.1:8080`（换成你的端口），
然后在站点配置里加上传与超时，否则大视频/PPT 会 413 或 502：

```nginx
client_max_body_size 300m;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;   # 单值！
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_buffering off;
```

逐条原因见 [FIRST §3.1](./1PANEL-FIRST-DEPLOY.md#31-加上传与超时配置)。要点：

- `X-Forwarded-For` 必须是**单值** `$remote_addr`，否则 Better Auth 视为不可信、所有用户共享限流桶；
- 证书与强制跳转：**1Panel → 网站 → SSL 证书 → 申请 Let's Encrypt**，再在站点 HTTPS 里开启跳转
  （[FIRST §4](./1PANEL-FIRST-DEPLOY.md#4-申请-https-证书)）；
- 用 HTTPS 访问时，安装时填的 `--url` 也要是 `https://…`；改域名要同时改 `.env` 的 `MH_URL`
  （compose 从它生成 `BETTER_AUTH_URL` 与可信来源）并 `ops.sh restart`。

---

## 5. 初始化管理员与第一个科室

**首次安装不创建任何账号**（纯净版，无演示数据）。装完：

1. 浏览器打开 `<MH_URL>/install`（例如 `https://medihub.summerecho.cn/install`）；
2. 填超级管理员姓名 / 邮箱 / 密码（可选填 OnlyOffice 地址与 JWT 密钥）→ 完成安装；
3. 用该账号登录；
4. 到 **系统管理 → 科室** 新建**第一个科室**——空库没有科室，工作台会提示「先创建第一个科室」；
   建完才能创建患者、资料库与教学会议。

> 已有账号后 `/install` 会返回 409，不会被用来重置管理员。
> 忘记密码：`sudo bash /opt/medihub-docker/ops.sh` 所在目录里执行
> `docker compose exec app node apps/server/src/reset-password.ts --list`（先 `cd /opt/medihub-docker`）。

---

## 6. 日常运维命令

脚本安装在 `/opt/medihub-docker/ops.sh`，所有命令都可以直接在服务器上执行（`sudo`）：

| 命令             | 作用                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `status`         | 容器状态 + `/api/health` 检查 + 当前镜像/访问地址/卷/备份目录          |
| `logs`           | 跟踪应用日志（`compose logs -f --tail=200 app`）                       |
| `backup [备注]`  | 备份 SQLite + 素材 + `.env`（**短暂停服**保证一致性），见 §7           |
| `restore <文件>` | 从备份恢复（二次确认，恢复前自动备份），见 §7                          |
| `upgrade [tag]`  | 升级镜像（默认 `latest`），升级前自动备份，失败自动回滚镜像配置，见 §8 |
| `rollback`       | 回滚到上一次升级前的镜像配置（`$MH_DIR/.env.bak`）                     |
| `restart`        | 重启应用并等健康检查                                                   |
| `down`           | 停止并移除容器（保留数据卷）                                           |
| `uninstall`      | 卸载容器，逐项询问是否删数据卷 / 删安装目录                            |
| `doctor`         | 环境自检（Docker / Compose / 权限 / 配置 / 数据卷）                    |
| `version`        | 打印脚本版本与默认镜像                                                 |
| `menu`           | 交互式菜单（无参数且是终端时默认进入）                                 |

```bash
# 常用
sudo bash /opt/medihub-docker/ops.sh status
sudo bash /opt/medihub-docker/ops.sh logs
sudo bash /opt/medihub-docker/ops.sh backup nightly
sudo bash /opt/medihub-docker/ops.sh upgrade 1.10.2
```

---

## 7. 备份与恢复

### 7.1 备份内容

`backup [备注]` 会产出一个 `tar.gz`：

```
/opt/medihub-docker/backups/medihub-<YYYYmmdd-HHMMSS>-<备注>.tar.gz   (chmod 600)
├─ local.db          # SQLite 主库
├─ local.db-wal      # 若存在
├─ local.db-shm      # 若存在
├─ storage/          # 素材目录（若存在）
└─ env.bak           # 当次 .env 副本
```

**备份期间会短暂停服**：脚本先 `compose stop app`，从数据卷只读复制
`local.db`（含 `-wal`/`-shm`）与 `storage/`，打包完成后自动 `compose up -d` 并等健康检查。
这是为了让 SQLite 与素材落在同一时刻，避免「库和文件对不上」。停服时间通常是秒级，
素材特别大时会更久（受 copy 速度影响）。

> 备份要求应用正在运行；容器没起来时脚本会直接报错，不会给你一份不完整的数据。

### 7.2 恢复

```bash
sudo bash /opt/medihub-docker/ops.sh restore /opt/medihub-docker/backups/medihub-20261104-120000-nightly.tar.gz
```

流程：

1. **二次确认**（`MH_YES=1` 可跳过，用于自动化）；
2. 如果应用在运行，**先自动做一份 `pre-restore` 备份**（失败只警告，继续恢复）；
3. 停服 → 清掉当前 `local.db` / `-wal` / `-shm`、替换 `storage/` → 修正属主（`chown 1000:1000`）；
4. 启动并等健康检查。

要点：

- 恢复的是**数据库 + 素材**；**不会覆盖当前 `.env`**（环境变量仍以 `.env` 为准）；
- 备份包里必须有 `local.db`，否则直接报错；
- 恢复到更早版本的数据后，如果当前镜像已经跑过更新的迁移，可能需要在确认兼容后继续升级；
  需要「数据 + 镜像」一起退，先 `rollback` 再 `restore`（见 §8）。

---

## 8. 升级与回滚

### 8.1 升级

```bash
sudo bash /opt/medihub-docker/ops.sh upgrade            # 升到 latest
sudo bash /opt/medihub-docker/ops.sh upgrade 1.10.2     # 指定版本
sudo bash /opt/medihub-docker/ops.sh upgrade ghcr.io/eunsolfs/medihub:1.10.2   # 完整镜像地址
```

脚本会：

1. 若应用在运行，**先自动备份**（标签 `pre-upgrade`）；
2. 备份 `.env` 为 `.env.bak`，写入新的 `MH_IMAGE`，重写 compose；
3. 拉镜像；**拉取失败** → 恢复旧 `.env`/compose，中止（不动运行中的容器）；
4. `compose up -d` 换容器；**启动失败** → 自动回滚镜像配置并 `up -d`；
5. 健康检查不过 → 同样回滚镜像配置，并提示如已迁移则用 `restore` 恢复升级前备份。

### 8.2 回滚

```bash
sudo bash /opt/medihub-docker/ops.sh rollback
```

用 `$MH_DIR/.env.bak` 回到上一次升级前的镜像配置。**注意**：回滚只回镜像，不回数据库。
如果新版本已经跑过数据库迁移，旧镜像可能仍然起不来；此时按提示恢复升级前的备份：

```bash
sudo bash /opt/medihub-docker/ops.sh restore /opt/medihub-docker/backups/<...>-pre-upgrade.tar.gz
```

> 数据库迁移是单向的（Drizzle 只有 up）。升级前自动备份就是你的「down」，
> 所以**不要删 `backups/`**，也不要关掉自动备份。

---

## 9. 数据卷、目录与迁移

| 对象            | 名字                              | 内容                                                                          |
| --------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| 数据卷          | `medihub_data`                    | `/data/local.db`、`/data/local.db-wal`、`/data/local.db-shm`、`/data/storage` |
| 安装目录        | `/opt/medihub-docker`（`MH_DIR`） | `.env`、`docker-compose.yml`、`ops.sh`、`backups/`                            |
| Compose project | `medihub-docker`                  | 一个 service：`app`                                                           |

- **换机器 / 前移数据**：备份 → 新机器装好 → `restore` 备份包（`.env` 不会跟着覆盖，
  新机器上重新填 `MH_URL`/端口即可）；
- **`down` 不会删数据卷**；`uninstall` 才会问你要不要删；
- 想在 1Panel 里看到它：**容器 → 容器 / 编排**里能看到 `medihub-docker` 这个 project 的容器；
  不要在 1Panel 里手工改它的 compose 文件——下次 `install/upgrade` 会被重写；
- **不要**把 `MH_DIR` 设成 systemd 安装目录（`/opt/medihub`）：脚本会检测 `.env` 不是自己生成的并拒绝。

---

## 10. 故障排查

| 现象                       | 排查与处理                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install` 报端口被占用     | `ss -lntp \| grep <端口>`；换 `--port` 或放掉占用者                                                                                               |
| 拉镜像失败（401/403/网络） | 确认能访问 `ghcr.io`；本仓库镜像 public，可匿名拉；自己 fork 的私有包需 `docker login ghcr.io`；离线可用 `MH_SKIP_PULL=1`（前提是本地已有该镜像） |
| 容器起来但健康检查不过     | `ops.sh logs` 看应用日志；`ops.sh doctor` 看 Docker/配置；常见是 `MH_URL` 与浏览器地址不一致                                                      |
| 打开 `/install` 报 409     | 说明已经有账号了，直接登录；用 `reset-password` 找回密码                                                                                          |
| 登录 403 / Invalid origin  | 浏览器地址与 `MH_URL` 不一致。改 `.env` 里 `MH_URL` → `ops.sh restart`（compose 会据此重建可信来源）；临时用 IP 访问也要加进可信来源              |
| 上传 413                   | Nginx `client_max_body_size 300m`；另见应用层 `UPLOAD_MAX_BYTES`（默认 256MB，可在 `.env` 调大后 `restart`）                                      |
| 上传/长请求 502            | Nginx `proxy_read_timeout 300s`，并确认反代指向 `127.0.0.1:<MH_PORT>`                                                                             |
| `upgrade` 后起不来         | 脚本会自动回滚镜像配置；仍失败就 `ops.sh logs`，再 `restore` 升级前备份                                                                           |
| 磁盘满                     | `docker system df`、`du -sh /var/lib/docker/volumes/medihub_data`；先 `backup`，再清理旧备份 / 归档素材（[ARCHIVE.md](./ARCHIVE.md)）             |

快速自查三连：

```bash
sudo bash /opt/medihub-docker/ops.sh status
curl -fsS http://127.0.0.1:8080/api/health      # {"status":"ok","version":"1.10.2"}
sudo bash /opt/medihub-docker/ops.sh doctor
```

---

## 11. 定时任务（1Panel 计划任务）

把下面几条挂到 **1Panel → 计划任务 → Shell 脚本**：

| 任务                 | cron（示例） | 脚本                                                                        |
| -------------------- | ------------ | --------------------------------------------------------------------------- |
| 每日备份             | `0 3 * * *`  | `MH_YES=1 bash /opt/medihub-docker/ops.sh backup nightly`                   |
| 每周健康检查         | `0 8 * * 1`  | `bash /opt/medihub-docker/ops.sh status > /var/log/medihub-status.log 2>&1` |
| 每周清旧日志（可选） | `0 4 * * 0`  | `docker system prune -f`                                                    |

> 自动备份建议保留最近 7–14 份：`find /opt/medihub-docker/backups -name '*.tar.gz' -mtime +14 -delete`
> （执行前先 `ls` 确认只删旧备份）。
> 升级不建议做成全自动：脚本虽会回滚，但「数据库已迁移」时仍需人工决策。

---

## 12. 相关文档

- [1PANEL-FIRST-DEPLOY.md](./1PANEL-FIRST-DEPLOY.md) —— 反代 / HTTPS / `/install` / 首个科室的完整步骤
- [DOCKER.md](./DOCKER.md) —— 本地试运行、手工 compose、GHCR 镜像
- [INSTALL-1PANEL.md](./INSTALL-1PANEL.md) —— systemd 安装器参数（**不是**容器路径）
- [UPGRADE.md](./UPGRADE.md) —— 在线升级（仅 systemd；Docker 下用 `ops.sh upgrade`）
- [ARCHIVE.md](./ARCHIVE.md) —— 容量、归档与镜像备份
- [文档地图](./README.md)
