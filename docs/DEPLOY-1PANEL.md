# 医档通 MediHub 单机部署手册（1Panel + Nginx 反向代理 + HTTPS）

本文面向一台 Linux 服务器，把 MediHub 以**单进程**方式部署在 1Panel 面板后面：1Panel 负责
面板、OpenResty（Nginx）反向代理、证书、防火墙、计划任务与进程守护；MediHub 只监听
`127.0.0.1:3000` 之外的唯一端口，由 Nginx 以一个域名对外提供。

> **版本与命令基线**：Node `24.22.1`、pnpm `12.15.0`（与仓库 `package.json` 的
> `engines` / `devEngines` 一致）。1Panel 按社区版 v2 界面撰写；v1 的菜单位置在括号里注明。

## 目录

1. [架构与端口](#1-架构与端口)
2. [前置条件](#2-前置条件)
3. [安装 1Panel](#3-安装-1panel)
4. [安装 Node 24 与 pnpm 12](#4-安装-node-24-与-pnpm-12)
5. [建目录、系统用户与代码](#5-建目录系统用户与代码)
6. [环境变量 `apps/server/.env`](#6-环境变量-appsserverenv)
7. [安装依赖、迁移、构建、初始化管理员](#7-安装依赖迁移构建初始化管理员)
8. [进程守护（两套方案）](#8-进程守护两套方案)
9. [Nginx 反向代理](#9-nginx-反向代理)
10. [HTTPS 与强制跳转](#10-https-与强制跳转)
11. [防火墙](#11-防火墙)
12. [备份与恢复](#12-备份与恢复)
13. [升级与回滚](#13-升级与回滚)
14. [上线验收清单](#14-上线验收清单)
15. [故障排查](#15-故障排查)
16. [附录：与仓库现状的已知差异](#16-附录与仓库现状的已知差异)
17. [科室作用域（`x-org-scope`）运维须知](#17-科室作用域x-org-scope运维须知)

---

## 1. 架构与端口

```
浏览器 ──https──> 1Panel / OpenResty :443 ──http──> 127.0.0.1:3000 (MediHub server)
                        │                                   │
                   Let's Encrypt 证书              ├─ /api/auth    Better Auth（Cookie 会话）
                                                   ├─ /rpc         oRPC
                                                   ├─ /api/files   上传下载
                                                   ├─ /api/office  Office 预览/编辑/回调
                                                   ├─ /api/exports 导出下载
                                                   └─ 静态 SPA     apps/server/dist/public
```

| 环境     | web          | api          | 说明                                                |
| -------- | ------------ | ------------ | --------------------------------------------------- |
| 开发     | 5173（Vite） | 3000（Hono） | 浏览器访问 5173，Vite 把 `/api`、`/rpc` 代理到 3000 |
| **生产** | —            | **3000**     | 服务端同时托管 SPA，浏览器只访问一个端口/域名       |

生产环境只有 3000 一个进程：`apps/server` 在 `dist/public` 存在时用 `serveStatic` 托管构建好的
前端，并对所有未匹配路径回落到 `index.html`（SPA 路由）。

因此：

- Nginx **只需**把整个站点反向代理到 `127.0.0.1:3000`，不需要为静态资源单独开 location；
- 不要指望 `apps/web` 的 `vite preview` 参与生产，那只是本地预览。

---

## 2. 前置条件

### 2.1 服务器规格

| 部署形态                                    | CPU      | 内存     | 磁盘      | 说明                                                                  |
| ------------------------------------------- | -------- | -------- | --------- | --------------------------------------------------------------------- |
| 仅 MediHub（无 OnlyOffice、无 LibreOffice） | 2 核     | 4 GB     | 40 GB SSD | 图片/视频存储另算，建议数据盘单独挂载                                 |
| + LibreOffice 转 PDF                        | 2 核     | 4 GB     | 40 GB     | 每次转换占用一个 soffice 进程，峰值内存约 300–500 MB（经验值）        |
| + OnlyOffice Docs（同机）                   | **4 核** | **8 GB** | 60 GB     | OnlyOffice 官方推荐 RAM 4 GB 起、swap 2 GB 起，与主站同机时按两倍预留 |

存储容量按「原始素材体积 × 2」估算（备份另需一份）。

### 2.2 系统与软件

| 项目     | 要求                                                                               |
| -------- | ---------------------------------------------------------------------------------- |
| 系统     | Ubuntu 22.04 / 24.04、Debian 12；CentOS / RHEL 系需注意 SELinux（见 §15）          |
| 1Panel   | 社区版 v2                                                                          |
| Node.js  | `24.22.1`（与 `.node-version`、`engines.node` 一致）                               |
| pnpm     | `12.15.0`（与 `engines.pnpm` 一致）                                                |
| 反向代理 | 1Panel 自带的 OpenResty（不需要另装 Nginx）                                        |
| 可选     | `git`、`sqlite3`（备份要用）、`libreoffice`（Office 转 PDF）、Docker（OnlyOffice） |

### 2.3 端口

| 端口                   | 用途                                          | 对外                                            |
| ---------------------- | --------------------------------------------- | ----------------------------------------------- |
| 80                     | HTTP → HTTPS 跳转、Let's Encrypt HTTP-01 校验 | 是                                              |
| 443                    | 站点 HTTPS                                    | 是                                              |
| 面板端口（安装时自定） | 1Panel 管理界面                               | 建议只对固定 IP 开放                            |
| 3000                   | MediHub server                                | **否**，只允许本机                              |
| 8080 / 8443            | OnlyOffice（若部署）                          | 视方案而定，见 [ONLYOFFICE.md](./ONLYOFFICE.md) |

---

## 3. 安装 1Panel

官方一键安装（需要联网）：

```bash
bash -c "$(curl -sSL https://resource.1panel.pro/v2/quick_start.sh)"
```

安装脚本会让你选择安装目录（默认 `/opt/1panel`）与面板端口，然后打印面板地址与**安全入口**。
忘了入口时在服务器上执行：

```bash
1pctl user-info
```

装完后：

1. 云厂商安全组放行面板端口；
2. 浏览器打开 `http://<公网IP>:<端口>/<安全入口>`，设置管理员账号；
3. **界面：主机 → 防火墙**（v1：`主机 → 防火墙`），面板端口加入放行；
4. **界面：主机 → 终端**，后续命令都可以直接在这里执行（等于 SSH）。

> 也可以直接 SSH。下文命令默认以 `root` 执行，涉及切换用户的步骤会显式写出 `sudo -u`。

---

## 4. 安装 Node 24 与 pnpm 12

两种做法，任选其一。**推荐方案 B**（版本可控、与仓库锁定版本一致），方案 A 适合只愿意在面板里点的人。

### 方案 A：1Panel「运行环境 → Node.js」（图形化）

**界面：运行环境 → Node.js → 创建运行环境**（v1 在 `网站 → Node 环境`）。

1. 点「创建运行环境」，选择 Node 版本、源码/项目目录、启动方式；
2. 创建后可在列表里做启动、停止、重启、编辑、模块管理（安装依赖）、查看日志；
3. 需要在项目根目录执行 `pnpm install` / `pnpm build` 这类命令时，仍要进「主机 → 终端」。

**版本限制（务必先确认）**：1Panel 文档里 Node 运行环境当前列出的受支持大版本是
`12.x / 14.x / 16.x / 18.x`。如果你的面板版本里**没有 24.x**，按下面任一条处理，不要硬选 18：

- 先按**方案 B** 把 Node 24 装到 `/opt/node24`，再回到「创建运行环境」把解释器/版本指向该目录
  （字段名随面板版本不同，以面板显示为准）；
- 或者干脆全部走方案 B，用「工具箱 → Supervisor」托管进程（§8 方案 A），效果完全等价。

### 方案 B：官方 tar 包 + npm 安装 pnpm（推荐，可复制执行）

```bash
# 1) 依赖
sudo apt-get update
sudo apt-get install -y curl xz-utils git rsync sqlite3 ca-certificates

# 2) 下载并解压 Node 24.22.1（国内可换 xz 镜像，见下方注释）
NODE_VERSION=24.22.1
curl -fsSL -o /tmp/node.tar.xz \
  "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
mkdir -p /opt
tar -xJf /tmp/node.tar.xz -C /opt
rm -rf /opt/node24
mv "/opt/node-v${NODE_VERSION}-linux-x64" /opt/node24

# 3) 进 PATH（当前会话 + 之后所有 shell）
ln -sfn /opt/node24/bin/node /usr/local/bin/node
ln -sfn /opt/node24/bin/npm  /usr/local/bin/npm
ln -sfn /opt/node24/bin/npx  /usr/local/bin/npx
cat >/etc/profile.d/node.sh <<'EOF'
export PATH=/opt/node24/bin:$PATH
EOF
chmod +x /etc/profile.d/node.sh

# 4) 校验 Node
node -v   # 期望 v24.22.1

# 5) 安装 pnpm 12.15.0（版本对齐仓库 engines.pnpm）
npm i -g pnpm@12.15.0
ln -sfn /opt/node24/bin/pnpm /usr/local/bin/pnpm
pnpm -v   # 期望 12.15.0
```

镜像源（下载慢时使用，二选一）：

```bash
# Node 二进制镜像：把上面第 2 步的 URL 换成
#   https://npmmirror.com/mirrors/node/v24.22.1/node-v24.22.1-linux-x64.tar.xz
# npm registry 镜像：
npm config set registry https://registry.npmmirror.com
# pnpm registry 镜像（可选，pnpm 会读 npm 配置，一般无需重复设置）：
pnpm config set registry https://registry.npmmirror.com
```

**用 corepack 代替 npm 的写法**（Node 24 仍自带 corepack）：

```bash
corepack enable
corepack prepare pnpm@12.15.0 --activate
pnpm -v
```

> 注意：仓库根 `package.json` 只有 `devEngines.packageManager`，没有 `packageManager` 字段。
> corepack 在缺少该字段时可能装到别的版本，所以 `corepack prepare pnpm@12.15.0 --activate`
> 这一步必须显式指定版本，装完用 `pnpm -v` 复核。

**CentOS / RHEL 差异**：

```bash
# 包管理器
sudo yum install -y curl xz git rsync sqlite ca-certificates
# 或（CentOS Stream 8+ / RHEL 8+）
sudo dnf install -y curl xz git rsync sqlite ca-certificates
# 不要忘了 SELinux 可能拦住 /opt 下的写入与 3000 端口监听，见 §15
```

---

## 5. 建目录、系统用户与代码

约定：

| 路径                     | 内容                                   |
| ------------------------ | -------------------------------------- |
| `/opt/medihub`           | 代码仓库（git clone 到这里）           |
| `/data/medihub/local.db` | SQLite 数据库（建议放数据盘）          |
| `/data/medihub/storage`  | `STORAGE_ROOT`，本地驱动的素材落盘目录 |
| `/www/backup/medihub`    | 备份产物                               |

运行用户用 1Panel 自带的 `www`（OpenResty 与站点目录都属于它，权限最省事）。若单位要求独立账号，
把下文所有 `www:www` 换成你的账号，并在 Supervisor 里同步「运行用户」。

```bash
# 1) 目录
mkdir -p /opt/medihub /data/medihub/storage /www/backup/medihub

# 2) 拉代码（公开仓库）
git clone https://github.com/Eunsolfs/medihub.git /opt/medihub

# 3) 属主交给 www
chown -R www:www /opt/medihub /data/medihub /www/backup/medihub
chmod 750 /data/medihub /www/backup/medihub

# 4) 给运行用户一个可写的 HOME 与 shell。
#    pnpm 的全局 store 与缓存默认写在 $HOME/.local/share/pnpm；
#    www 若没有 HOME，pnpm 会去写 /root/... 然后 EACCES。
mkdir -p /home/www
chown www:www /home/www
usermod -d /home/www www
usermod -s /bin/bash www

# 5) 校验（需要能看到 git 记录与 package.json）
sudo -u www -H git -C /opt/medihub log --oneline -1
```

> **下文的 `sudo -u www -H` 不能省 `-H`**：`-H` 让 sudo 把 `HOME` 设成 `www` 的家目录。
> 少了它，sudo 保留 root 的 `HOME`，`pnpm` 第一次运行就会报
> `EACCES: permission denied, mkdir '/root/.local/share/pnpm'`。

> 私有镜像 / 内网 GitLab：把 clone 地址换成你自己的，其余不变。
> 用 `root` clone 过也没关系，最后 `chown -R www:www /opt/medihub` 即可。

---

## 6. 环境变量 `apps/server/.env`

### 6.1 生成密钥

```bash
openssl rand -hex 32
```

输出 64 位十六进制串，直接作为 `BETTER_AUTH_SECRET`。**它同时用于存储目标配置的 AES-256-GCM
加密**（见 `apps/server/src/context.ts`），一旦更换，已入库的 NAS / S3 存储配置将无法解密，必须重新配置。

### 6.2 变量清单

文件位置：`/opt/medihub/apps/server/.env`（`DATABASE_URL`、`STORAGE_ROOT` 等相对路径都以
`apps/server` 为基准解析）。

| 变量                          | 必填 | 生产示例                                         | 说明                                                                        |
| ----------------------------- | ---- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | 是   | `openssl rand -hex 32` 的输出                    | ≥32 字符；同时是存储配置加密密钥，务必长期不变并纳入备份                    |
| `BETTER_AUTH_URL`             | 是   | `https://medihub.summerecho.cn`                  | **浏览器看到的外部地址**。Better Auth 用它做 Origin 校验，写错就是 403      |
| `DATABASE_URL`                | 是   | `/data/medihub/local.db`                         | SQLite 文件；相对路径相对 `apps/server`                                     |
| `PORT`                        | 否   | `3000`                                           | 监听端口                                                                    |
| `STORAGE_ROOT`                | 否   | `/data/medihub/storage`                          | 本地/NAS 驱动的根目录；`/api/office` 的转换缓存写在它下面的 `.office-cache` |
| `UPLOAD_MAX_BYTES`            | 否   | `268435456`                                      | 单文件上限，默认 256 MB。**Nginx 的 `client_max_body_size` 必须比它大**     |
| `SOFFICE_PATH`                | 否   | `/usr/bin/soffice`                               | 配置后 docx/xlsx/pptx 可转 PDF 预览；不配则该接口返回 501                   |
| `ONLYOFFICE_URL`              | 否   | `https://office.example.com`                     | OnlyOffice Document Server 地址；**必须和主站同协议**                       |
| `ONLYOFFICE_JWT_SECRET`       | 否   | 与容器 `JWT_SECRET` 同值                         | 两个都填才启用在线编辑                                                      |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 否   | `https://medihub.summerecho.cn,https://10.0.0.8` | 逗号分隔的额外可信来源（局域网 IP、备用域名）                               |
| `SEED_ROOT_EMAIL`             | 否   | `root@example.com`                               | 仅执行 seed 脚本时创建的超管邮箱                                            |
| `SEED_ROOT_PASSWORD`          | 否   | 强密码（≥8 位）                                  | 仅执行 seed 脚本时使用                                                      |

> `BETTER_AUTH_TRUSTED_ORIGINS` 已在 `apps/server/src/env.ts` 里声明（`z.string().optional()`），
> 但它是**可选的普通字符串，值本身不做格式校验**：写成中文逗号、留空格、带多余引号都不会
> 在启动时报错，只在某个来源登录时才表现为 403。真正消费它的是 `packages/auth/src/index.ts`
> （按英文逗号切分后并入 `trustedOrigins`）。上线前务必手工核对一遍。

### 6.3 `.env` 全文示例

```bash
# /opt/medihub/apps/server/.env
# 会话与存储配置加密密钥（≥32 字符）。生产必须替换，且不要更换。
BETTER_AUTH_SECRET="替换为 openssl rand -hex 32 的输出"

# 浏览器访问本站的地址。必须是对外 https 域名，末尾不要带斜杠。
BETTER_AUTH_URL="https://medihub.summerecho.cn"

# SQLite 放在数据盘，避免重装系统丢数据。
DATABASE_URL="/data/medihub/local.db"

PORT="3000"
STORAGE_ROOT="/data/medihub/storage"

# 256 MB；Nginx 侧 client_max_body_size 设 300m 留出协议头余量。
UPLOAD_MAX_BYTES="268435456"

# LibreOffice：装好后用 `command -v soffice` 确认真实路径。
SOFFICE_PATH="/usr/bin/soffice"

# OnlyOffice（可选）。两个都填才启用在线编辑。
ONLYOFFICE_URL="https://office.example.com"
ONLYOFFICE_JWT_SECRET="与 onlyoffice 容器的 JWT_SECRET 完全一致"

# 额外可信来源（可选）。主域名由 BETTER_AUTH_URL 自动覆盖，无需重复。
BETTER_AUTH_TRUSTED_ORIGINS="https://medihub.summerecho.cn,https://10.0.0.8"

# 首次执行 seed 脚本时创建的超管（可选，seed 之后可以删掉这两行）。
SEED_ROOT_EMAIL="root@example.com"
SEED_ROOT_PASSWORD="换成你自己的强密码"

# 让进程与 LibreOffice 的子进程都按北京时间解释时间。
TZ="Asia/Shanghai"
```

```bash
# 用编辑器写入：把上面代码块里的内容整段放进这个文件
sudo -u www -H vi /opt/medihub/apps/server/.env
# 也可以走面板：主机 → 文件，定位到 /opt/medihub/apps/server/.env 直接编辑

# 写完后收紧权限
sudo chown www:www /opt/medihub/apps/server/.env
sudo chmod 600 /opt/medihub/apps/server/.env
```

> `sudo -u www -H` 不会继承 `profile.d` 里的 PATH，但 §4 方案 B 已把 `node` / `npm` / `pnpm`
> 软链到 `/usr/local/bin`，它本来就在 sudo 的 `secure_path` 里，所以这些命令照常可用。
> 如果换成别的安装路径，请用绝对路径 `/opt/node24/bin/pnpm`。

> `.gitignore` 已忽略 `.env`，`git pull` 不会覆盖它。
> `apps/server/.env.example` 是模板，字段与上表一致。

### 6.4 装 LibreOffice（可选，用于 Office 转 PDF）

```bash
# Ubuntu / Debian
sudo apt-get install -y libreoffice libreoffice-writer libreoffice-calc libreoffice-impress
command -v soffice        # 通常是 /usr/bin/soffice
```

```bash
# CentOS / RHEL
sudo yum install -y libreoffice libreoffice-headless libreoffice-writer libreoffice-calc libreoffice-impress
```

装好后把 `SOFFICE_PATH` 填进去并重启进程。第一次转换会在
`$STORAGE_ROOT/.office-cache` 下建目录，`www` 用户必须有写权限。

---

## 7. 安装依赖、迁移、构建、初始化管理员

**全部命令以 `www` 用户、在 `/opt/medihub` 下执行**（用 root 装出来的 `node_modules` 与 dist
会让 www 用户无法读取，是后面「502 / 权限」故障的常见原因）。

```bash
cd /opt/medihub

# 1) 安装依赖（锁文件存在时必须用 frozen-lockfile）
sudo -u www -H pnpm install --frozen-lockfile

# 2) 应用数据库迁移（幂等，可重复执行）
sudo -u www -H pnpm db:migrate

# 3) 构建：web（Vite）→ server（vp pack + 复制 SPA）
#    根 build = `vp run --filter @medihub/web build && vp run --filter @medihub/server build`
#    packages/* 没有独立的 build 脚本，它们以源码形式被打进 web / server 两个产物
#    服务端的 build 末尾会自动把 apps/web/dist 复制到 apps/server/dist/public
sudo -u www -H pnpm build

# 4) 验证静态产物已就位（构建脚本会打印 "SPA 已复制到 dist/public"）
ls -l /opt/medihub/apps/server/dist/public/index.html
```

### 7.1 SPA 静态产物由构建自动复制

`apps/server/src/index.ts` 只在 `dist/public` **存在**时才挂载静态服务：

```ts
const publicDir = fileURLToPath(new URL("public", import.meta.url));
if (existsSync(publicDir)) {
  app
    .use(serveStatic({ root: publicDir }))
    .get("*", serveStatic({ root: publicDir, path: "index.html" }));
}
```

这条路径由构建链保证，**不需要手工 `rsync`**：

| 环节           | 定义                                                                          | 作用                                                                                             |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 根 `build`     | `vp run --filter @medihub/web build && vp run --filter @medihub/server build` | 串行执行，**先 web 后 server**，保证复制时源产物已存在                                           |
| 服务端 `build` | `vp pack && node scripts/copy-spa.mjs`                                        | `vp pack` 出 `dist/index.mjs`，随后脚本把 `apps/web/dist` 整目录复制到 `apps/server/dist/public` |
| 复制脚本       | `apps/server/scripts/copy-spa.mjs`                                            | 先 `rm -rf dist/public` 再 `cp -r`，避免上一版的哈希文件名残留                                   |

验证方式（构建完立刻可以看）：

```bash
ls -l /opt/medihub/apps/server/dist/public/index.html
# 再确认 SPA 与 API 都通
curl -s -o /dev/null -w 'root=%{http_code} ' http://127.0.0.1:3000/
curl -s -o /dev/null -w 'spa=%{http_code}\n' http://127.0.0.1:3000/patients
```

> **如果你改过构建流程，要重新确认这一条**：
>
> - 单独执行 `pnpm --filter @medihub/server build` 而 web 还没构建时，`copy-spa.mjs`
>   会直接抛错「找不到前端构建产物 …，请先执行 pnpm --filter @medihub/web build」——
>   这是预期的保护，不是 bug；
> - 换用别的打包方式（自定义 Dockerfile、CI 里只跑 `vp pack`）时，记得仍然产出
>   `apps/server/dist/public`，否则 `:3000` 上只有 API，访问 `/` 会 404。

### 7.2 初始化管理员与演示数据（可选）

```bash
# 只写演示科室/患者/素材，不改已有数据；已存在患者时会跳过并打印账号。
# 根脚本：pnpm seed = vp run --filter @medihub/server seed
sudo -u www -H pnpm seed
```

产物与账号：

| 账号                                           | 密码                                        | 角色         |
| ---------------------------------------------- | ------------------------------------------- | ------------ |
| `SEED_ROOT_EMAIL`（默认 `root@medihub.local`） | `SEED_ROOT_PASSWORD`（默认 `Medihub@2026`） | `root`       |
| `admin@medihub.local`                          | `Medihub@2026`                              | `dept_admin` |
| `doctor@medihub.local`                         | `Medihub@2026`                              | `member`     |

> 生产环境建议：`SEED_ROOT_PASSWORD` 一定要改；seed 完把 `SEED_ROOT_EMAIL` /
> `SEED_ROOT_PASSWORD` 从 `.env` 删掉（seed 本身会先跑迁移，不会重复插数据）。

### 7.3 启动前自检

```bash
# 手工前台起一次，确认能监听并且 SPA 能返回
cd /opt/medihub/apps/server
sudo -u www -H /opt/node24/bin/node --env-file-if-exists=.env dist/index.mjs
# 另开一个终端：
curl -I http://127.0.0.1:3000/          # 期望 200 + text/html
curl -s http://127.0.0.1:3000/api | head # OpenAPI 首页
```

确认无误后 `Ctrl+C` 停掉，交给进程守护。

---

## 8. 进程守护（两套方案）

**只能选一套**。两套同时跑会启两个进程连同一个 SQLite 文件，直接踩 `SQLITE_BUSY`。

### 方案 A：1Panel「工具箱 → Supervisor」

**界面：工具箱 → Supervisor**（v1：`主机 → 进程守护`）。

首次使用：

1. 面板未装 supervisor 时会提示安装。Ubuntu/Debian：
   ```bash
   sudo apt-get install -y supervisor
   ```
   CentOS/RHEL：
   ```bash
   sudo yum install -y epel-release && sudo yum install -y supervisor
   sudo systemctl enable --now supervisord
   ```
2. 点「初始化」，填写 supervisor 主配置文件路径（Debian/Ubuntu 默认
   `/etc/supervisor/supervisord.conf`，CentOS 默认 `/etc/supervisord.conf`）与服务名 `supervisor`。
   初始化过一次即可；之后改过路径可在设置页重新初始化。

创建守护进程，字段如下：

| 字段       | 值                                                              |
| ---------- | --------------------------------------------------------------- |
| 名称       | `medihub`                                                       |
| 运行目录   | `/opt/medihub/apps/server`                                      |
| 启动命令   | `/opt/node24/bin/node --env-file-if-exists=.env dist/index.mjs` |
| 运行用户   | `www`                                                           |
| 进程数     | `1`（**不要多实例**）                                           |
| 自动重启   | 开启                                                            |
| 启动优先级 | `999`                                                           |

「启动命令」也可以写成面板里更常见的 pnpm 形式，二者等价：

```bash
/opt/node24/bin/pnpm --filter @medihub/server start
```

但 pnpm 形式会多一层进程，且 pnpm 的 stdout 会包一层前缀，日志不如直接跑 node 干净。
**推荐直接跑 node**，因为 `apps/server/package.json` 的 `start` 脚本本来就只有这一条：
`node --env-file-if-exists=.env dist/index.mjs`。

如果把 1Panel 的 Supervisor 页面换成手写配置文件，等价片段是：

```ini
; /etc/supervisor/conf.d/medihub.conf
[program:medihub]
directory=/opt/medihub/apps/server
command=/opt/node24/bin/node --env-file-if-exists=.env dist/index.mjs
user=www
autostart=true
autorestart=true
startsecs=5
startretries=10
stopasgroup=true
killasgroup=true
stopsignal=TERM
stopwaitsecs=15
redirect_stderr=true
stdout_logfile=/www/wwwlogs/medihub-server.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=5
environment=TZ="Asia/Shanghai",NODE_ENV="production"
```

```bash
sudo supervisorctl reread && sudo supervisorctl update
sudo supervisorctl status medihub
```

> `stopasgroup/killasgroup` + `TERM` 很重要：`src/index.ts` 捕获 `SIGINT/SIGTERM` 后关服务、
> 关 SQLite 连接；被 `SIGKILL` 硬杀会留下 `-wal` 碎片。

### 方案 B：pm2

装 pm2（装到 Node 24 下，不要装到系统旧版本）：

```bash
sudo /opt/node24/bin/npm i -g pm2
ln -sfn /opt/node24/bin/pm2 /usr/local/bin/pm2
pm2 -v
```

`/opt/medihub/ecosystem.config.cjs` 全文：

```js
// /opt/medihub/ecosystem.config.cjs
// 注意：仓库 package.json 是 "type": "module"，所以这里必须用 .cjs 后缀，
// 否则 pm2 按 ESM 加载会报 "exports is not defined"。
const path = require("node:path");

const APP_DIR = "/opt/medihub/apps/server";
const LOG_DIR = "/www/wwwlogs";

module.exports = {
  apps: [
    {
      name: "medihub",
      // 与 apps/server/package.json 的 start 脚本一致：node --env-file-if-exists=.env dist/index.mjs
      script: "dist/index.mjs",
      // node 可执行文件与 --env-file-if-exists 都放在 node_args 里
      interpreter: "/opt/node24/bin/node",
      node_args: "--env-file-if-exists=.env",
      cwd: APP_DIR,
      // 单进程：SQLite 单写者，禁止 cluster
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "20s",
      restart_delay: 3000,
      // 超过 1G 常驻内存重启，防内存泄漏拖死机器
      max_memory_restart: "1G",
      // 让进程优雅退出（server 会捕获 SIGTERM 关库）
      kill_timeout: 15000,
      wait_ready: false,
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Shanghai",
        PORT: "3000",
      },
      out_file: path.join(LOG_DIR, "medihub-out.log"),
      error_file: path.join(LOG_DIR, "medihub-error.log"),
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // 不要在 pm2 里重复声明 .env：交给 --env-file-if-exists=.env 读，
      // 保持与 pnpm start 完全同一条代码路径。
    },
  ],
};
```

```bash
# 启动
sudo -u www -H pm2 start /opt/medihub/ecosystem.config.cjs

# 开机自启（会打印一条 sudo env PATH=... pm2 startup systemd -u www --hp /home/www 的命令，
# 把它原样复制执行；再用 pm2 save 固化进程列表）
sudo -u www -H pm2 startup systemd -u www --hp /home/www
sudo -u www -H pm2 save

# 日常
sudo -u www -H pm2 status
sudo -u www -H pm2 logs medihub --lines 200
sudo -u www -H pm2 restart medihub
```

> pm2 的 `pm2 startup` 默认按**执行它的用户**生成 systemd 单元。上面统一用 `www`，
> 否则开机后 pm2 以 root 启动、进程写 `/data/medihub` 时权限错乱。
> 若 `www` 没有 home 目录，改成 `--hp /opt/medihub`。

### 方案 A 与 B 的取舍

|                  | Supervisor（1Panel 工具箱） | pm2                              |
| ---------------- | --------------------------- | -------------------------------- |
| 是否要额外装软件 | 面板可代装                  | 需要 npm 全局装                  |
| 面板内可见性     | 有独立页面、日志按钮        | 只能看命令输出                   |
| 日志切割         | 靠配置文件                  | 内置                             |
| 集群             | 不做                        | 有，但**本项目禁止使用**         |
| 适合             | 希望全在面板里管            | 熟悉 pm2、想统一管多个 Node 应用 |

---

## 9. Nginx 反向代理

### 9.1 在 1Panel 建站

**界面：网站 → 网站 → 创建网站**（v1：`网站 → 创建网站`）。

| 字段     | 值                                                                        |
| -------- | ------------------------------------------------------------------------- |
| 类型     | 反向代理（部分版本在「运行环境/其他」里选，创建后在站点设置里配代理亦可） |
| 域名     | `medihub.summerecho.cn`                                                   |
| 代理地址 | `http://127.0.0.1:3000`                                                   |
| 备注     | MediHub 生产站                                                            |

创建后进入该站点的「设置 / 配置」页，里面有 **反向代理**、**HTTPS**、**真实 IP** 等分页。
（1Panel v2 把这几项收在站点设置的基本设置里；不同版本可能在「网站 → 反向代理」或
「应用」下，以面板显示为准。）

代理目标填 `http://127.0.0.1:3000`，发送域名填 `$host`。

### 9.2 必须补的指令

面板的默认反代模板不够用，必须补下面这些。**界面：网站 → 网站 → 目标站点 → 配置文件**
（有的版本叫「配置修改」，位置在站点右上角菜单或「其他设置」里；也可以直接编辑面板生成的
`conf.d/<域名>.conf`，路径以面板显示的为准）。

```nginx
server {
    listen 80;
    # 【1Panel 自动生成】域名与证书跳转相关配置，保持原样
    server_name medihub.summerecho.cn;

    # =====【手动补充 1】上传大小 =====
    # 应用层上限是 UPLOAD_MAX_BYTES（默认 256 MB）。这里给 300m 留出 multipart
    # 头与多文件表单的余量；两者不匹配时客户端会先看到 413。
    client_max_body_size 300m;

    # 大文件（视频、ZIP）无需 Nginx 先落盘再转发，降低磁盘抖动
    proxy_request_buffering off;

    location / {
        # 【1Panel 自动生成】proxy_pass http://127.0.0.1:3000; 保持原样
        proxy_pass http://127.0.0.1:3000;

        # =====【手动补充 2】请求头 =====
        # Host：Better Auth 用 Origin/Referer 与 BETTER_AUTH_URL 比对；
        # 后端生成的链接也依赖正确的 Host。
        proxy_set_header Host $host;

        # 真实客户端 IP。
        proxy_set_header X-Real-IP $remote_addr;

        # 关键：用单值 $remote_addr，不要用 $proxy_add_x_forwarded_for。
        # Better Auth 1.7 的 getIP 在未配置 advanced.ipAddress.trustedProxies 时
        # 只接受「单值」的 x-forwarded-for；多值会被判为不可信而返回 null，
        # 于是所有用户共用同一个限流桶。$proxy_add_x_forwarded_for 会把客户端
        # 自带的 XFF 拼在前面，正好造成多值。
        proxy_set_header X-Forwarded-For $remote_addr;

        # 告诉后端外部是 https。Better Auth 的 secure cookie / 生成的绝对 URL
        # 都依赖它；缺了会退化成 http，登录后立刻掉登录态。
        proxy_set_header X-Forwarded-Proto $scheme;

        # =====【手动补充 3】超时与协议 =====
        proxy_http_version 1.1;
        # 本项目没有 WebSocket；清空 Connection 只是避免 keep-alive 头被透传到上游。
        proxy_set_header Connection "";

        # 大文件上传、LibreOffice 首次转 PDF、导出 ZIP 都可能超过默认 60s。
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 15s;

        # PDF/视频下载逐块回传，避免 Nginx 缓存整个大文件到临时目录
        proxy_buffering off;
    }

    # 静态资源（哈希文件名）单独放长缓存，只影响浏览器，不影响后端
    location /assets/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 9.3 每条指令为什么必须有

| 指令                                            | 为什么                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `client_max_body_size 300m`                     | 素材是伤口照片、术中视频、培训 PPT，默认 1 MB 会直接把上传打断成 413。300m 对齐 256 MB 应用上限留余量                       |
| `proxy_set_header Host $host`                   | Better Auth 的 Origin 校验与后端生成的绝对 URL 都以外部域名为准；`localhost:3000` 会让校验失败                              |
| `proxy_set_header X-Real-IP $remote_addr`       | 日志与审计需要真实来源；也是排查「谁在刷登录」的唯一线索                                                                    |
| `proxy_set_header X-Forwarded-For $remote_addr` | Better Auth **按客户端 IP 限流**（生产默认开启，window 10s / max 100）。多值 XFF 会被判不可信，导致全员共享一个桶           |
| `proxy_set_header X-Forwarded-Proto $scheme`    | 不传，后端认为自己在 http 上，绝对 URL 会写成 `http://`，浏览器按 https 页面加载即被判混合内容；Cookie 的 Secure 判断也会错 |
| `proxy_http_version 1.1`                        | 默认 1.0 不支持 keep-alive，大文件分块与流式下载会反复建连                                                                  |
| `proxy_read_timeout 300s`                       | 首次 `soffice` 转 PDF、导出 ZIP、256 MB 上传都可能超过 60s 默认值，否则 504                                                 |
| `proxy_buffering off`                           | 视频 Range 播放与 PDF 内联预览要求边读边发                                                                                  |

**要不要转发 WebSocket？** 不需要。本项目没有 WebSocket 端点：会话走 Cookie + HTTP，
`/rpc` 是普通 POST，OnlyOffice 的编辑器 WebSocket 连的是 Office 自己的域名，不经过本站。
`proxy_http_version 1.1;` + `proxy_set_header Connection "";` 只是保持长连接语义，无副作用。

**要不要给静态资源单独开 location？** 生产环境服务端自己托管 SPA，`/`、`/assets/*`、`/p/*`
全部由 3000 返回。上面 `/assets/` 段落只加浏览器缓存头，仍然是反代到 3000，没有另开目录。
如果你把 SPA 改成由 Nginx 直接从 `apps/server/dist/public` 读文件，那要自己补 SPA 回落
（`try_files $uri $uri/ /index.html;`），两条路选一条，别混用。

### 9.4 生效

优先在面板里点站点的「保存 / 重载」，它会调 1Panel 自己的 OpenResty，路径与 systemd 服务名都由
面板管理。要在命令行验证时，用面板实际使用的 OpenResty 可执行文件（**不要**用系统里另装的
`nginx`，那测的是另一份配置）：

```bash
# 1Panel 的 OpenResty 一般在 /opt/1panel/apps/openresty/ 下，实际路径以面板「网站 → OpenResty 设置」
# 或面板生成的配置为准。举例：
OPENRESTY_BIN=/opt/1panel/apps/openresty/openresty/bin/openresty
sudo "$OPENRESTY_BIN" -t && sudo "$OPENRESTY_BIN" -s reload
# 找不到可执行文件就直接用面板的「保存 / 重载」按钮，别去装第二个 nginx。
```

---

## 10. HTTPS 与强制跳转

### 10.1 申请 Let's Encrypt 证书

**界面：网站 → SSL 证书 → 申请证书**（v1：`网站 → SSL → 申请证书`）。

| 字段     | 值                                                        |
| -------- | --------------------------------------------------------- |
| 类型     | Let's Encrypt                                             |
| 域名     | `medihub.summerecho.cn`                                   |
| 验证方式 | HTTP 校验（需要 80 端口对公网可达，且该域名已解析到本机） |
| 自动续签 | 开启（1Panel 会建计划任务）                               |

> DNS 未生效、80 被占用、安全组没放行，是 HTTP-01 校验失败的全部常见原因。
> 内网无法校验时改用 DNS 校验（1Panel 支持 DNS 账号）。

### 10.2 在站点启用 HTTPS

回到站点 **设置 → HTTPS**：

- HTTP 选项：**自动跳转 HTTPS**（等价于 301 到 https，同时保留 Let's Encrypt 续签所需的 80 校验路径）
- 证书：选择刚申请的证书
- HSTS：可选，确认全站 https 后再开
- 协议版本：TLSv1.2 / TLSv1.3

### 10.3 改 `BETTER_AUTH_URL` 并重启

```bash
sudo -u www -H sed -i 's|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL="https://medihub.summerecho.cn"|' \
  /opt/medihub/apps/server/.env
sudo grep BETTER_AUTH_URL /opt/medihub/apps/server/.env

# Supervisor
sudo supervisorctl restart medihub
# 或 pm2
sudo -u www -H pm2 restart medihub
```

**顺序不能反**：先有可用的 https，再把 `BETTER_AUTH_URL` 改成 https。反过来会得到
「页面能打开、一登录就 403」。

### 10.4 混合内容

站点一旦是 `https://`，浏览器会拦掉页面上所有 `http://` 资源：

- OnlyOffice 若不是 https，编辑器 iframe 会被直接拦，控制台报
  `Mixed Content: ... was loaded over HTTPS, but requested an insecure frame`；
- 因此 `ONLYOFFICE_URL` 必须是**带证书的 https 地址**，详见
  [ONLYOFFICE.md](./ONLYOFFICE.md#7-反向代理到-httpsofficeexamplecom)。

---

## 11. 防火墙

**界面：主机 → 防火墙**（v1：`主机 → 防火墙`）。

| 端口     | 策略                      | 说明                      |
| -------- | ------------------------- | ------------------------- |
| 22       | 放行（建议限制来源 IP）   | SSH                       |
| 80       | 放行                      | HTTP 跳转 + Let's Encrypt |
| 443      | 放行                      | 站点                      |
| 面板端口 | 放行，**建议限制来源 IP** | 1Panel                    |
| 3000     | **不放行**                | 只允许 127.0.0.1 访问     |

界面之外的双保险（`ufw` 与面板防火墙会互相影响，二者选一处管理；面板已接管时不要重复开 ufw）：

```bash
# 若用 ufw
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw status verbose
```

> MediHub 的 Hono server 监听的是所有网卡（`serve({ port })` 未绑定 `hostname`），
> 所以 **3000 的暴露面完全由防火墙决定**。云厂商安全组同样要挡住 3000。
> 验证一下：`curl -m 3 http://<公网IP>:3000/` 应当超时或拒绝。

**CentOS / RHEL 差异**：

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
# SELinux：允许外连与监听（默认 httpd_t 允许，但反向代理到 3000 需放行）
sudo setsebool -P httpd_can_network_connect 1
```

---

## 12. 备份与恢复

### 12.1 备份什么

| 对象   | 路径                                       | 说明                                                                   |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------- |
| 数据库 | `/data/medihub/local.db`                   | WAL 模式，**必须带上 `-wal` / `-shm` 或用 `.backup` 才能拿到一致快照** |
| 素材   | `$STORAGE_ROOT`（`/data/medihub/storage`） | 本地驱动的原始文件与 `.office-cache` 转换缓存                          |
| 密钥   | `apps/server/.env`                         | `BETTER_AUTH_SECRET` 丢了，存储配置就解不开                            |

### 12.2 备份脚本

`/opt/medihub/scripts/backup.sh`（新建脚本目录，属于运维产物，不进版本库）：

```bash
#!/usr/bin/env bash
# MediHub 备份：SQLite 在线备份 + 素材目录打包，保留 7 天
set -euo pipefail

APP_DIR="/opt/medihub"
DB_FILE="/data/medihub/local.db"
STORAGE_DIR="/data/medihub/storage"
ENV_FILE="$APP_DIR/apps/server/.env"
DEST="/www/backup/medihub"
KEEP_DAYS=7

STAMP="$(date +%F-%H%M)"
mkdir -p "$DEST"

# 1) 数据库：sqlite3 .backup 是唯一能在线拿到一致快照的办法。
#    它会把 WAL 里的内容合并进输出文件，恢复时不需要 -wal/-shm。
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".backup '$DEST/local-$STAMP.db'"
else
  # 没装 sqlite3 的退路：连 -wal/-shm 一起打包。
  # 但必须停服或用 .backup，直接 tar 一个活跃的库可能拿到撕裂的快照。
  tar -czf "$DEST/local-$STAMP.tar.gz" \
    -C "$(dirname "$DB_FILE")" "$(basename "$DB_FILE")" \
    "$(basename "$DB_FILE")-wal" "$(basename "$DB_FILE")-shm" 2>/dev/null \
    || tar -czf "$DEST/local-$STAMP.tar.gz" -C "$(dirname "$DB_FILE")" "$(basename "$DB_FILE")"
fi

# 2) 素材目录（排除转换缓存，随时可重建）
tar -czf "$DEST/storage-$STAMP.tar.gz" \
  --exclude='.office-cache' \
  -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"

# 3) 配置与密钥
tar -czf "$DEST/env-$STAMP.tar.gz" -C "$(dirname "$ENV_FILE")" "$(basename "$ENV_FILE")"

# 4) 只留最近 7 天
find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete

echo "[$(date '+%F %T')] backup ok -> $DEST (stamp=$STAMP)"
```

```bash
sudo -u www -H mkdir -p /opt/medihub/scripts
# 用编辑器写入：把上面代码块里的内容整段放进这个文件
sudo -u www -H vi /opt/medihub/scripts/backup.sh
# 也可以走面板：主机 → 文件，定位到 /opt/medihub/scripts/backup.sh 直接编辑
sudo -u www -H chmod +x /opt/medihub/scripts/backup.sh

# 手工跑一次，确认三个产物都在
sudo -u www -H /opt/medihub/scripts/backup.sh
ls -lh /www/backup/medihub/
```

**注意点**：

- `sqlite3` 需要 `apt-get install -y sqlite3`；
- 脚本以 `www` 运行，`/www/backup/medihub` 的属主必须是 `www`；
- 磁盘上要留出「素材总量 × 1 + 7 天增量」的空间，否则备份会撑满磁盘（见 §15）；
- 建议再加一层：1Panel **计划任务 → 备份账号** 把 `/www/backup/medihub` 同步到对象存储，避免整机损坏。

### 12.3 挂到 1Panel 计划任务

**界面：计划任务 → 创建计划任务**（v1：`主机 → 计划任务`）。

| 字段     | 值                                                                    |
| -------- | --------------------------------------------------------------------- |
| 任务类型 | Shell 脚本                                                            |
| 名称     | `medihub-backup`                                                      |
| 执行周期 | 自定义 cron：`0 3 * * *`（每天 03:00）                                |
| 脚本内容 | `bash /opt/medihub/scripts/backup.sh`                                 |
| 执行用户 | `www`（面板若无此选项，脚本内部已用绝对路径，注意备份目录属主为 www） |

cron 对照：

| 表达式        | 含义                     |
| ------------- | ------------------------ |
| `0 3 * * *`   | 每天 03:00（推荐）       |
| `0 */6 * * *` | 每 6 小时                |
| `30 2 * * *`  | 每天 02:30，错开其他任务 |

先在面板里点「执行」跑一次，看「执行记录」里是否 `exit 0`，再等定时。

### 12.4 恢复步骤

```bash
# 0) 停服务（先停，避免覆盖正在写的库）
sudo supervisorctl stop medihub       # 或 sudo -u www -H pm2 stop medihub

# 1) 把现有数据库三件套改名保留（只 mv .db 会把 -wal 留在原地，容易污染新库）
sudo mkdir -p /data/medihub/broken-$(date +%s)
BROKEN=$(ls -dt /data/medihub/broken-* | head -1)
sudo mv /data/medihub/local.db /data/medihub/local.db-wal /data/medihub/local.db-shm "$BROKEN"/ 2>/dev/null || true

# 2) 恢复数据库（用 .backup 产物时不需要 -wal/-shm，旧的 WAL 必须删掉）
sudo -u www -H cp /www/backup/medihub/local-2026-10-24-0300.db /data/medihub/local.db
sudo rm -f /data/medihub/local.db-wal /data/medihub/local.db-shm

# 3) 恢复素材（建议先把当前目录改名保留）
sudo mv /data/medihub/storage /data/medihub/storage.broken
sudo -u www -H tar -xzf /www/backup/medihub/storage-2026-10-24-0300.tar.gz -C /data/medihub

# 4) 恢复 .env（仅当密钥也丢了）
sudo -u www -H tar -xzf /www/backup/medihub/env-2026-10-24-0300.tar.gz -C /opt/medihub/apps/server
sudo chmod 600 /opt/medihub/apps/server/.env

# 5) 校正属主后启动
sudo chown -R www:www /data/medihub
sudo supervisorctl start medihub

# 6) 验证
curl -I https://medihub.summerecho.cn/
# 登录后随机点开一个素材，确认图片/文档能打开（说明 storageKey 与文件对得上）
```

> **恢复必须连同 `-wal` 一起处理**：如果你拿的是老式 `tar` 备份（含 `-wal`），解压后
> 三个文件要一起放回同一目录；只放 `.db` 会丢最近写入的事务。
> **只恢复 storage 里的文件名与 storageKey 是对应的**：素材行里存的是
> `storageTargetId + storageKey`，所以目录层级必须整体还原，不能只挑几个文件。

---

## 13. 升级与回滚

本节是**命令行手工流程**，适合改过配置、看过源码、或在线升级不可用时使用。

> 已经在跑稳定版本、只想换版本号？优先用内置的在线升级：
> **系统管理 → 版本与升级**（仅 root 可见），一键完成备份、构建、迁移、切换、重启与健康检查，
> 失败会自动回滚。配置与注意事项见 [UPGRADE.md](./UPGRADE.md)。
> 两种方式**不要混用**（在线升级只替换 `apps/server/dist`，不更新源码，见
> [UPGRADE.md §10.2](./UPGRADE.md#102-与手工升级流程的关系)）。

### 13.1 升级（标准流程）

```bash
cd /opt/medihub

# 0) 先备份，尤其是「本次升级带数据库迁移」时（看 packages/db/src/migrations 有无新目录）
sudo -u www -H /opt/medihub/scripts/backup.sh

# 1) 记录当前版本，回滚要用（用 www 执行，否则 git 会报 dubious ownership）
sudo -u www -H git rev-parse HEAD | sudo tee /tmp/medihub-prev-commit

# 2) 拉代码（只做快进合并，避免在服务器上产生 merge commit）
sudo -u www -H git fetch --all --tags
sudo -u www -H git pull --ff-only

# 3) 依赖（锁文件没变也要跑，pnpm 会做增量）
sudo -u www -H pnpm install --frozen-lockfile

# 4) 数据库迁移（幂等）
sudo -u www -H pnpm db:migrate

# 5) 构建（web → server，SPA 会自动复制到 apps/server/dist/public）
sudo -u www -H pnpm build

# 6) 确认静态产物是最新的（构建日志里应有 "SPA 已复制到 dist/public"）
ls -l apps/server/dist/public/index.html

# 7) 重启
sudo supervisorctl restart medihub
# 或 sudo -u www -H pm2 restart medihub

# 8) 冒烟
curl -fsS -o /dev/null -w '%{http_code}\n' https://medihub.summerecho.cn/
sudo supervisorctl tail -200 medihub   # pm2 方案改：sudo -u www -H pm2 logs medihub --lines 200
```

升级窗口建议放在非门诊时段。迁移是幂等的（`migrate` 会记录已应用的版本），
重复执行不会重复建表。

### 13.2 回滚

服务器上的这份 checkout 只用来跑服务，不允许有本地改动，所以回滚用 `reset --hard`
（比 `checkout` 干净：分支指针一起退，之后还要能再前进）。

```bash
cd /opt/medihub

# 0) 先确认没有本地改动；有的话先 stash 或丢弃
sudo -u www -H git status --short

# 1) 回到上一个 commit
PREV=$(sudo cat /tmp/medihub-prev-commit)
sudo -u www -H git reset --hard "$PREV"

# 2) 用回旧依赖与旧产物（build 会重新生成 web dist 并复制到 dist/public）
sudo -u www -H pnpm install --frozen-lockfile
sudo -u www -H pnpm build

# 3) 重启
sudo supervisorctl restart medihub        # 或 sudo -u www -H pm2 restart medihub
```

回滚后想再升到最新，直接走 §13.1 第 2 步的 `git pull --ff-only` 即可（分支指针已在原位，
快进会回到最新提交）。

### 13.3 数据库迁移不可逆时怎么办

Drizzle 的迁移是**单向**的：`packages/db/src/migrations` 里只有 `up`，没有 `down`。
所以：

1. **升级前必做备份**（§13.1 第 0 步）。这是唯一可靠的「down」。
2. 本次升级**新增了迁移目录**（`packages/db/src/migrations/<时间戳>_*/`）时，代码回滚后
   数据库仍停留在新 schema。多数「加表/加列」的迁移对旧代码无害，可以只回滚代码；
   但「删列/改类型/加 NOT NULL 约束」的迁移回滚后旧代码会直接报错。
3. 一旦新版本写入过数据，就不要用旧备份整库回滚（会丢新数据）。正确顺序是：
   - 先停服；
   - 按 §12.4 恢复到升级前的备份；
   - 再 `git reset --hard` 回旧 commit、`pnpm install --frozen-lockfile`、`pnpm build`、
     启动（`pnpm build` 会一并重建 SPA 产物）；
   - 明确告知用户「升级后至回滚前写入的数据已回滚」。
4. 如果新旧数据都要保留，找开发同学针对该迁移手写反向 SQL，**不要**在没有备份的情况下
   用 `drop table` / `alter table` 硬改生产库。

---

## 14. 上线验收清单

按顺序逐条打勾，任何一条不过都不要对外宣布上线。

- [ ] `curl -I https://medihub.summerecho.cn/` 返回 `200`、`content-type: text/html`
- [ ] 浏览器打开域名能到登录页；地址栏是小锁（证书有效）
- [ ] `http://` 访问自动 301 到 `https://`
- [ ] 用 `SEED_ROOT_EMAIL` 账号登录成功，刷新页面不掉登录态
- [ ] `ls -l apps/server/dist/public/index.html` 存在，且 `curl -I http://127.0.0.1:3000/` 是 `text/html`
- [ ] 从另一个域名/IP 访问时**登录**返回 403（说明 Origin 校验生效，不是失效）
- [ ] 用 `root` 账号在顶部「科室」下拉切换一次，列表数据随科室变化（验证 `x-org-scope` 被透传，见 §17）
- [ ] 上传一张 50 MB 以上的视频，进度条走完不报错（验证 `client_max_body_size`）
- [ ] 上传一个 260 MB 文件得到明确 `413`（验证应用层 `UPLOAD_MAX_BYTES` 生效）
- [ ] 打开一张图片、播放一段视频（拖动进度条，验证 Range）
- [ ] 打开 docx / xlsx 能预览；配了 `SOFFICE_PATH` 时 pptx 也能转 PDF
- [ ] 配了 OnlyOffice 时：能进在线编辑、改内容、保存，回列表后 `checksum` 变了
- [ ] 导出一个 ZIP 并下载成功
- [ ] 公开帖 `/p/<slug>` 在未登录窗口能打开（含配图）
- [ ] `df -h` 数据盘剩余 > 30%
- [ ] 计划任务手工执行一次 `exit 0`，备份文件大小合理
- [ ] `curl -m 3 http://<公网IP>:3000/` 超时（3000 没有暴露）
- [ ] `public` 产物存在：`ls -l apps/server/dist/public/index.html`；若开启在线升级，再确认
      `ls -l apps/server/dist/scripts/updater.mjs`（见 [UPGRADE.md §3.6](./UPGRADE.md#36-构建产物里带着执行器脚本)）
- [ ] 重启服务器后，站点与进程都自动恢复（`systemctl status supervisord` / `pm2 status`）

---

## 15. 故障排查

| 现象                                                                       | 根因                                                                                                             | 定位                                                                                                        | 处理                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录/注册返回 **403**，响应体含 `Invalid origin`                           | Better Auth 的 Origin 校验：请求的 `Origin` 不在 `trustedOrigins` 里                                             | 浏览器 F12 看请求头 `Origin`；对比 `.env` 的 `BETTER_AUTH_URL`                                              | 三者必须字面一致（协议 + 域名 + 端口，不带末尾斜杠）。常见错法：`BETTER_AUTH_URL` 还是 `http://...`、写的是内网 IP、写的是 `:5173`。备用域名/IP 加进 `BETTER_AUTH_TRUSTED_ORIGINS` 后重启                                                               |
| 换域名/加 IP 后仍 403，且日志没动静                                        | `BETTER_AUTH_TRUSTED_ORIGINS` 的值写错（变量已在 `env.ts` 里声明为可选的普通字符串，值本身不做校验，写错不报错） | `grep TRUSTED /opt/medihub/apps/server/.env`；确认是英文逗号、无空格、无引号嵌套                            | 修正后重启进程                                                                                                                                                                                                                                          |
| 上传 **413 Request Entity Too Large**                                      | Nginx `client_max_body_size` 太小                                                                                | 看响应头是 nginx 还是应用返回；应用返回的 body 是 JSON `文件超过上限 xxxMB`                                 | Nginx 侧调到 300m 并 reload；若 body 是 JSON，说明是应用层 `UPLOAD_MAX_BYTES` 太小，改 `.env` 后重启                                                                                                                                                    |
| 上传大文件卡住后 **502**                                                   | Nginx 把上游读超时当成网关错误；或进程被 OOM killer 杀掉                                                         | `dmesg -T \| grep -i -E 'oom\|killed'`；`supervisorctl status` 看进程是否重启过                             | 加内存或限制上传体积；`proxy_read_timeout 300s`；`free -h` 看 swap；必要时给 `pm2` 的 `max_memory_restart` 或机器加 swap                                                                                                                                |
| **`SQLITE_BUSY: database is locked`**                                      | 同一时刻有多个写者；或两个守护进程同时在跑；或长事务                                                             | `ps aux \| grep -E 'dist/index.mjs' \| grep -v grep` 数进程数                                               | 1）确保只跑一套守护（Supervisor **或** pm2，二选一）；2）`instances` 必须是 1，禁止 cluster；3）确认 `DATABASE_URL` 只有一处指向该文件（别让备份脚本的 tmp 副本在同目录被打开）；4）驱动已带 `timeout: 5000` 的忙等，偶发一次可忽略，持续报错必是双进程 |
| 数据库文件异常变大 / `-wal` 不收缩                                         | 长事务或进程被 `SIGKILL`                                                                                         | `ls -lh /data/medihub/local.db*`                                                                            | 停服后 `sqlite3 local.db "PRAGMA wal_checkpoint(TRUNCATE);"`；确保 stop 信号是 `TERM`（Supervisor 配 `stopsignal=TERM`、`killasgroup`，pm2 配 `kill_timeout`）                                                                                          |
| 图片/文档全 404，或 `/` 直接 404 但 `/api/health` 正常                     | `apps/server/dist/public` 不存在（只跑了 `vp pack`、或 web 没先构建、或自定义了构建流程）                        | `ls -l apps/server/dist/public/index.html`；构建日志里有没有 `SPA 已复制到 dist/public`                     | 在仓库根执行 `pnpm build`（根 build 会先 web 后 server，服务端 build 末尾自动复制），重启                                                                                                                                                               |
| 切换「科室」后数据没变                                                     | oRPC / 上传请求的 `x-org-scope` 请求头被中间层丢了                                                               | F12 Network 看该请求是否带 `x-org-scope`；对比响应内容                                                      | 见 [§17 科室作用域](#17-科室作用域x-org-scope运维须知)：Nginx 默认透传自定义头，但 CDN/WAF 或显式 `proxy_set_header` 白名单会吞掉                                                                                                                       |
| 页面能开，登录后立刻掉登录态                                               | Cookie 没被标记为 Secure，或 `X-Forwarded-Proto` 缺失导致后端以为是 http                                         | F12 → Application → Cookies，看 `Secure` 与 `SameSite`                                                      | 补 `proxy_set_header X-Forwarded-Proto $scheme;`，`BETTER_AUTH_URL` 用 https，清 cookie 重登                                                                                                                                                            |
| **OnlyOffice 混合内容**：编辑器区域空白，控制台 `Mixed Content`            | 主站 https，`ONLYOFFICE_URL` 是 http                                                                             | F12 Console 里的被拦 URL                                                                                    | 给 OnlyOffice 配 https 子域名（同证书体系），把 `ONLYOFFICE_URL` 改成 https，重启。详见 [ONLYOFFICE.md](./ONLYOFFICE.md#7-反向代理到-httpsofficeexamplecom)                                                                                             |
| 在线编辑能打开，保存后内容没变                                             | OnlyOffice 回调到不了主站（`callbackUrl` 是 `BETTER_AUTH_URL` + `/api/office/:id/callback`）                     | OnlyOffice 容器日志 `docker logs onlyoffice \| tail -100`；主站访问日志有没有 `POST /api/office/*/callback` | 保证 OnlyOffice 容器能访问 `BETTER_AUTH_URL`（DNS/出网）；跨机时不要用内网 IP 且未开 `ALLOW_PRIVATE_IP_ADDRESS`                                                                                                                                         |
| 时间显示差 8 小时                                                          | 进程或系统时区不是 `Asia/Shanghai`                                                                               | `date`；`curl -s https://medihub.summerecho.cn/api/...` 看返回时间戳                                        | `sudo timedatectl set-timezone Asia/Shanghai`；`.env` 加 `TZ="Asia/Shanghai"`；守护配置里也带上 `TZ`（Supervisor `environment=` / pm2 `env`）。注意：库里时间戳是毫秒整数，前端按浏览器时区渲染，**改系统时区不会改历史数据**，只影响新记录与服务端日志 |
| **磁盘满**：上传失败、SQLite 报 `disk I/O error`、备份脚本失败             | 素材/备份/日志把数据盘写满                                                                                       | `df -h`、`du -sh /data/medihub/* /www/backup/medihub /www/wwwlogs`                                          | 清理过期备份（脚本已保留 7 天）、清 `.office-cache`（可随时重建）、压缩旧日志。要把素材挪到更大的盘：停服 → `rsync` 目录 → 改 `.env` 的 `STORAGE_ROOT` → 启动（`storageKey` 不含根路径，换根目录不影响历史数据）                                        |
| 所有页面 **403/500**，日志里 `EACCES`                                      | 文件属主不是 `www`（用 root 跑过 install/build，或 `git pull` 用了 root）                                        | `ls -l apps/server/.env apps/server/dist`；`namei -l /data/medihub/storage`                                 | `chown -R www:www /opt/medihub /data/medihub /www/backup/medihub`；**之后所有命令都 `sudo -u www -H` 执行**。1Panel 的站点目录默认 `www:www`，不要混入 root 的产物                                                                                      |
| `SOFFICE` 转换报 501 / 转换失败                                            | 未配 `SOFFICE_PATH`，或 `$STORAGE_ROOT/.office-cache` 不可写                                                     | `curl -I .../api/office/<id>/pdf` 返回 501 就是没配                                                         | 装 LibreOffice、`.env` 填 `SOFFICE_PATH=/usr/bin/soffice`、`chown -R www:www` 缓存目录、重启。CentOS 上 SELinux 需 `setsebool -P httpd_can_network_connect 1`                                                                                           |
| CentOS 上写入 `/opt` 或 `/data` 被拒（`Permission denied` 但权限看着没错） | SELinux 上下文不对                                                                                               | `ls -Z /data/medihub`；`sudo ausearch -m avc -ts recent`                                                    | `sudo semanage fcontext -a -t httpd_sys_rw_content_t '/data/medihub(/.*)?'` + `sudo restorecon -Rv /data/medihub`；或 `sudo chcon -R -t httpd_sys_rw_content_t /data/medihub`。不要用 `setenforce 0` 一关了之                                           |
| `EADDRINUSE :3000`                                                         | 手工前台起过一次没停，或两套守护同时在跑                                                                         | `ss -lntp \| grep :3000`                                                                                    | 杀掉多余进程，只保留一套守护                                                                                                                                                                                                                            |
| 反复被限流 `429 Too Many Requests`                                         | Better Auth 生产默认按 IP 限流（10s/100 次）；反代没传可信 XFF 时所有用户共享一个桶                              | 主站日志里会有「Rate limiting could not determine a client IP」告警                                         | 确认 Nginx 用 `proxy_set_header X-Forwarded-For $remote_addr;`（**单值**）；若有多级代理，需在 `packages/auth` 配 `advanced.ipAddress.trustedProxies` + 多值 XFF（见 §16）                                                                              |
| `git pull` 报 `dubious ownership`                                          | 仓库属主与执行用户不一致                                                                                         | `sudo -u www -H git -C /opt/medihub status`                                                                 | `sudo chown -R www:www /opt/medihub`，别用 `git config --global --add safe.directory` 绕过                                                                                                                                                              |

---

## 16. 附录：与仓库现状的已知差异

这里只保留**至今仍然存在**、且运维必须知道的差异。曾经列在这里的两条已经在仓库修好，
不再需要人工兜底：

- 构建已自动把 `apps/web/dist` 复制到 `apps/server/dist/public`（见 §7.1），不需要手工 `rsync`；
- 根 `package.json` 已提供 `check` / `test` / `seed` 脚本（见下方命令表），`pnpm test`、`pnpm seed` 可正常执行。

> 构建链与脚本随时可能再变。升级到新版本后，花 30 秒核对 §14 里
> 「`ls -l apps/server/dist/public/index.html` 存在」那一条，比事后排查 404 便宜得多。

### 16.1 根脚本与真实定义

| 命令               | 实际定义                                                                      |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`         | `vp run -r --parallel dev`                                                    |
| `pnpm build`       | `vp run --filter @medihub/web build && vp run --filter @medihub/server build` |
| `pnpm check`       | `vp check`                                                                    |
| `pnpm test`        | `vp test`（unit + integration 两个 project）                                  |
| `pnpm test:e2e`    | `vp run --filter @medihub/web test:e2e`                                       |
| `pnpm seed`        | `vp run --filter @medihub/server seed`                                        |
| `pnpm run ready`   | `vp check && vp run knip && vp test && vp run test:e2e && vp run build`       |
| `pnpm db:generate` | `vp run --filter @medihub/db db:generate`                                     |
| `pnpm db:migrate`  | `vp run --filter @medihub/server db:migrate`                                  |
| `pnpm db:studio`   | `vp run --filter @medihub/db db:studio`                                       |

生产部署只需要 `install` / `db:migrate` / `build`；`check`、`test`、`test:e2e` 在本地或 CI 跑。

### 16.2 `advanced.ipAddress` 没有配置（当前版本行为）

`packages/auth/src/index.ts` 只设置了 `trustedOrigins`，没有 `advanced.ipAddress`。
`better-auth@1.7` 的 `getIP` 默认读 `x-forwarded-for`，且在未配置 `trustedProxies` 时
**只接受单值**；多值直接返回 `null`，落到「所有请求共用一个每路径限流桶」。这就是 §9.2
坚持用 `$remote_addr`（单值）而不是 `$proxy_add_x_forwarded_for` 的原因。

多级代理 / 需要真实 IP 时，正确做法是在 `packages/auth` 里加：

```ts
advanced: {
  ipAddress: {
    ipAddressHeaders: ["x-forwarded-for"],
    trustedProxies: ["127.0.0.1", "::1", "10.0.0.0/8"],
  },
},
```

改完 Nginx 才可以用 `$proxy_add_x_forwarded_for`。

### 16.3 `BETTER_AUTH_TRUSTED_ORIGINS` 只是字符串

它已在 `apps/server/src/env.ts` 的 Zod schema 里声明（`z.string().optional()`），
但**值本身不做格式校验**：写成中文逗号、留空格、带多余引号都不会在启动时报错，
只会在某个来源登录时表现为 403。改完务必按 §6.2 手工核对一遍。

### 16.4 生产进程不要包一层 shell

`apps/server` 的 `start` 只有 `node --env-file-if-exists=.env dist/index.mjs` 一条。
Supervisor / pm2 里如果再套 `bash -c "cd ... && node ..."`，停止信号会落在 bash 上，
node 收不到 `SIGTERM` 就不会执行 `src/index.ts` 里的关库逻辑，容易在 `local.db` 旁留下
未合并的 `-wal`。要么像 §8 的方案 A 直接 `command=` 指到 node，要么像方案 B 用
pm2 的 `script` + `node_args` + `cwd` 三件套。

---

## 17. 科室作用域（`x-org-scope`）运维须知

新版本的权限模型里，`root`（超级管理员）**可以不归属任何科室**，作为全局管理员跨科室查看。
「当前在看哪个科室」不是服务端会话状态，而是**每个请求带一个自定义请求头**——所以反向代理
必须原样透传它。

### 17.1 机制

| 环节   | 行为                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| 入口   | 顶部栏的「科室」下拉（`OrgScopeSelect`），只对 `root` 显示；候选项是 `kind = department` 的科室（个人空间不在列表里） |
| 存储   | 前端把选中的科室 id 存进 `localStorage`，键名 `medihub:org-scope`；空值表示「未指定」                                 |
| 传输   | 所有 oRPC 请求（`/rpc`、`/api`）与上传请求（`POST /api/files/upload`）都带 `x-org-scope: <orgId>`                     |
| 服务端 | `apps/server/src/orpc.ts` 把该头读进 oRPC context 的 `scopeOrganizationId`；上传接口单独读一次                        |
| 边界   | **只有 `root` 的头生效**，普通账号的这个头会被忽略，服务端仍按自己的科室鉴权——它不是越权入口                          |
| 回落   | 没有该头（或值无效）时，服务端回落到「第一个科室 / 自己的科室」                                                       |
| 切换时 | 前端会取消并重置已挂载的查询、`router.invalidate()` 重新取数，所以正常表现是「立刻换数据」                            |

### 17.2 反向代理必须透传

Nginx / OpenResty **默认会把客户端发来的、自己没显式设置的头原样转发**，本项目的 `x-org-scope`
属于这一类，正常不需要额外配置。会在链路上把它吞掉的是：

| 中间层                                      | 风险                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CDN / WAF（Cloudflare、阿里云 WAF、雷池等） | 多数产品有「允许的自定义请求头」白名单，未放行时头会在到达源站前被剥离                                                             |
| 显式 `proxy_set_header` 白名单习惯          | `proxy_set_header` 是「设置」不是白名单，但有人会写成 `proxy_set_header X-Org-Scope "";` 或只逐条列举要转发的头，从而覆盖/丢掉原值 |
| 7 层负载均衡 / API 网关                     | 部分网关会丢弃未在路由中声明的自定义头                                                                                             |

Nginx 侧**不需要**为它加任何指令；只在你有 CDN/WAF 时，把 `x-org-scope` 加进放行清单。
如果想显式声明（等价于默认行为，便于自证）：

```nginx
# 可选：显式透传，值取自客户端。写不写效果相同，写了便于 code review 时确认没被漏掉。
proxy_set_header x-org-scope $http_x_org_scope;
```

> 顺带一条相邻的坑：Nginx 默认**丢弃名字里带下划线**的请求头（`underscores_in_headers off`）。
> 本项目的 `x-org-scope` 用连字符，不受影响；将来若有人改成 `x_org_scope`，会静默失效。

### 17.3 排查：切换科室后数据看起来没变

按这个顺序查，别先怀疑业务逻辑：

1. **浏览器**：F12 → Network，找切换后触发的那个 `/rpc/...` 请求，看请求头里有没有
   `x-org-scope`、值是不是你选的科室 id。
   - 没有该头 → 前端没选上（先确认当前账号确实是 `root`，非 root 不显示切换器）；
   - 有该头但值不对 → 清掉浏览器 `localStorage` 里的 `medihub:org-scope` 重进。
2. **中间层**：用 F12 里「Copy as cURL」把同一个请求复制出来，分别打域名与直连
   `http://127.0.0.1:3000`。带域名丢头、直连不丢 → 就是 CDN/WAF/网关吞了，按 §17.2 放行。
3. **服务端**：确认该账号是 `root`。非 root 的这个头按设计会被忽略——这不是 bug。
4. **数据本身**：该科室里是否真的没有数据（换一个确定有素材的科室再试）。

---

## 相关文档

- [在线升级与回滚](./UPGRADE.md)
- [ONLYOFFICE 是否免费与接入方案](./ONLYOFFICE.md)
- [文档索引](./README.md)
