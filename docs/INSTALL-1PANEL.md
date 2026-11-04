# 安装器参考（v1.10.1）

> **📌 第一次部署请先看 [1PANEL-FIRST-DEPLOY.md](./1PANEL-FIRST-DEPLOY.md)**
>
> 那篇是**从零到上线**的主线教程（DNS → 一键安装 → 反代 → HTTPS → `/install` → 建首个科室 →
> 验收 → 备份 → 升级 → 排障）。**本文只是安装器 `scripts/install-1panel.sh` 的参数、行为与卸载参考**，
> 不再重复完整开箱流程——遇到「这个参数干什么 / 某版本改了什么 / 怎么卸干净」再回来查。
>
> - 想改安装目录、用 Supervisor/PM2、手工配反代与证书 → [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md)（手工/进阶）
> - 想用容器部署 → [DOCKER.md](./DOCKER.md)（**不要**运行本脚本）

本文对应脚本 **v1.10.1**（纯净版：脚本不创建账号、不写入任何演示数据）。

> **不适用 Docker**：容器部署请用仓库的 `Dockerfile` / `docker-compose.yml`
> （见 [DOCKER.md](./DOCKER.md)），**不要**运行本脚本——容器里没有可写的 systemd/安装目录。

> 需要 root 或 sudo。下载依赖 + 构建通常 **5–15 分钟**（取决于服务器带宽；国内机器可能更久）。
> 脚本**不会**替你创建 1Panel 站点与证书，也不会改你的 Nginx 配置——反向代理那一步需要在面板里点一次。

## 怎么用（三步）

```bash
# 1) 下载脚本（先看再跑）
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh -o install-medihub.sh

# 2) 预览要做什么（不写盘、不下载源码包）
sudo bash install-medihub.sh --url https://medihub.example.com --dry-run

# 3) 正式安装（不传 --port 时自动挑 20000–29999 的空闲端口）
sudo bash install-medihub.sh --url https://medihub.example.com
```

