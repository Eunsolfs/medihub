# 在线升级与回滚（系统管理 → 版本与升级）

MediHub 内置了一套「在站点里点一下就升级」的机制：`root` 账号在 **系统管理 → 版本与升级**
卡片里查看当前版本、GitHub 最新版本（Release 或 tag），一键升级或回滚。服务端会以 detached 子进程运行
升级执行器 `apps/server/scripts/updater.mjs`，自动完成**备份 → 下载发布包 → 构建 → 迁移 →
切换产物 → 重启 → 健康检查**，健康检查不通过就**自动回滚**。

本文只讲运维怎么把它安全地用起来。手工（命令行）升级流程见
[DEPLOY-1PANEL.md §13](./DEPLOY-1PANEL.md#13-升级与回滚)，两者可以并存，但**不要同时进行**。

> **适用版本：v1.1.0+**（v1.0.0 不包含在线升级，也没有 `/api/health` 之外的相关接口）。
> 如果你现在跑的是 v1.0.0，请先按 [DEPLOY-1PANEL.md §13.1](./DEPLOY-1PANEL.md#131-升级标准流程)
> 手工升到 v1.1.0，之后才能用本手册的界面升级。

## 目录

1. [适用范围](#1-适用范围)
2. [工作原理](#2-工作原理)
3. [前置条件](#3-前置条件)
4. [环境变量](#4-环境变量)
5. [三种部署方式的重启命令](#5-三种部署方式的重启命令)
6. [操作步骤](#6-操作步骤)
7. [回滚边界](#7-回滚边界)
8. [常见问题](#8-常见问题)
9. [安全说明](#9-安全说明)
10. [附录](#10-附录)

---

## 1. 适用范围

### ✅ 适用

- 单机部署，安装目录是一个 **可写的源码检出**（`git clone` 或解压的源码包），目录里有根
  `package.json`、`apps/`、`pnpm-lock.yaml`；
- 服务进程与安装目录在同一台机器上，服务用户能写安装目录；
- 能用 `systemctl` / `pm2` / `supervisorctl` 这类命令重启服务。

### ❌ 不适用（请用镜像或手工流程）

| 形态                                                             | 为什么不行                                                                           | 替代方案                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Docker / `docker compose` 部署（含 1Panel 应用商店装的 MediHub） | 容器里没有源码与 pnpm，`dist` 位于镜像层，重启即被镜像覆盖；更换镜像 digest 才是升级 | 改 compose 里的 `image:` tag → `docker compose up -d`，见 [§5.3](#53-1panel-与容器容器方案不适用本机制) |
| 安装目录只读 / 由部署系统（Ansible、Nix、RPM）托管               | 执行器要在目录里写 `.updates/`、`dist/`                                              | 用对应部署系统发布                                                                                      |
| 多实例 / 负载均衡集群                                            | 只重启本机，其他节点版本不一致；SQLite 也只有本机一份                                | 滚动发布                                                                                                |
| 代码目录与运行目录分离（只把 `dist` 拷到别处运行）               | 执行器按 `<UPDATE_WORKDIR>/apps/server/dist` 定位产物                                | 用 [DEPLOY-1PANEL.md §13](./DEPLOY-1PANEL.md#131-升级标准流程) 的手工流程                               |

---

## 2. 工作原理

### 2.1 时序

```
root 点「升级到 vX」
      │
      ├─ POST /rpc/system.startUpdate { targetVersion: "X" }     ← 校验：root / 未在跑 / 不等于当前版本
      │
      ▼
服务端 spawn(node updater.mjs upgrade X)  ── detached，stdio 忽略，继承服务进程的 env
      │
      ├─ 1. 备份   apps/server/dist + SQLite + 安装根 package.json
      │           →  .updates/backups/<当前版本>-<时间戳>/
      ├─ 2. 下载   codeload.github.com/<repo>/tar.gz/refs/tags/vX  →  .updates/staging/X/
      ├─ 3. 构建   在 staging 目录 pnpm install --frozen-lockfile && pnpm run build
      ├─ 4. 迁移   在 staging 目录 pnpm run db:migrate，DATABASE_URL 指向**线上库的绝对路径**
      ├─ 5. 切换   rm -rf apps/server/dist && cp staging/.../dist → apps/server/dist
      │           同时把发布包的根 package.json 写到安装根（版本号随之切换）
      ├─ 6. 重启   执行 UPDATE_RESTART_CMD
      ├─ 7. 健康   轮询 UPDATE_HEALTH_URL（≤60 次 × 2s，单次超时 5s）
      │            /api/health 的 version 必须等于目标版本 X
      ├─ 8. 收尾   成功 → phase=succeeded，清理旧备份（保留 UPDATE_KEEP_BACKUPS 份）
      │            失败 → 还原备份 + 重启 + 再健康检查 → phase=failed, rolledBack=true/false
      │
      ▼
前端每 3s 轮询 system.updateStatus，展示最近 8 行日志
```

### 2.2 目录与状态文件

所有中间产物都在 `<UPDATE_WORKDIR>/.updates/` 下（仓库 `.gitignore` 已忽略该目录，也**不属于**备份对象）：

```
<UPDATE_WORKDIR>/
├─ package.json                    # 版本号来源：/api/health 的 version 就是这里的 version；
│                                  # v1.1.0 起升级时随 dist 一起被替换、并纳入备份/回滚
├─ apps/server/
│  ├─ dist/                        # 升级时被整体替换的目录（含 dist/public 与 dist/scripts）
│  ├─ .env                         # 不备份、不回滚
│  └─ local.db                     # 默认 UPDATE_DB_PATH，升级前备份、失败时回滚
└─ .updates/
   ├─ state.json                   # 当前任务状态，前端读它
   ├─ backups/<版本>-<时间戳>/      # dist/ + db.sqlite + package.json + manifest.json
   ├─ downloads/<版本>.tar.gz
   └─ staging/<版本>/              # 解压出的源码与临时构建
```

`state.json` 的字段（前端直接展示）：

| 字段                            | 含义                                                                      |
| ------------------------------- | ------------------------------------------------------------------------- |
| `phase`                         | `running` / `succeeded` / `failed` / `rolled_back`（没有文件时为 `idle`） |
| `mode`                          | `upgrade` 或 `rollback`                                                   |
| `fromVersion` / `targetVersion` | 升级前后的版本号                                                          |
| `startedAt` / `finishedAt`      | 毫秒时间戳                                                                |
| `log`                           | 最近 200 行执行日志（含每条命令与输出尾部）                               |
| `error`                         | 失败原因                                                                  |
| `rolledBack`                    | 失败后是否成功自动回滚                                                    |
| `backupDir`                     | 本次使用的备份目录名                                                      |

### 2.3 判断「能不能用」的三个开关

服务端在每次请求时判断（`apps/server/src/updater.ts`）：

```ts
UPDATE_ENABLED === "true" &&
  Boolean(UPDATE_RESTART_CMD) &&
  existsSync(path.join(workdir, "package.json"));
```

三条同时满足，`system.updateStatus` 才返回 `enabled: true`，卡片才会出现按钮；否则显示
「服务端未启用在线升级」并列出需要配置的三个变量。

> `UPDATE_ENABLED` 是**严格字符串比较**：只认小写 `true`。写成 `1`、`TRUE`、`yes` 都算关闭。
> 环境变量在进程启动时读取，**改完必须重启服务**才生效。

---

## 3. 前置条件

逐条打勾，缺任何一条都会在升级中途失败（多数情况能自动回滚，但等于白折腾一次）。

### 3.1 安装目录可写

```bash
# 用服务用户验证（把 www 换成你的运行用户）
sudo -u www -H test -w /opt/medihub && echo "安装目录可写 OK"
sudo -u www -H mkdir -p /opt/medihub/.updates && echo ".updates 可创建 OK"
ls -ld /opt/medihub /opt/medihub/apps/server/dist
```

需要可写的路径：`<UPDATE_WORKDIR>/.updates/`、`<UPDATE_WORKDIR>/apps/server/dist`、
SQLite 所在目录（回滚时要覆盖它）。

### 3.2 服务用户有 `node` / `pnpm` / `tar`

执行器**继承服务进程的 `PATH`**，它不读登录 shell 的 profile：

```bash
# 用跑服务的那个用户，确认三个命令都在 PATH 里
sudo -u www -H bash -lc 'command -v node pnpm tar && node -v && pnpm -v'
```

期望看到 `node` v24.x、`pnpm` 12.x、`tar`。看不到 pnpm 是最常见的问题：
用 1Panel 面板装的 Node 环境、或 systemd 的 `Environment=` 没带 `PATH`，都会导致
`spawn pnpm ENOENT`。解决见 [§8](#8-常见问题)。

### 3.3 能访问 GitHub

```bash
# 版本检查接口（有 Release 时用 releases/latest，没有时回退到 tags）
curl -fsS -m 10 -o /dev/null -w '%{http_code}\n' \
  https://api.github.com/repos/Eunsolfs/medihub/releases/latest
curl -fsS -m 10 -o /dev/null -w '%{http_code}\n' \
  https://api.github.com/repos/Eunsolfs/medihub/tags
# 源码包下载（升级用，走 codeload，和 api 不是同一个域名；把 v1.1.0 换成目标版本）
curl -fsS -m 15 -o /dev/null -w '%{http_code}\n' \
  https://codeload.github.com/Eunsolfs/medihub/tar.gz/refs/tags/v1.1.0
```

判断标准：

- **源码包地址必须返回 200**（目标 tag 不存在时是 404，说明版本号写错或 tag 还没推）；
- 版本检查：`releases/latest` 返回 200，或它返回 404 但 `/tags` 返回 200 —— 都算通过。
  本仓库目前只有 tag、没建 GitHub Release，因此实际走 `/tags` 回退，这是正常的。
- 内网/国内服务器可能只挡其中一个域名，别只测一个。

### 3.4 版本 tag 形如 `v1.1.0`

执行器接受 `1.1.0` 与 `v1.1.0` 两种写法（会先去掉前缀 `v`），版本号必须匹配
`^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$`。

下载源码包时会依次尝试两个地址，任一命中即可：

```
https://codeload.github.com/<repo>/tar.gz/refs/tags/v<version>
https://codeload.github.com/<repo>/tar.gz/refs/tags/<version>
```

所以 tag 打成 `v1.1.0` 或 `1.1.0` 都能升级；但**必须真的打了 tag**（`git push origin v1.1.0`），
只建 Release 不建 tag 是不行的。检查更新时：有 Release 就取 `releases/latest`
（草稿 draft 与预发布 pre-release 不算）；没有 Release 则回退到 `/tags`，取最新的版本 tag。

### 3.5 健康检查地址可达

```bash
curl -fsS http://127.0.0.1:3000/api/health
# {"status":"ok","version":"<当前版本>"}
```

`/api/health` 是公开接口（不需要登录）。它在 `<DATABASE_URL>` 上跑一条 `select 1` 再返回
`version`，所以它同时验证「进程活着」和「数据库可读」。

### 3.6 构建产物里带着执行器脚本

执行器由服务进程按 `<dist>/scripts/updater.mjs` 定位，而这个文件由构建自动放进 `dist`
（`apps/server/scripts/copy-spa.mjs` 除了复制 SPA，还会把 `scripts/updater.mjs` 复制到
`dist/scripts/updater.mjs`，让线上 `dist` 自包含、不依赖仓库其它目录）。所以**检查通过即可**：

```bash
ls -l /opt/medihub/apps/server/dist/scripts/updater.mjs
```

正常构建（`pnpm build`）的日志里会有这一行：

```text
升级执行器已复制到 dist/scripts/updater.mjs
```

- 文件在 → 不用做任何额外配置；
- 文件不在 → 说明这份 `dist` 不是用当前版本的构建链产生的（换了打包方式、手工拷过 `dist`、
  或跑的是 v1.0.0 的产物），按 [§8.1](#81-点了升级但进度一直不动没有日志) 排查。

### 3.7 版本号随产物一起切换

`/api/health` 返回的版本来自**安装根 `package.json` 的 `version`**（`apps/server/src/version.ts`
按 `<dist>/../../../package.json` 读）。升级时执行器**同时**做两件事：

1. 把新构建的 `dist` 换成发布包的产物；
2. 把发布包根的 `package.json` 写到安装根。

并且原 `package.json` 会随 `dist`、数据库一起进备份（`manifest.json` 里的 `hasPackageJson`），
回滚时一并还原。因此升级完成后：

- 卡片上的「当前版本」、「`/api/health` 的 `version`」、「安装根 `package.json` 的 `version`」
  三者应该**同时**变成目标版本；
- 健康检查（要求 `version` 等于目标版本）能正常通过。

自检命令（三条应一致）：

```bash
curl -fsS http://127.0.0.1:3000/api/health      # {"status":"ok","version":"1.1.0"}
grep '"version"' /opt/medihub/package.json
```

若三者仍不一致，见 [§8.2](#82-升级到最后自动回滚日志说健康检查未在超时内返回)。

---

## 4. 环境变量

全部写在 `apps/server/.env`，改完**重启服务**生效。默认值来自 `apps/server/src/env.ts`。

| 变量                  | 必填                 | 默认值                             | 说明                                                                                                                                               |
| --------------------- | -------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UPDATE_ENABLED`      | 是                   | `false`                            | 总开关。**只认小写 `true`**                                                                                                                        |
| `UPDATE_REPO`         | 否                   | `Eunsolfs/medihub`                 | GitHub 仓库 `owner/repo`。同时用于 Release 查询与源码包下载                                                                                        |
| `UPDATE_WORKDIR`      | **强烈建议显式设置** | `.`                                | 安装根目录的**绝对路径**（含根 `package.json` 与 `apps/`）。默认 `.` 取的是服务进程的 cwd，systemd/pm2 常把 cwd 设在 `apps/server`，会导致路径全错 |
| `UPDATE_DB_PATH`      | 否                   | `apps/server/local.db`             | SQLite 路径，**相对 `UPDATE_WORKDIR`**。升级前备份、失败时还原                                                                                     |
| `UPDATE_RESTART_CMD`  | 是                   | 无                                 | 重启服务的 shell 命令。不配则整体视为「未启用」                                                                                                    |
| `UPDATE_HEALTH_URL`   | 否                   | `http://127.0.0.1:3000/api/health` | 升级后轮询的健康检查地址。必须返回 JSON 且带 `version` 字段                                                                                        |
| `UPDATE_KEEP_BACKUPS` | 否                   | `3`                                | 保留多少份备份（正整数）。成功升级后清理多余的                                                                                                     |
| `UPDATE_GITHUB_TOKEN` | 否                   | 无                                 | 可选。GitHub personal access token，只用于提高 `api.github.com` 的速率限制（未登录 60 次/小时/IP）；不用于 `codeload` 下载，也**不需要任何 scope** |

`.env` 片段（可直接粘贴，按注释改）：

```bash
# ===== 在线升级（系统管理 → 版本与升级）=====
# 只认小写 true；改完必须重启服务。
UPDATE_ENABLED="true"

# GitHub 仓库（owner/repo）。
UPDATE_REPO="Eunsolfs/medihub"

# 安装根目录，必须是绝对路径，且该目录里有根 package.json 与 apps/。
UPDATE_WORKDIR="/opt/medihub"

# SQLite 路径：相对 UPDATE_WORKDIR 或直接写绝对路径。
# 手工部署常用 /data/medihub/local.db，此时这里也写绝对路径。
UPDATE_DB_PATH="apps/server/local.db"

# 重启命令：按你的部署方式三选一，详见 §5。
# systemd（需要 sudoers 授权，见 §5.1）：
UPDATE_RESTART_CMD="sudo -n systemctl restart medihub"
# PM2：
# UPDATE_RESTART_CMD="pm2 restart medihub --update-env"
# Supervisor（1Panel 工具箱）：
# UPDATE_RESTART_CMD="sudo -n supervisorctl restart medihub"

# 健康检查：本机 3000 即可，走反代反而多一层变量。
UPDATE_HEALTH_URL="http://127.0.0.1:3000/api/health"

# 保留备份份数（每份含 dist + db.sqlite）。
UPDATE_KEEP_BACKUPS="3"

# 可选：GitHub token，仅用于提高 API 限额。
# UPDATE_GITHUB_TOKEN="ghp_xxx"
```

> **`UPDATE_WORKDIR` 不要留默认 `.`**。执行器用它拼 `.updates/`、`apps/server/dist`、
> `UPDATE_DB_PATH`，一旦指到 `apps/server` 就会在错误的位置建目录、并去
> `apps/server/apps/server/dist` 找产物。

---

## 5. 三种部署方式的重启命令

`UPDATE_RESTART_CMD` 由**跑服务的那个用户**执行（`spawn(cmd, {shell:true, detached:true, stdio:"ignore"})`），
所以：

- 命令里要写**完整的绝对命令**，不依赖交互式 shell 的别名；
- **stdio 被丢弃**：如果命令需要交互输入（比如 sudo 要密码），它不会报错，只会一直挂着，
  升级就会卡在「重启服务」这一步。涉及 sudo 的，一律加 `-n`（非交互，失败立即返回）。

### 5.1 systemd

`/etc/systemd/system/medihub.service` 全文：

```ini
[Unit]
Description=MediHub server (Hono + SQLite)
Documentation=file:///opt/medihub/docs/DEPLOY-1PANEL.md
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www
Group=www
# 关键：工作目录固定为 apps/server，DATABASE_URL/STORAGE_ROOT 都相对它解析
WorkingDirectory=/opt/medihub/apps/server
# 环境变量集中在 .env；与 start 脚本里的 --env-file-if-exists 等价
EnvironmentFile=/opt/medihub/apps/server/.env
Environment=NODE_ENV=production
Environment=TZ=Asia/Shanghai
# 与 apps/server/package.json 的 start 脚本一致
ExecStart=/opt/node24/bin/node dist/index.mjs

Restart=on-failure
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=20
KillMode=mixed
# 大文件上传与 PDF 转换需要更宽松的限制
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

`.env` 里配：

```bash
UPDATE_WORKDIR="/opt/medihub"
UPDATE_RESTART_CMD="sudo -n systemctl restart medihub"
```

服务用户 `www` 不是 root，必须授权它重启**这一个** unit（`visudo -f /etc/sudoers.d/medihub`）：

```sudoers
www ALL=(root) NOPASSWD: /usr/bin/systemctl restart medihub, /usr/bin/systemctl status medihub
```

```bash
# 用 systemctl 的真实路径，别写 /bin/systemctl 却授权 /usr/bin/systemctl
command -v systemctl
sudo chmod 440 /etc/sudoers.d/medihub
sudo visudo -c            # 校验语法
# 实测：以 www 身份、内层 sudo 不加 -n 也不会提示密码
sudo -u www -H sudo -n systemctl restart medihub && echo "sudo 授权 OK"
```

> `WorkingDirectory` 是 `apps/server` 而 `UPDATE_WORKDIR` 是 `/opt/medihub`，两者**不冲突**，
> 但都要写对：前者决定 `.env`、`local.db`、`storage/` 落在哪；后者决定升级执行器的工作根。

### 5.2 PM2

```bash
UPDATE_RESTART_CMD="pm2 restart medihub --update-env"
```

- pm2 守护进程属于 `www` 时不需要 sudo；
- `--update-env` 让 pm2 重新读取当前进程环境（本机制本身不依赖它，但能避免改了
  `UPDATE_*` 后 pm2 里还是旧值）；
- 若 pm2 是以 root 启动的而服务以 www 跑，`pm2 restart` 需要写成
  `sudo -n -u root pm2 restart medihub --update-env`，并在 sudoers 里放行对应命令。

验证授权与命令本身能否跑通：

```bash
sudo -u www -H pm2 restart medihub --update-env
sudo -u www -H pm2 status
```

### 5.3 1Panel 与容器：容器方案不适用本机制

**装法一：1Panel 工具箱 → Supervisor 托管**（参 [DEPLOY-1PANEL.md §8](./DEPLOY-1PANEL.md#8-进程守护两套方案)）

```bash
UPDATE_RESTART_CMD="sudo -n supervisorctl restart medihub"
```

`www` 需要能跑 `supervisorctl`（其 socket 默认给 root，故要 sudoers）：

```sudoers
www ALL=(root) NOPASSWD: /usr/bin/supervisorctl restart medihub, /usr/bin/supervisorctl status medihub
```

```bash
# 先确认程序名（就是 1Panel 守护进程列表里的名字）
sudo supervisorctl status
```

**装法二：1Panel 应用商店 / `docker compose` 部署的 MediHub**

> ⚠️ **不适用本机制，不要配置 `UPDATE_ENABLED=true`。**
>
> 原因：容器内的文件系统是镜像层，`apps/server/dist` 被替换后容器一重启就还原；
> 容器里通常也没有 `pnpm` / 源码 / 可写的安装目录。即使把 `UPDATE_RESTART_CMD` 写成
> `docker compose restart medihub`，升级也会在「构建」或「切换产物」阶段失败。

容器部署的升级方式：

```bash
# 1) 改 compose 里的镜像 tag（换成你自己的镜像仓库；本项目不发布官方镜像，
#    若你是自建镜像，就是你的 registry 路径）
#    image: registry.example.com/medihub:v1.1.0
# 2) 拉取并重建
docker compose pull medihub
docker compose up -d medihub
# 3) 验证
curl -fsS http://127.0.0.1:3000/api/health
```

1Panel 里的对应操作是 **容器 → 编排 → 编辑 → 保存并重启**（或应用商店 →
已安装 → 升级），本质都是换镜像 tag。

---

## 6. 操作步骤

### 6.1 检查更新

**界面：系统管理 → 版本与升级**（仅 `root` 可见；非 root 连卡片都不渲染）。

卡片上能看到的：

| 位置         | 内容                                                                        |
| ------------ | --------------------------------------------------------------------------- |
| 当前版本     | 来自安装根 `package.json`，读不到时显示「未知」                             |
| 最新 Release | 版本号、发布时间、「查看发布说明」外链；失败时显示原因                      |
| 状态区       | 执行中（最近 8 行日志）／已升级到 vX／已回滚／升级失败 + 原因               |
| 按钮         | 「升级到 vX」（仅当有更新时）／「回滚到上一版本」（仅当有备份且不在执行中） |

「最新 Release」可能的提示文案：

| 文案                              | 含义                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| 仓库还没有发布 Release            | `releases/latest` 返回 404：没建 Release，或只有 draft/pre-release |
| GitHub 返回 4xx/5xx               | 频率超限（未配 token 时 60 次/小时/IP）、仓库名错、或 GitHub 故障  |
| 无法连接 GitHub，请检查服务器网络 | 服务器出不了网 / DNS 不通 / 超时（8s）                             |

命令行等价物（不需要登录）：

```bash
curl -s https://api.github.com/repos/Eunsolfs/medihub/releases/latest \
  | grep -m1 '"tag_name"'
```

### 6.2 开始升级

1. 点 **升级到 vX** → 弹确认框「升级会短暂重启服务，期间无法访问」；
2. 确认后按钮变成 **正在升级…**，状态区出现执行中与日志（每 3s 刷新）。

```bash
# 想不看界面时，直接盯状态文件与日志
watch -n 2 'cat /opt/medihub/.updates/state.json'
# 或只看日志尾部
tail -f /opt/medihub/.updates/state.json | grep -o '"20[^"]*"' | tail -20
```

单次升级的典型耗时（2 核 4G、国内网络）：下载 10–40s，`pnpm install` 60–180s，
`pnpm run build` 40–120s，迁移 1–5s，重启 + 健康检查 10–30s。**总共 3–6 分钟**。
日志里有 `pnpm install` 卡住不动，先看 [§8.5](#85-日志停在-pnpm-install)。

### 6.3 观察日志

卡片上的「升级日志（最后 8 行）」区域展示最新 8 条；完整日志（最近 200 条）在
`.updates/state.json` 的 `log` 数组里，格式是 `<ISO 时间> <内容>`，`$` 开头的是执行的命令：

```text
2026-10-24T14:03:11.482Z 备份当前版本 1.0.0 → /opt/medihub/.updates/backups/1.0.0-2026-10-24T14-03-11-482Z
2026-10-24T14:03:12.010Z 下载发布包：https://codeload.github.com/Eunsolfs/medihub/tar.gz/refs/tags/v1.1.0
2026-10-24T14:03:41.229Z $ pnpm install --frozen-lockfile
...
2026-10-24T14:05:02.664Z $ pnpm run db:migrate
2026-10-24T14:05:04.031Z 重启服务：sudo -n systemctl restart medihub
2026-10-24T14:05:12.887Z 健康检查通过：{"status":"ok","version":"1.1.0"}
2026-10-24T14:05:12.902Z 升级完成：1.0.0 → 1.1.0
```

### 6.4 健康检查确认版本

```bash
# 本机（执行器用的就是这条）
curl -fsS http://127.0.0.1:3000/api/health
# {"status":"ok","version":"1.1.0"}

# 经过反代（给同事确认用）
curl -fsS https://medihub.summerecho.cn/api/health
```

回到卡片：状态区应显示 **已升级到 v1.1.0**；「当前版本」也变成 `v1.1.0`。

再顺手确认前端产物也跟着换了（`dist` 是整体替换的，`dist/public` 一起更新）：

```bash
ls -l /opt/medihub/apps/server/dist/public/index.html
curl -s -o /dev/null -w 'root=%{http_code}\n' http://127.0.0.1:3000/
```

### 6.5 失败时

| 界面表现                                                            | 含义                                       | 你要做的                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 升级失败 + 原因 + **已自动回滚到上个版本**                          | 失败后自动还原了 `dist` 与数据库并重启成功 | 把 `error` 与日志尾部发给维护者；服务已回到升级前版本，可正常使用                                        |
| 升级失败 + 原因，**没有**「已自动回滚」字样，且 `rolledBack: false` | 自动回滚没成功                             | **立刻人工介入**：见 §6.6，或按 [DEPLOY-1PANEL.md §12.4](./DEPLOY-1PANEL.md#124-恢复步骤) 用运维备份恢复 |
| 一直停在「正在升级…」超过 15 分钟                                   | 执行器卡住（多因重启命令等待交互输入）     | 见 §8.6                                                                                                  |

### 6.6 手动回滚

界面：**系统管理 → 版本与升级 → 回滚到上一版本**（只 `canRollback: true` 且不在执行中时出现）。

命令行等价路径（界面点不动时）：

```bash
# 看有哪些备份（目录名 = <版本>-<时间戳>）
sudo -u www -H ls -1 /opt/medihub/.updates/backups/

# 触发回滚（走同一套执行器，会重启 + 健康检查）
cd /opt/medihub && sudo -u www -H \
  /opt/node24/bin/node apps/server/dist/scripts/updater.mjs rollback

# 盯过程
sudo -u www -H cat /opt/medihub/.updates/state.json
```

回滚成功后 `phase` 为 `rolled_back`，`targetVersion` 是还原到的版本。

---

## 7. 回滚边界

**还原三样东西**：`dist`、数据库、安装根 `package.json`（版本号）。其余一概不动——这是设计使然，
也是很多「回滚了怎么还不对」的根因。

| 对象                                                        | 失败自动回滚 | 手动「回滚到上一版本」 | 说明                                    |
| ----------------------------------------------------------- | ------------ | ---------------------- | --------------------------------------- |
| `apps/server/dist`（含 `dist/public` 与 `dist/migrations`） | ✅ 还原      | ✅ 还原                | 代码与前端产物                          |
| SQLite 数据库文件（`UPDATE_DB_PATH`）                       | ✅ 还原      | ✅ 还原                | 覆盖式还原；升级后写入的数据会丢        |
| **安装根 `package.json`**（版本号）                         | ✅ 还原      | ✅ 还原                | v1.1.0 起纳入备份；回滚后版本号一起退回 |
| `apps/server/.env`                                          | ❌           | ❌                     | 环境变量永远以你当前文件为准            |
| `STORAGE_ROOT` 下的素材（图片/视频/文档）                   | ❌           | ❌                     | 素材不在备份范围内                      |
| `.updates/`（备份、日志、staging）                          | ❌           | ❌                     | 回滚自身要读它                          |
| `apps/server/src`、`pnpm-lock.yaml`、其余仓库文件           | ❌           | ❌                     | 源码不动（见 §7.3）                     |
| Node / pnpm / LibreOffice / OnlyOffice                      | ❌           | ❌                     | 系统软件按你自己的节奏升级              |

### 7.1 数据库迁移是不可逆的

执行器在切换产物**之前**就跑 `pnpm run db:migrate`，且这条迁移作用在**线上库**上。
一旦迁移改了表结构（删列、改类型、加约束），旧版代码未必还能跑。所以：

- **回滚依赖的是「升级前那份 db.sqlite 备份」**，不是迁移的反向操作（Drizzle 只有 `up`）；
- 自动回滚会连库一起还原，因此**升级后已经录入的数据会一起回退**；
- 如果你在升级成功后手工点了回滚，请先确认「新版本写入的数据可以丢」；
- 真正重要的是另一层保护：按 [DEPLOY-1PANEL.md §12](./DEPLOY-1PANEL.md#12-备份与恢复) 做的
  每日 `sqlite3 .backup` 备份，那才是兜底。

### 7.2 「最新一份备份」是按目录名排序，不是严格按时间

备份目录名是 `<版本>-<ISO时间戳>`，取最新一份用的是目录名字典序倒排，因此**版本号优先于时间**：

- 正常升级链（1.0.0 → 1.1.0 → 1.2.0）取到 `1.1.0-*`，符合直觉；
- 但如果你做过**降级**（比如 1.2.0 → 1.1.0），最新备份目录是 `1.2.0-*`，这时点「回滚」
  会回到 1.2.0。降级后再回滚，先 `ls` 看一眼目录名再决定，必要时手工还原指定目录：

  ```bash
  sudo -u www -H ls -1 /opt/medihub/.updates/backups/
  # 手工还原某一份（停服 → 覆盖 dist、db、package.json → 启动，参考 DEPLOY-1PANEL §12.4）
  sudo systemctl stop medihub
  B=/opt/medihub/.updates/backups/1.0.0-2026-10-24T14-03-11-482Z
  sudo -u www -H rm -rf /opt/medihub/apps/server/dist
  sudo -u www -H cp -r "$B/dist" /opt/medihub/apps/server/dist
  sudo -u www -H cp "$B/db.sqlite" /opt/medihub/apps/server/local.db
  # v1.1.0 起的备份里还有 package.json，必须一起还原，否则版本号对不上
  sudo -u www -H cp "$B/package.json" /opt/medihub/package.json 2>/dev/null || true
  sudo systemctl start medihub
  ```

`UPDATE_KEEP_BACKUPS` 也是按同样的字典序淘汰最旧的那些，所以保留 3 份意味着
「版本号最大的 3 份」，不是「最近的 3 次」。

### 7.3 升级只换「产物 + 版本号」，不换源码

升级完成后，安装根的 `apps/server/dist` 与 **根 `package.json`（版本号）** 是新版本的；
但 `apps/server/src`、`pnpm-lock.yaml` 以及其余仓库文件仍然是部署时的旧版本。由此有两条运维禁忌：

1. **不要在安装目录里手跑 `pnpm build`**——它用**旧源码**重新构建 `dist`，而 `package.json`
   已经是新版本号，结果是「代码是旧的、版本号是新的」，比单纯回退更难排查。要重建就在别处构建，
   或干脆走 [DEPLOY-1PANEL.md §13.1](./DEPLOY-1PANEL.md#131-升级标准流程) 的手工流程；
2. 若之后要用 git 方式升级，先 `git status`：在线升级改过的根 `package.json` 会作为本地改动出现，
   `git pull` 可能冲突。最稳的做法是「要么全走在线升级，要么全走手工 git 流程」。

---

## 8. 常见问题

### 8.1 点了升级但进度一直不动、没有日志

> **该问题已在 v1.1.0 修复**：构建时 `apps/server/scripts/copy-spa.mjs` 会自动把执行器复制到
> `dist/scripts/updater.mjs`（构建日志有「升级执行器已复制到 dist/scripts/updater.mjs」）。
> 下面保留排查步骤，用于「v1.0.0 产物」「换了打包方式」「手工拷过 dist」这三种情况。

**现象**：卡片显示「任务已启动，等待日志…」，`.updates/state.json` 长时间不出现或 `phase` 不变。

**先查执行器脚本在不在**：

```bash
ls -l /opt/medihub/apps/server/dist/scripts/updater.mjs
```

不存在 → 子进程 `node <脚本>` 立即以「找不到模块」退出，而它的 stderr 被丢弃，
所以界面上什么都看不到。

**为什么会缺**：执行器脚本必须随构建产物一起进 `dist`。v1.0.0 的构建链只复制了数据库迁移目录，
没有复制 `apps/server/scripts/`；v1.1.0 起由 `copy-spa.mjs` 补上。

**应急处理**（仅旧版本需要；每次 `dist` 被替换后都要重做一遍）：

```bash
sudo -u www -H mkdir -p /opt/medihub/apps/server/dist/scripts
sudo -u www -H cp /opt/medihub/apps/server/scripts/updater.mjs \
                   /opt/medihub/apps/server/dist/scripts/updater.mjs
```

**根治**：升级到 v1.1.0 或更新版本（用本文的手工流程升一次），之后 `pnpm build` 会自动带上它。
自建构建时如果自行改了打包方式，记得仍要产出 `dist/scripts/updater.mjs`。另外确认
`apps/server/scripts/updater.mjs` 已提交到仓库——在线升级下载的是 tag 里的源码包，
文件没提交就不在包里，构建也会随之失败。

顺带确认一下别的原因：

```bash
# 手工跑一次执行器，能看到真实报错（升级场景请谨慎，它会真的改 dist）
cd /opt/medihub && sudo -u www -H /opt/node24/bin/node \
  apps/server/dist/scripts/updater.mjs rollback
```

### 8.2 升级到最后自动回滚，日志说「健康检查未在超时内返回」

> **v1.1.0 起已随产物同步版本号**（发布包的根 `package.json` 会写到安装根，并纳入备份/回滚），
> 正常情况下不会再出现这一条。若仍碰到，按下面自查——多数是「`UPDATE_WORKDIR` 指错」或
> 「`dist` / `package.json` 被手工替换过」。

**现象**：日志一路走到「重启服务」，然后 2 分钟后
`升级后健康检查未在超时内返回 1.1.0`，界面显示「已自动回滚到上个版本」。

**判定依据**：健康检查要求 `/api/health` 的 `version` **等于目标版本**；而 `version` 来自
**安装根 `package.json`**（`apps/server/src/version.ts` 的运行期读取）。所以只可能是
「`dist` 换了但 `package.json` 没换」或反过来。

**先自证**（三条应当一致）：

```bash
# 1) 健康接口当前返回什么
curl -fsS http://127.0.0.1:3000/api/health
# 2) 安装根的版本号
grep '"version"' /opt/medihub/package.json
# 3) 执行器认定的工作根（写错这里，上面两处就指向不同文件）
grep UPDATE_WORKDIR /opt/medihub/apps/server/.env
```

按结果分流：

| 现象                                                                  | 原因                                                                 | 处置                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `UPDATE_WORKDIR` 不是安装根（例如留了默认 `.`，实际是 `apps/server`） | 执行器把发布包 `package.json` 写到了错误位置                         | 改成安装根绝对路径，重启服务，再升一次                             |
| 三条都还是旧版本                                                      | 升级没走到第 5 步（看日志有没有 `已切换新的服务端构建产物与版本号`） | 按日志定位失败步骤；若被自动回滚，服务是正常的                     |
| `package.json` 是新版本、`/api/health` 是旧版本                       | 进程还没重启（`UPDATE_RESTART_CMD` 没生效或权限不足）                | 见 [§8.6](#86-一直停在正在升级) 与 [§5](#5-三种部署方式的重启命令) |
| `/api/health` 新、`package.json` 旧                                   | 有人手工替换过 `dist` 或用旧备份覆盖过                               | 用同一版本的源码重建一次（手工流程），或从备份目录恢复配套的那一份 |
| 备份里没有 `package.json`                                             | 备份是在 v1.1.0 之前创建的                                           | 那份备份不能用于回滚版本号；升级一次生成新备份即可                 |

排查其它可能：

```bash
# 健康接口本身通不通（不需要登录）
curl -i http://127.0.0.1:3000/api/health
# 端口/路径是否与 UPDATE_HEALTH_URL 一致
grep UPDATE_HEALTH_URL /opt/medihub/apps/server/.env
# 服务是不是根本没起来
sudo systemctl status medihub        # 或 pm2 status / supervisorctl status
sudo journalctl -u medihub -n 100 --no-pager
```

### 8.3 状态查询报「未配置在线升级」/ 卡片提示服务端未启用

三个开关必须同时满足（见 [§2.3](#23-判断能不能用的三个开关)）：

```bash
grep -E 'UPDATE_ENABLED|UPDATE_RESTART_CMD|UPDATE_WORKDIR' /opt/medihub/apps/server/.env
ls -l /opt/medihub/package.json
```

- `UPDATE_ENABLED` 必须是**小写 `true`**（`1`/`TRUE`/`yes` 都算关闭）；
- `UPDATE_RESTART_CMD` 不能为空；
- `UPDATE_WORKDIR` 指向的目录里必须有 `package.json`。

改完 **必须重启服务**（环境变量在进程启动时读取）：

```bash
sudo systemctl restart medihub      # 或 pm2 restart medihub --update-env / supervisorctl restart medihub
```

### 8.4 升级失败提示找不到 `pnpm` / `spawn pnpm ENOENT`

执行器继承服务进程的 `PATH`，不是登录 shell 的 `PATH`。手工确认：

```bash
sudo -u www -H bash -lc 'command -v pnpm'
```

- 用 1Panel「运行环境」装的 Node，pnpm 可能不在服务进程的 `PATH` 里；
- systemd 的 `EnvironmentFile` 不会带上你 `~/.bashrc` 里的 PATH。

任选一种修：

```ini
# 方案 A：在 unit 里显式给 PATH
Environment=PATH=/opt/node24/bin:/usr/local/bin:/usr/bin:/bin
```

```bash
# 方案 B：把 pnpm 软链到系统 PATH 目录（推荐，简单可靠）
sudo ln -sfn /opt/node24/bin/pnpm /usr/local/bin/pnpm
sudo ln -sfn /opt/node24/bin/node /usr/local/bin/node
```

### 8.5 日志停在 `pnpm install`

- 网络到 npm registry 不通或很慢：先在服务器上手工试
  `cd /opt/medihub && pnpm config get registry`、`curl -I https://registry.npmjs.org`；
- 磁盘满：`df -h`（staging 里要装一份完整 `node_modules`，约 1–2 GB）；
- `pnpm-lock.yaml` 与 tag 不匹配：`--frozen-lockfile` 会立刻失败，日志里会写
  `ERR_PNPM_OUTDATED_LOCKFILE`，属发布质量问题，回滚即可，让维护者修 tag。

### 8.6 一直停在「正在升级…」

执行器可能卡在重启命令上（比如 `sudo` 在等密码，而 stdio 被丢弃，什么都看不到）：

```bash
# 1) 看真实进程还在不在
ps aux | grep -E 'updater\.mjs' | grep -v grep
# 2) 看最后一步卡在哪
sudo -u www -H tail -c 2000 /opt/medihub/.updates/state.json
# 3) 确认重启命令本身能非交互执行（外层切到 www，内层就是 .env 里那条命令）
sudo -u www -H sudo -n systemctl restart medihub
```

超过 30 分钟仍是 `running`，执行器自身的并发保护会放行下一次任务；但**先把卡住的进程杀掉**，
并确认服务处于可用状态：

```bash
sudo pkill -f 'updater.mjs upgrade' || true
sudo systemctl status medihub
```

> 改重启命令时优先用 `sudo -n`（非交互）：它拿不到权限会立刻失败并写进日志，
> 而不是静默挂住整个升级。

### 8.7 磁盘空间不够

一份备份 = `dist`（几十 MB）+ 数据库；一份 staging = 源码 + 完整 `node_modules` + 构建产物
（1–2 GB）。`UPDATE_KEEP_BACKUPS` 默认 3，再加上 staging 与 downloads：

```bash
du -sh /opt/medihub/.updates/* 2>/dev/null
df -h /opt/medihub
# 手工清理（只在确认当前没有任务在跑时做）
sudo -u www -H rm -rf /opt/medihub/.updates/staging/* /opt/medihub/.updates/downloads/*
```

建议预留 **≥ 5 GB** 空闲，否则 `pnpm install` 会中途 `ENOSPC`，升级失败并自动回滚。

### 8.8 升级期间服务不可用

这是**预期行为**：重启窗口内（一般 10–30 秒，含健康检查轮询）站点会 502/连接失败，
正在上传的文件、正在编辑的 OnlyOffice 文档会中断。所以：

- 安排在非门诊时段（参考 [DEPLOY-1PANEL.md §13.1](./DEPLOY-1PANEL.md#131-升级标准流程) 的建议）；
- 提前在群里说一声「约 5 分钟不可用」；
- 升级前让 OnlyOffice 里的编辑者先保存并关闭（Document Server 只在所有编辑者关闭文档后才落盘）。

---

## 9. 安全说明

| 项                                | 说明                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 谁能操作                          | 只有 `root` 角色。三个接口（`system.updateStatus` / `system.startUpdate` / `system.rollbackUpdate`）都在服务端用 `requireRoot` 校验；非 root 连卡片都不渲染。**不要把 root 账号给别人**（这是能执行系统命令的最高权限）                   |
| 不要在公网裸奔                    | 即使有登录，也**不要**在「无 HTTPS、无鉴权、无访问控制」的场景开启在线升级。至少保持：HTTPS + 强 root 密码 + 必要时用 Nginx 的访问控制限制 `/rpc` 来源                                                                                    |
| `UPDATE_RESTART_CMD` 是命令注入面 | 它会被 `spawn(cmd, {shell:true})` 执行。**只写固定的运维命令**（`systemctl restart` / `pm2 restart` / `supervisorctl restart`），绝不接受外部输入、不要拼变量、不要写 `bash -c "$(...)"` 之类                                             |
| sudoers 最小化                    | 只授权**恰好那一条**命令，用 `NOPASSWD` 但不要给 `ALL`；文件放 `/etc/sudoers.d/medihub` 且 `chmod 440`                                                                                                                                    |
| GitHub token                      | `UPDATE_GITHUB_TOKEN` 只需读公开仓库，**不要**给 `repo` 写权限；泄露后到 GitHub 立即 revoke                                                                                                                                               |
| 供应链                            | 执行器下载的是**仓库 tag 的源码包**并按仓库里的锁文件构建。请只从你自己的 `UPDATE_REPO` 升级，不要把它指向不可信 fork                                                                                                                     |
| `.updates/` 的副作用              | 它在安装目录内，但仓库 `.gitignore` **已忽略 `.updates/`**，`git status` 不会看到它，也不需要额外配置。注意两点：① **永远不要** `git clean -fdx`（会连备份一起删掉）；② 备份含患者数据的数据库副本，别把它同步到网盘/代码仓库等第三方位置 |
| root 账号的边界                   | root 是全局管理员，可为任意科室操作数据；配合「科室作用域」只影响**看哪个科室**，不改变权限范围（见 [DEPLOY-1PANEL.md §17](./DEPLOY-1PANEL.md#17-科室作用域x-org-scope运维须知)）                                                         |

---

## 10. 附录

### 10.1 一页速查

```bash
# 配置检查（三项开关）
grep -E 'UPDATE_' /opt/medihub/apps/server/.env

# 当前版本 / 健康
curl -fsS http://127.0.0.1:3000/api/health
grep '"version"' /opt/medihub/package.json

# 最新 Release
curl -s https://api.github.com/repos/Eunsolfs/medihub/releases/latest | grep -m1 '"tag_name"'

# 任务状态与日志
sudo -u www -H cat /opt/medihub/.updates/state.json
watch -n 2 'sudo -u www -H cat /opt/medihub/.updates/state.json'

# 备份列表
sudo -u www -H ls -1 /opt/medihub/.updates/backups/

# 执行器脚本是否就位
ls -l /opt/medihub/apps/server/dist/scripts/updater.mjs
```

### 10.2 与手工升级流程的关系

|                       | 在线升级（本文）                      | 手工升级（[DEPLOY-1PANEL.md §13](./DEPLOY-1PANEL.md#13-升级与回滚)） |
| --------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| 代码来源              | codeload 下载的 tag 源码包            | `git pull`                                                           |
| 产物落点              | 只替换 `apps/server/dist`（源码不动） | 整个工作区更新                                                       |
| 安装根 `package.json` | 只同步版本号（v1.1.0 起）             | 随 git pull 更新                                                     |
| 适合                  | 稳定运行、只想换版本                  | 需要改配置/看源码/排查问题                                           |
| 回滚                  | 备份目录（dist + db + package.json）  | git + 运维备份                                                       |

**不要混用**：在线升级后再 `git pull` 会出现「源码是旧版本、dist 是新版本」的缝；
反之手工升级后如果备份目录还留着旧 dist，点「回滚」会退回更老的版本。切换方式前，
先 `ls .updates/backups/` 并把不需要的目录移走。

### 10.3 相关文档

- [1Panel 单机部署手册](./DEPLOY-1PANEL.md) —— 部署、进程守护、反代、备份恢复、手工升级
- [ONLYOFFICE 接入方案](./ONLYOFFICE.md) —— 升级前让编辑者保存并关闭文档
- [文档索引](./README.md)
