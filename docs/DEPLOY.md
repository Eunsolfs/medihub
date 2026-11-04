# 1Panel 部署（首次部署主入口 · v1.10.4）

**第一次部署从这里开始。** 两条主路径（systemd 一键 / Docker 一键）任选其一，一台机器只选一种；
装完都要打开 `/install` 创建管理员，再建第一个科室。

> 只想先看看参数或手工装？→ [REFERENCE.md](./REFERENCE.md)；装完之后怎么升级/备份/归档？→ [OPERATIONS.md](./OPERATIONS.md)。

## 目录

- [0. 开始前准备](#0-开始前准备)
- [1. 登录服务器](#1-登录服务器)
- [2. 一键安装（不带任何演示参数）](#2-一键安装不带任何演示参数)
- [3. 在 1Panel 创建反向代理](#3-在-1panel-创建反向代理)
  - [3.1 加上传与超时配置](#31-加上传与超时配置)
- [4. 申请 HTTPS 证书](#4-申请-https-证书)
- [5. 初始化第一个管理员](#5-初始化第一个管理员)
- [6. 创建第一个科室（必须）](#6-创建第一个科室必须)
- [7. 创建日常账号](#7-创建日常账号)
- [8. 首次功能验收](#8-首次功能验收)
- [9. 备份（强烈建议）](#9-备份强烈建议)
- [10. 日常升级](#10-日常升级)
  - [方式 A：网页](#方式-a网页)
  - [方式 B：命令行（推荐，最稳）](#方式-b命令行推荐最稳)
- [11. 常见问题](#11-常见问题)
  - [重置密码](#重置密码)
  - [查看日志](#查看日志)
  - [检查端口和版本](#检查端口和版本)
- [12. 安全清单](#12-安全清单)
- [13. 常用命令速查](#13-常用命令速查)
- [14. 方式 B：Docker 一键安装（`medihub-ops.sh`）](#14-方式-bdocker-一键安装medihub-opssh)
  - [14.1 三条路径怎么选](#141-三条路径怎么选)
  - [14.2 前置条件](#142-前置条件)
  - [14.3 安装](#143-安装)
  - [14.4 数据卷、目录与迁移](#144-数据卷目录与迁移)
  - [14.5 Docker 的反向代理](#145-docker-的反向代理)
  - [14.6 Docker 不能用页面在线升级](#146-docker-不能用页面在线升级)
- [相关文档](#相关文档)

---

## 0. 开始前准备

| 项目   | 要求                                                                |
| ------ | ------------------------------------------------------------------- |
| 服务器 | Ubuntu 22.04 / 24.04、Debian 12，2 核 2G 起；素材多时建议挂载数据盘 |
| 1Panel | 已安装并能登录面板（本教程假设你已经装好 1Panel）                   |
| SSH    | 能用 root 或 sudo 用户登录服务器                                    |
| 域名   | 建议准备，如 `medihub.example.com`；A 记录指向服务器公网 IP         |
| 端口   | 安全组/防火墙放行 **80、443**；应用端口不需要对公网开放             |
| 磁盘   | 至少 20GB 可用；伤口照片/视频多时建议单独挂载                       |

先确认域名解析：

```bash
ping -c 2 medihub.example.com
# 或
dig +short medihub.example.com
```

返回服务器公网 IP 后再继续。

---

## 1. 登录服务器

用 1Panel 的终端，或本地 SSH：

```bash
ssh root@你的服务器IP
```

以下命令都在服务器上执行。

---

## 2. 一键安装（不带任何演示参数）

```bash
cd /opt
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh -o install-medihub.sh
sudo bash install-medihub.sh --url https://medihub.example.com
```

**逐段解释：**

- `--url` 填浏览器最终访问的地址，必须和实际地址**完全一致**（协议、域名、端口都要一致）。
  域名还没配 HTTPS 时，可以先用 `--url http://服务器IP:3000 --port 3000` 临时验证，
  同时要在安全组/防火墙临时放行 3000；验证完再关掉端口并改成正式域名。
- 不传 `--port` 时脚本会自动挑一个 20000–29999 的空闲端口，安装结束会打印出来。
- 建议固定版本时加 `--tag v1.10.4`；不写默认取最新 Release。
- **不要加 `--seed`**：纯净版没有这个参数，脚本会直接提示已移除。
- 不想在本机跑 systemd？可以改用 GHCR 镜像（`docker pull ghcr.io/eunsolfs/medihub:1.10.4`），
  步骤见 [REFERENCE.md](REFERENCE.md)；本文其余步骤（反代/HTTPS/`/install`）同样适用。

安装过程会：

1. 安装/检查 Node.js 24、pnpm、systemd；
2. 创建 `medihub` 系统用户；
3. 生成 `/opt/medihub/apps/server/.env`（含随机密钥）；
4. 构建 Web + API；
5. 只执行数据库迁移（**不建账号、不写演示数据**）；
6. 写入 `medihub.service` 并启动。

看到下面类似内容说明成功：

```text
医档通 MediHub 安装完成（v1.10.4）
────────────────────────────────
安装目录：/opt/medihub
监听端口：127.0.0.1:21451
版本接口：curl http://127.0.0.1:21451/api/health
```

**记下这个端口**，下一步反向代理要用。

自检：

```bash
PORT=$(grep -oP '^PORT="\K[0-9]+' /opt/medihub/apps/server/.env)
curl -s "http://127.0.0.1:$PORT/api/health"
```

应返回：

```json
{ "status": "ok", "version": "1.10.4" }
```

如果这里失败，先看日志：

```bash
journalctl -u medihub -n 80 --no-pager
```

---

## 3. 在 1Panel 创建反向代理

1. 登录 1Panel；
2. 左侧「网站」→「反向代理」→「创建反向代理」；
3. 填写：
   - **名称**：`medihub`
   - **域名**：`medihub.example.com`
   - **代理地址**：`http://127.0.0.1:<上一步的端口>`（例如 `http://127.0.0.1:21451`）
4. 保存。

> 不同 1Panel 版本菜单名略有差异：也可能在「网站 → 网站 → 创建网站 → 反向代理」，
> 核心都是「域名 → 转发到 `http://127.0.0.1:<端口>`」。

### 3.1 加上传与超时配置

进入该站点的「配置」或「配置文件」，确认包含：

```nginx
client_max_body_size 300m;
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $remote_addr;
```

说明：

- `client_max_body_size 300m`：应用层上限是 256MB，Nginx 留余量；没有这行，大视频/PPT 会 `413`；
- `proxy_read_timeout 300s`：大文件上传/导出打包时间较长；
- `X-Forwarded-For` 只传**单值** `$remote_addr`，不要用 `$proxy_add_x_forwarded_for` 追加，
  否则 Better Auth 可能把所有用户当成同一个 IP 限流。

保存后重载 Nginx。

---

## 4. 申请 HTTPS 证书

1. 1Panel →「网站」→ 找到 `medihub` 站点 →「SSL」；
2. 选择「Let's Encrypt」，申请证书；
3. 开启「强制 HTTPS」。

确认 `https://medihub.example.com` 能打开（此时可能还是安装向导或登录页）。

> 如果安装时用的是 `--url http://服务器IP:3000`，现在要改成正式域名：
>
> ```bash
> PORT=$(grep -oP '^PORT="\K[0-9]+' /opt/medihub/apps/server/.env)
> sudo sed -i 's|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL="https://medihub.example.com"|' /opt/medihub/apps/server/.env
> sudo systemctl restart medihub
> ```
>
> 然后用域名重新打开；HTTP 下的旧会话会失效，重新登录即可。

---

## 5. 初始化第一个管理员

浏览器打开：

```text
https://medihub.example.com/install
```

填写：

- 管理员姓名
- 邮箱（以后登录用）
- 密码（至少 8 位，建议字母 + 数字 + 符号）
- OnlyOffice 地址/密钥：**现在不需要，直接留空**

点「完成安装」，会自动跳到登录页。用刚创建的账号登录。

> 系统已初始化后 `/install` 会返回 409，不会覆盖现有管理员。
> 忘记密码时用下面的命令重置，不要重装。

---

## 6. 创建第一个科室（必须）

纯净版是空库，登录后工作台会显示：

> **先创建第一个科室**
> 去系统管理创建科室

按提示操作：

1. 左侧「系统管理」→「科室」；
2. 点「新建科室」；
3. 填科室名称，例如「整形外科」，编码可自动生成；
4. 保存。

创建后回到工作台，患者、资料库、教学会议等入口才会可用。

> root 是全局管理员，不归属具体科室；顶部「科室」下拉用于切换查看哪个科室的数据。

---

## 7. 创建日常账号

推荐流程：

1. 「系统管理 → 用户」→「新建用户」；
2. 角色选「科室管理员」或「科室成员」；
3. 归属科室选刚创建的科室；
4. 设置初始密码，交给同事登录后自行修改。

也可以让同事在登录页自助注册，再由 root 在「系统管理 → 待分配用户」里认领到科室。

---

## 8. 首次功能验收

按顺序点一遍，确认部署没问题：

- [ ] 工作台统计卡能点击跳转
- [ ] 新建 1 位患者 → 新建就诊
- [ ] 在患者详情上传 1 张图片，能看到时间线
- [ ] 打开资料库，能看到刚上传的素材
- [ ] 写 1 篇教学文章并发布，打开 `/p/<slug>` 公开页
- [ ] 新建 1 场学习会议，加 1 门课程
- [ ] 导出中心创建一个患者导出，能下载 ZIP
- [ ] 手机 375px 打开，底部导航和页面无横向滚动

上传第一张图时系统会自动创建一个「服务器本地磁盘」存储目标；
后续可在「系统管理 → 存储」改成 NAS 或 S3。

---

## 9. 备份（强烈建议）

至少每天备份：

```bash
# 数据库 + 配置（短暂停服，避免 SQLite WAL 不一致）
sudo systemctl stop medihub
sudo tar czf /root/medihub-backup-$(date +%F).tar.gz \
  -C /opt/medihub/apps/server local.db .env
sudo systemctl start medihub

# 素材目录（按实际大小安排；大文件建议 NAS/对象存储）
sudo tar czf /root/medihub-storage-$(date +%F).tar.gz \
  -C /opt/medihub/apps/server storage
```

更稳妥的做法：

- 在 1Panel「计划任务」里定时执行上面的命令；
- 备份文件同步到另一台机器/NAS；
- 定期在测试环境恢复一次，确认备份真的可用。

> SQLite 运行中复制 `.db` 时建议用 `sqlite3 local.db ".backup ..."`，或停服务后再打包。

---

## 10. 日常升级

### 方式 A：网页

root 登录 →「系统管理 → 版本与升级」→ 检查更新 → 升级。
升级执行器会自动备份、构建、迁移、重启，失败会尝试回滚。

### 方式 B：命令行（推荐，最稳）

```bash
cd /opt
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh -o install-medihub.sh
sudo bash install-medihub.sh --update --yes --tag v1.10.4
```

升级会保留 `.env`、SQLite、`storage` 和升级备份，不会清空数据，也不会重新写入演示数据。

---

## 11. 常见问题

| 现象                      | 原因                                 | 处理                                                                                                     |
| ------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 打开域名 502              | 反向代理端口填错，或服务没起来       | `grep PORT /opt/medihub/apps/server/.env`；`systemctl status medihub`；代理填 `127.0.0.1:<实际端口>`     |
| 登录 403 / Invalid origin | `BETTER_AUTH_URL` 与浏览器地址不一致 | 改成完全一致的 `https://域名`；临时用 IP 时把 `http://IP:端口` 加进 `BETTER_AUTH_TRUSTED_ORIGINS` 并重启 |
| `/install` 打不开/409     | 已经有账号，或反向代理没生效         | 直接去 `/login`；409 表示已初始化，不是故障                                                              |
| 上传 413                  | Nginx `client_max_body_size` 太小    | 调到 `300m` 并重载 Nginx                                                                                 |
| 上传 502                  | 大文件超时 / 服务重启                | 加 `proxy_read_timeout 300s`；查看 `journalctl -u medihub`                                               |
| 登录提示「尝试过于频繁」  | 登录限流（10 次/分钟/IP）            | 等一分钟；不要反复点                                                                                     |
| 忘记管理员密码            | —                                    | 见下方「重置密码」                                                                                       |
| 页面样式很旧              | 浏览器/Service Worker 缓存           | 强制刷新；PWA 可清除站点数据后重开                                                                       |

### 重置密码

```bash
sudo -u medihub bash -lc 'cd /opt/medihub/apps/server && node --env-file=.env src/reset-password.ts --list'
sudo -u medihub bash -lc 'cd /opt/medihub/apps/server && node --env-file=.env src/reset-password.ts 你的邮箱'
```

不传新密码会随机生成并打印一次。

### 查看日志

```bash
journalctl -u medihub -n 100 --no-pager
journalctl -u medihub -f
```

### 检查端口和版本

```bash
PORT=$(grep -oP '^PORT="\K[0-9]+' /opt/medihub/apps/server/.env)
curl -s "http://127.0.0.1:$PORT/api/health"
```

---

## 12. 安全清单

- [ ] 已开启 HTTPS，并强制跳转
- [ ] 管理员密码已从初始密码改掉
- [ ] 只放行 80/443，应用端口不对公网开放
- [ ] 已配置每日备份，并验证过恢复
- [ ] 按岗位分配「科室管理员 / 科室成员」，不要共用 root
- [ ] 手机/电脑访问的域名与 `BETTER_AUTH_URL` 一致

---

## 13. 常用命令速查

```bash
# 服务
systemctl status medihub
systemctl restart medihub
journalctl -u medihub -n 100 --no-pager

# 端口 / 健康
PORT=$(grep -oP '^PORT="\K[0-9]+' /opt/medihub/apps/server/.env)
curl -s "http://127.0.0.1:$PORT/api/health"

# 数据库迁移
cd /opt/medihub && sudo -u medihub bash -lc 'export PATH=/usr/local/bin:$PATH; pnpm run db:migrate'

# 重置密码
cd /opt/medihub/apps/server
sudo -u medihub bash -lc 'cd /opt/medihub/apps/server && node --env-file=.env src/reset-password.ts --list'

# 升级
cd /opt && sudo bash install-medihub.sh --update --yes
```

---

## 14. 方式 B：Docker 一键安装（`medihub-ops.sh`）

> 本机已装 Docker（1Panel 应用商店装过 Docker 即可）。与 systemd 方式**互斥**：
> 一台机器只选一种，Docker 默认目录 `/opt/medihub-docker`、数据卷 `medihub_data`。

> 镜像版本以 `:1.10.4` 为例；完整运维（备份/恢复/升级/回滚）见 [OPERATIONS.md](./OPERATIONS.md)。
> v1.10.4 起运行镜像已精简到约 **340MB**（只打包 `dist`，不含 `node_modules` 与源码）。

### 14.1 三条路径怎么选

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

### 14.2 前置条件

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

### 14.3 安装

#### 3.1 下载并安装（推荐）

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

#### 3.2 非交互安装

```bash
sudo bash /tmp/medihub-ops.sh install --url https://medihub.summerecho.cn --port 18080
```

| 参数           | 说明                                                    |
| -------------- | ------------------------------------------------------- |
| `--url URL`    | 对外访问地址（必须是 `http(s)://`；结尾斜杠会去掉）     |
| `--port 端口`  | 宿主端口，1–65535 的数字                                |
| `--tag 版本`   | 用 `ghcr.io/eunsolfs/medihub:<版本>`，如 `--tag 1.10.4` |
| `--image 镜像` | 直接用完整镜像地址（私有仓库/自建镜像时用）             |
| `--dir 目录`   | 安装目录（默认 `/opt/medihub-docker`）                  |
| `--yes`        | 自动确认                                                |

也可以用环境变量覆盖：`MH_DIR` / `MH_IMAGE` / `MH_PORT` / `MH_URL` / `MH_YES` /
`MH_DRY_RUN` / `MH_SKIP_PULL`。

#### 3.3 先看它要做什么（不写盘、不启动）

```bash
MH_DIR=/tmp/medihub-docker MH_DRY_RUN=1 \
  sudo -E bash /tmp/medihub-ops.sh install --url https://medihub.example.com --port 18080
# 只生成 /tmp/medihub-docker 下的 .env 与 docker-compose.yml，不拉镜像、不启动容器
```

> `MH_DRY_RUN=1` 会真的写 `.env` 与 compose 文件（方便你 review），但不会 pull/up。

#### 3.4 生成的文件

```
/opt/medihub-docker/
├─ .env                 # MH_IMAGE / MH_PORT / MH_URL / MH_SERVER_IP / BETTER_AUTH_SECRET / TZ / UPLOAD_MAX_BYTES（chmod 600）
├─ docker-compose.yml   # project 名 medihub-docker，端口 ${MH_PORT}:3000，卷 medihub_data:/data
├─ ops.sh               # 脚本自身的副本（以后运维用它）
└─ backups/             # 备份产物
```

> `.env` 里有会话密钥，**不要**提交到 Git，也不要随备份发到不安全的位置（备份包本身是 `chmod 600`）。

---

### 14.4 数据卷、目录与迁移

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

### 14.5 Docker 的反向代理

反代目标同样是 `127.0.0.1:<MH_PORT>`（默认 8080），上传/超时/证书与 §3、§4 完全一致，只是端口换成 `MH_PORT`。

### 14.6 Docker 不能用页面在线升级

容器里没有 systemd 与源码目录，**不要**在「系统管理 → 版本与升级」里点升级；请用 `sudo bash ops.sh upgrade`，
详见 [OPERATIONS.md](./OPERATIONS.md)。

## 相关文档

- [OPERATIONS.md](./OPERATIONS.md) —— 日常运维与升级
- [REFERENCE.md](./REFERENCE.md) —— 参数与手工部署
- [MOBILE.md](./MOBILE.md) —— 手机端
- [ONLYOFFICE.md](./ONLYOFFICE.md) —— 在线编辑