装完脚本会打印**监听端口**与 `/api/health` 地址，接着按
[FIRST-DEPLOY §3–§6](./1PANEL-FIRST-DEPLOY.md#3-在-1panel-创建反向代理) 做反向代理、HTTPS、
`/install` 建管理员、建第一个科室。

> 也可以一条命令管道执行（不适合先审查脚本的场景）：
> `curl -fsSL …/install-1panel.sh | sudo bash -s -- --url https://你的域名`

## 常用参数

| 参数                                       | 说明                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `--dir /opt/medihub`                       | 安装目录（默认 `/opt/medihub`）                                                              |
| `--url https://...`                        | 写入 `BETTER_AUTH_URL`，必须是浏览器访问地址                                                 |
| `--port 3000`                              | API 端口，必须是 1–65535 的数字；默认自动选 20000–29999 的空闲端口；指定端口被占用会直接报错 |
| `--tag v1.10.1`                            | 指定版本（默认取最新 Release）；也可以写 `vX.Y.Z`                                            |
| `--user medihub`                           | 运行服务的系统用户（默认 `medihub`）                                                         |
| `--update`                                 | 升级现有安装，保留 `.env`、SQLite、素材与升级备份                                            |
| `--onlyoffice-url` / `--onlyoffice-secret` | OnlyOffice 地址与 JWT 密钥，可后填                                                           |
| `--dry-run`                                | 只打印要执行的操作，不改系统                                                                 |
| `--yes`                                    | 非交互确认                                                                                   |
| `--version`                                | 打印安装脚本版本                                                                             |
| `--purge`                                  | 清理一次失败/不再需要的安装（停服务、删目录与用户、删 sudoers 规则）                         |
| `--force`                                  | 与 `--purge` 连用，允许连数据库一起删除                                                      |

> v1.9.9 起：参数**缺值**会直接报「参数 X 缺少值」，不再是 unbound variable 之类的底层报错；
> `--help` 会完整打印全部参数（包括 `--user`、`--dir` 等）。

### v1.9.x–v1.10.x 行为变化（老教程里容易踩的坑）

| 版本    | 变化                                                                                                                                                              | 对运维的影响                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| v1.9.1  | 自动写 `/etc/sudoers.d/medihub-update`（`medihub` 免密 `systemctl restart medihub`）；systemd 单元加 `KillMode=process`                                           | 在线升级**不再被重启杀掉**；失败时能快速报「重启服务失败」而不是静默卡住 |
| v1.9.2  | 自动生成 `BETTER_AUTH_TRUSTED_ORIGINS`（`http://127.0.0.1:<端口>`、`http://<服务器IP>:<端口>`；HTTP 站点额外加域名）                                              | 装完可以直接用 `IP:端口` 打开；用域名 + HTTPS 后仍要按反代章节补域名     |
| v1.9.3  | **先停旧服务再选端口**；`--update` 不再误改端口；端口真被别的程序占用会**报错**而不是静默换端口                                                                   | 升级不会悄悄换端口导致反代 502；端口冲突时按提示释放端口或显式 `--port`  |
| v1.9.4  | `DATABASE_URL` / `STORAGE_ROOT` 相对路径以 `apps/server` 为基准                                                                                                   | 命令行脚本可以从**任意 cwd** 运行，不再打开错误数据库                    |
| v1.9.9  | 参数缺值报「参数 X 缺少值」；`--purge` 无论服务单元是否存在都清理 sudoers；用户/端口等参数校验更严                                                                | 失败/清理后不会留下「半套」权限规则                                      |
| v1.10.0 | 移除 `--seed` 与全部演示数据：脚本**只建表、不建账号**；`--seed` 现在会直接报错说明已移除                                                                         | 装完必须打开 `/install` 创建管理员，再建第一个科室                       |
| v1.10.1 | `--update` 未传 `--url` 时**保留原 `BETTER_AUTH_URL`**（不再把线上域名重置成本机地址）；`BETTER_AUTH_TRUSTED_ORIGINS` 自动包含 **服务器全部 IPv4** 与 `localhost` | 升级不会再把登录打回 403；多网卡/多 IP 机器用任意内网 IP 都能登录        |

### 安装失败 / 残留处理

脚本是幂等的：**失败后修复原因，直接重跑同一条安装命令即可**，`.env`、数据库与素材不会被删除。
脚本失败时会打印失败阶段，并尝试停掉半成品服务；临时目录会自动清理。

先看是什么失败：

```bash
systemctl status medihub --no-pager
journalctl -u medihub -n 100 --no-pager
```

常见残留与处理：

```bash
# 1) 源码目录不完整（例如 packages/storage 缺失）
ls /opt/medihub/packages
# 修复：重新下载最新安装脚本后重跑；不要手工删 node_modules

# 2) 想彻底重来（会删数据库与素材！）
sudo bash install-medihub.sh --purge --yes
# 已有数据库时必须显式加 --force：
sudo bash install-medihub.sh --purge --yes --force

# 3) 只想保留数据、重装程序
sudo bash install-medihub.sh --update --yes
```

> 旧版脚本有一个已修复的缺陷：同步代码时用小写 `storage` 当排除规则，会连
> `packages/storage` 一起排除，导致构建报 `Cannot find package '@medihub/storage'`。
> 升级到包含该修复的版本（v1.7.1+）后重跑即可。

## OnlyOffice（已装好，稍后填参数）

安装脚本不会改动你的 Document Server，只在 `.env` 里留了两个可选项：

```ini
ONLYOFFICE_URL="http://你的OnlyOffice地址:端口"
ONLYOFFICE_JWT_SECRET="和 Document Server 里一致的 JWT 密钥"
```

填完执行 `systemctl restart medihub`，然后到「系统管理 → Office 集成」点「重新检测」，
两项都显示「已配置」即可在桌面端在线编辑 Office 文档（手机端仅支持预览，属 OnlyOffice 授权限制）。

> Document Server 与本站之间需要能互相访问：本站要能请求 OnlyOffice 的编辑接口，
> OnlyOffice 也要能通过 `BETTER_AUTH_URL` 拉取文档。若两者不在同一台机器，
> 请把 `ONLYOFFICE_URL` 填成 OnlyOffice 可访问、且本站也可访问的地址。

### 地址与密钥怎么找

**Document Server 地址**：就是 OnlyOffice 自己的访问地址，不是医档通的地址。

- 1Panel：「应用商店 → 已安装 → OnlyOffice」，详情里的「访问地址 / 端口」即是；
  形如 `https://office.example.com` 或 `http://服务器IP:8080`，**不要带路径**。
- 命令行（同一台机器）：

  ```bash
  docker ps --format '{{.Names}}\t{{.Ports}}' | grep -i onlyoffice
  # 例如 0.0.0.0:8080->80/tcp，则地址是 http://服务器IP:8080
  curl -fsS http://127.0.0.1:8080/healthcheck   # 返回 true 即可用
  ```

**JWT 密钥**：与 Document Server 的 `JWT_SECRET` 必须一致。

- 1Panel：OnlyOffice 应用详情 →「环境变量 / 参数」，找 `JWT_SECRET`（安装时自动生成）；
- 命令行：

  ```bash
  docker exec <onlyoffice容器名> env | grep -i jwt
  ```

- 也可以先留空：安装完成后到「系统管理 → Office 集成」看状态，再决定要不要配。

**常见坑**：

- 填了 `http://127.0.0.1:8080` 在**另一台机器**上不成立——OnlyOffice 和医档通不在同一容器/主机时，
  必须填双方都能访问的地址；
- 主站是 HTTPS、编辑器是 HTTP 时，浏览器会按混合内容拦截（白屏），需要给 OnlyOffice 也配 HTTPS；
- 改完 `.env` 后必须 `systemctl restart medihub`，否则状态卡片仍显示「未配置」。

## 日常升级

- 界面：root 登录 → 系统管理 → 版本与升级 → 检查更新 → 升级（失败自动回滚）；
- 命令行：`sudo bash install-medihub.sh --update`（保留数据，升级前自动备份数据库）。
  **v1.10.1 起不传 `--url` 会保留原来的 `BETTER_AUTH_URL`**——只有换域名时才需要显式传
  `--url https://新域名`，否则不要传（老版本会把它重置成本机地址，导致登录 403）。
  注意：**命令行升级失败时不会自动回滚**，脚本会把升级前的数据库备份到
  `.updates/backups/manual-<时间>/db.sqlite`，需要时手动恢复：

  ```bash
  sudo systemctl stop medihub
  sudo cp /opt/medihub/.updates/backups/manual-<时间>/db.sqlite /opt/medihub/apps/server/local.db
  sudo rm -rf /opt/medihub/apps/server/dist
  sudo bash install-medihub.sh --update --tag <上一个版本>   # 重新铺回旧版本
  ```

  （完整自动回滚只在「系统管理 → 版本与升级」的在线升级里提供。）

**升级失败怎么查**（v1.9.1+ 修了重启被杀的问题，先看状态文件再看日志）：

```bash
# 1) 在线升级/命令行升级的状态与日志
sudo cat /opt/medihub/.updates/state.json | tail -40
# 2) 服务日志
sudo journalctl -u medihub -n 100 --no-pager
# 3) 实在不行重跑 CLI（幂等，保留 .env / 数据库 / 素材）
sudo bash install-medihub.sh --update --yes
```

升级与回滚细节见 [UPGRADE.md](UPGRADE.md)。

> `--dry-run` 不会修改系统、不会下载源码包（但仍会执行一次 GitHub 版本查询）。
> 先预览一遍再真跑：`sudo bash install-medihub.sh --url https://你的域名 --dry-run`。

## 脚本做了什么

1. 安装 `curl/tar/xz`（缺什么补什么）；
2. 安装 Node.js 24 与 pnpm 12（已有且版本足够则跳过）；
3. 创建系统用户 `medihub`；
4. 写 `/etc/sudoers.d/medihub-update`：允许 `medihub` **免密** `systemctl restart medihub`
   （在线升级执行器要用它重启服务；v1.9.1+）；
5. 从 GitHub 下载目标版本源码包，解压到安装目录（保留 `.env`、`local.db`、`storage`、`.updates`）；
6. 先停旧服务，再选端口（首次安装自动选 20000–29999；升级时沿用 `.env` 端口，被占则报错）；
7. 生成/补齐 `.env`（随机 `BETTER_AUTH_SECRET`、`BETTER_AUTH_TRUSTED_ORIGINS`、
   在线升级配置、OnlyOffice 占位）；相对路径以 `apps/server` 为基准（v1.9.4+）；
8. `pnpm install --frozen-lockfile` + `pnpm run build`；
9. 执行数据库迁移（只建表，**不写任何数据**；账号只能通过 `/install` 创建）；
10. 写入 systemd 服务 `medihub.service`：`EnvironmentFile` + `WorkingDirectory=<dir>/apps/server` +
    `Restart=always` + **`KillMode=process`**（重启时不杀在线升级执行器，v1.9.1+）；
11. 启动并轮询 `/api/health`，失败时打印最近日志。

## 常见问题

| 现象                        | 处理                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 下载源码包失败              | 服务器访问 GitHub 受限；可先在能上网的机器下载 `tar.gz`，解压后手动 `--dir` 指向目录执行安装                                                                                                                                   |
| `pnpm: command not found`   | 检查 `node -v` 是否 ≥24；脚本安装在 `/usr/local/bin`，确认 PATH 包含它                                                                                                                                                         |
| 端口被占用                  | **首次安装**会自动换空闲端口；**`--update` 升级**时若原端口被占，脚本会**报错并要求你处理**（不静默换端口，避免反代失效）。先 `ss -lntp \| grep <端口>` 找到占用者，释放它或显式 `--port` 指定新端口（记得同步改 1Panel 反代） |
| 健康检查失败                | `journalctl -u medihub -n 80 --no-pager` 看日志；常见是 `.env` 缺少 `BETTER_AUTH_SECRET`、端口被占                                                                                                                             |
| 登录后 403 / Invalid origin | `BETTER_AUTH_URL` 必须与浏览器地址完全一致（含协议与端口）；用 `IP:端口` 访问时把该地址加进 `BETTER_AUTH_TRUSTED_ORIGINS`（逗号分隔）后重启服务                                                                                |
| 登录提示「尝试过于频繁」    | v1.9.6+ 登录/注册/改密限流 10 次/分钟（按 IP，全局 120 次/分钟）；等一分钟再试                                                                                                                                                 |
| OnlyOffice 编辑报错         | 检查 Document Server 与本站的双向可达性，以及 JWT 密钥是否一致                                                                                                                                                                 |

## 账号与登录（参考）

脚本**不会**创建任何账号（纯净版），站点处于「未初始化」状态——**完整步骤见
[FIRST-DEPLOY §5–§6](./1PANEL-FIRST-DEPLOY.md#5-初始化第一个管理员)**，这里只列要点：

1. 打开 `https://你的域名/install`（登录页也会显示「前往安装向导」）；
2. 填超级管理员姓名 / 邮箱 / 密码（可选 OnlyOffice 参数）→「完成安装」→ 自动跳登录页；
3. 登录后先到 **系统管理 → 科室** 新建第一个科室，否则创建不了患者/资料库/教学会议；
4. 已有账号后 `/install` 接口返回 **409**，不会被用来重置管理员——忘记密码请用下面的命令。

列账号 / 重置密码（在安装目录执行；v1.9.4+ 也可以从任意目录执行）：

```bash
# 方式一：包里的脚本（cwd 自动是 apps/server）
pnpm --filter @medihub/server reset-password --list
pnpm --filter @medihub/server reset-password <你的管理员邮箱> '新密码'

# 方式二：直接跑 TS（Node 24 自带类型剥离）
cd /opt/medihub/apps/server && node --env-file=.env src/reset-password.ts --list
# 任意 cwd：
node --env-file=/opt/medihub/apps/server/.env /opt/medihub/apps/server/src/reset-password.ts --list
```

不带密码时脚本会**随机生成并打印**；数据库还没迁移时会提示先执行 `pnpm run db:migrate`（不再直接抛裸 Drizzle 堆栈）。

## 卸载

```bash
# 推荐：脚本自带清理（停服务、删目录与用户、删 /etc/sudoers.d/medihub-update）
# 有数据库时必须加 --force；v1.9.9 起无论服务单元是否存在都会清理 sudoers 规则
sudo bash install-medihub.sh --purge --yes --force
```

手工卸载：

```bash
sudo systemctl disable --now medihub
sudo rm /etc/systemd/system/medihub.service
sudo rm -f /etc/sudoers.d/medihub-update
sudo rm -rf /opt/medihub   # 确认数据已备份
```
