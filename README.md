# 医档通 MediHub

> 当前版本：**v1.1.0**（变更记录见 [CHANGELOG.md](CHANGELOG.md)）

科室内部的多媒体与病历资料管理平台。把患者的伤口/术中/术后照片、病历资料、科室培训与讲课材料集中存起来，按「患者 → 某次入院 → 时间线」组织，并为科研、宣传、病例汇报提供可筛选、可打包导出的数据底座。

## 在 1Panel 服务器上一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh -o install-medihub.sh
sudo bash install-medihub.sh --url https://你的域名 --seed
```

脚本会自动装 Node.js 24 / pnpm / systemd 服务、生成 `.env`（含随机密钥）、构建并启动，
OnlyOffice 参数可以稍后在 `.env` 里补。完整参数、常见问题与卸载见
[docs/INSTALL-1PANEL.md](docs/INSTALL-1PANEL.md)；想逐项控制部署过程见
[docs/DEPLOY-1PANEL.md](docs/DEPLOY-1PANEL.md)。

> **不带 `--seed` 也可以**：装完后打开 `https://你的域名/install`，在网页里填超级管理员
> （可选 OnlyOffice 参数），完成后自动跳转登录页。登录页在未初始化时也会显示「前往安装向导」。

> 演示数据与账号：执行 `pnpm seed` 后会写入「整形外科」与「烧伤科」两个科室、4 位演示患者
> （含分期照片与 Markdown 病历摘要）、两个资料库目录（含一份 docx 培训文档与一份 pptx 病例讨论）、
> 一个已发布的公开教学帖（`/p/flap-crisis-early-recognition`，含 B 站视频与配图）和一个草稿帖。
>
> | 账号                   | 密码           | 角色                                           |
> | ---------------------- | -------------- | ---------------------------------------------- |
> | `root@medihub.local`   | `Medihub@2026` | 超级管理员（不归属科室，用顶部切换器看各科室） |
> | `admin@medihub.local`  | `Medihub@2026` | 整形外科管理员                                 |
> | `doctor@medihub.local` | `Medihub@2026` | 整形外科成员                                   |
>
> 演示素材是程序生成的占位图，不是真实临床影像。

## 功能

| 模块       | 能力                                                                                                                                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 患者档案   | 患者基本信息（姓名/性别/出生日期/病案号/电话/身份证/诊断摘要/状态/标签），搜索、筛选、分页；**「谁的患者归谁」**：作者本人、**本科室**管理员与 root 可编辑，跨科室一律不存在；「查看完整档案」抽屉                                                                          |
| 就诊记录   | 每次入院/门诊/手术/随访一条记录（住院号、入院-出院时间、诊断、主诉、治疗、主治、科室、备注），附一份 Markdown **病历摘要**（长文可折叠），可一键打开「就诊全部资料」抽屉完整查看与编辑                                                                                      |
| 临床时间线 | 按拍摄日期分组的素材时间线，术前/术中/术后/随访/影像/病理分期，拖拽排序（桌面）、批量移动、元数据编辑；移动端为两列磁贴；图片支持**裁剪 / 旋转后另存为新素材，或覆盖原素材**                                                                                                |
| 资料库     | 按来源分类浏览：**患者记录 / 会议资料 / 资料库目录 / 教学附件 / 全部**，每类支持搜索、类型与分期筛选、网格/列表；科室文件夹可嵌套；成员可浏览下载本科室素材，只有上传者与管理员可以整理                                                                                     |
| 教学分享   | Markdown 撰写，插入本系统视频 / B 站视频 / 外链；发布后 `/p/<slug>` 网址或二维码分享。**阅读范围**五档：`任何人`（可再设访问密码）/ `全系统登录用户` / `仅科室内部` / `指定对象` / `仅自己`；**编辑权始终只归作者与管理员**                                                 |
| 学习会议   | 讲课/会议/培训/病例讨论归档，可挂载会议素材；本科室成员可见并下载，编辑权归创建者与管理员，会议本身也支持五档可见范围                                                                                                                                                       |
| 导出中心   | 按患者 / 就诊 / 会议 / 帖子 / 手动选择素材打包 ZIP（含 `README.md`、`manifest.json`、`data.csv` 与原始文件）                                                                                                                                                                |
| 权限与用户 | 四级角色 + 科室隔离 + 审计日志；**root 可以是不归属任何科室的全局管理员**，用顶部「科室」切换器查看各科室资料；科室管理员可创建成员账号，也可**认领已注册但未分配科室的用户**                                                                                               |
| 在线预览   | 图片（近全屏、缩放/旋转/平移）、视频（Range 流式播放）、PDF、docx、xlsx、Markdown/文本；移动端同样可预览，Office 在线编辑仅桌面端（OnlyOffice 手机端属企业版），移动端自动隐藏入口；docx/xlsx/在线编辑器按需懒加载（media 首包 −72%）；系统管理里有 Office 集成就绪状态卡片 |
| 存储后端   | 服务器本地磁盘 / NAS 挂载目录 / S3 兼容对象存储（MinIO、OSS、Ceph 等），可配置多个目标并指定默认                                                                                                                                                                            |

## 角色

| 角色                            | 范围                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `root` 超级管理员               | 所有科室、用户、存储与审计；可归属某个科室，也可以**不归属任何科室**，用顶部科室切换器跨科室查看                                                              |
| `dept_admin` 科室管理员         | 本科室全部数据（含所有成员的患者档案、帖子与学习会议）、成员管理（可建账号、可认领待分配用户）、本科室存储目标                                                |
| `member` 科室成员               | 患者及其就诊/影像**只能看自己建档的**；帖子、学习会议、资料库素材可浏览下载本科室共享内容，但**只能编辑自己创建的**（管理员不限）                             |
| `individual` 无所属组织的自然人 | 注册后落在个人空间：**只能浏览**公开/全系统登录可见的帖子与会议（可下载）；不能使用患者档案、不能上传文件、不能发帖/开会议/建资料库目录；管理员分配科室后恢复 |

跨科室访问一律返回 `NOT_FOUND`，不泄露记录是否存在。root 的科室作用域由请求头 `x-org-scope`
携带（前端顶部切换器写入 localStorage），后端会校验目标科室存在。

**可见与可编辑是两件事**：

- 患者档案严格「谁建档谁拥有」：只有建档者本人、**本科室**管理员与 root 可以查看和编辑；跨科室管理员同样按不存在处理。
- 帖子、学习会议、资料库素材：本科室成员登录后可以**浏览、下载**同事与管理员发布的内容（只读）；
  创建、编辑、删除、整理仍只归创建者与各级管理员，越权访问统一返回 `NOT_FOUND`。

**发布可见范围**（帖子与学习会议共用 `shareVisibility`）：

| 档位                       | 谁能读                                   | 可发布的角色                                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `private` 仅自己           | 作者；管理员可读                         | 成员 / 科室管理员 / root                         |
| `org` 本科室               | 该科室登录成员                           | 成员 / 科室管理员 / root                         |
| `logged_in` 全系统登录用户 | 任何登录账号                             | 科室管理员 / root                                |
| `selected` 指定对象        | `content_audience` 名单里的科室或用户    | 科室管理员（仅本科室与本科室用户）/ root（任意） |
| `public` 任何人            | 带链接即可，无需登录；可再设**访问密码** | 成员 / 科室管理员 / root（无科室账号不可发布）   |

**公开链接可加访问密码**：帖子设为「任何人」时可选设置 4–64 位访问密码（scrypt 哈希入库）。
未输入或输错密码时只返回标题等摘要（`reason: "password"`），正文与附件都不下发；密码正确后签发
12 小时访问令牌，帖子内的封面、图片、附件必须带令牌才能读取（`/api/files/:id?access=…`）。

公开页 `/p/<slug>` 由服务端判定范围：放行才下发正文与附件，否则只返回标题等摘要与原因
（`login` / `organization` / `owner` / `audience` / `password`），页面据此显示登录引导、密码
输入或权限说明——内容不会因为「前端没渲染」而通过接口泄露。帖子里的媒体文件走同一套判定。

**无科室账号（`individual`）防滥用**：注册后未分配科室的账号只能浏览「任何人 / 全系统登录用户」
范围的帖子与会议（可下载），不能发帖、开会议、建资料库目录，也不能上传科室资料（患者私有影像除外）；
帖子与会议列表对它们做跨科室可见性过滤，写接口返回 `FORBIDDEN`。这挡住了「恶意注册后向科室
共享空间发内容」的路径。

## 技术栈

- **Vite+**（`vp` 统一工具链：Vite、Vitest、Oxlint、Oxfmt、Vite Task）
- **React 19** + TanStack Router（文件路由）+ TanStack Query
- **Hono** + **oRPC**（端到端类型安全的 RPC）+ OpenAPI 文档（`/api`）
- **Drizzle ORM** + SQLite（WAL 模式，单科室部署零运维；换 Postgres 只需改 dialect 与连接）
- **Better Auth**（邮箱密码登录、会话 Cookie）
- **Tailwind CSS 4** + shadcn（Base UI 变体）
- 存储抽象 `@medihub/storage`：local / nas / s3 三个驱动，配置 AES-256-GCM 加密入库

## 目录

```
apps/web          React SPA：路由页面、组件、E2E 测试
apps/server      Hono 服务：/api/auth（会话）、/rpc（oRPC）、/api/files（上传下载）、/api/office（Office 预览编辑）、/api/exports（导出下载），生产环境同时托管 SPA
packages/api     oRPC 路由、权限中间件、领域服务
packages/db      Drizzle schema、迁移、测试数据库
packages/auth    Better Auth 配置与个人空间钩子
packages/storage 存储驱动、配置加解密、类型推断
packages/ui      shadcn 组件与设计令牌
packages/config  共享 TS 配置
.design          设计规范与截图留档
```

## 本地启动

前置：Node 24（`engines` 已固定）、pnpm 12。

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # 至少改 BETTER_AUTH_SECRET
pnpm db:migrate
pnpm seed                                      # 可选：演示科室与数据
pnpm dev                                       # web :5173 / api :3000
```

打开 <http://localhost:5173>，用 `root@medihub.local / Medihub@2026` 登录。

开发时 Vite 把 `/api`、`/rpc` 代理到 3000，浏览器只看到一个源，会话 Cookie 是第一方 Cookie。

## 环境变量（`apps/server/.env`）

| 变量                                       | 说明                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`                       | 必填，≥32 字符；同时用于存储配置加密。生产环境必须替换                   |
| `BETTER_AUTH_URL`                          | 浏览器访问地址，如 `https://medihub.example.com`                         |
| `DATABASE_URL`                             | SQLite 文件，相对 `apps/server` 解析                                     |
| `PORT`                                     | API 端口，默认 3000                                                      |
| `STORAGE_ROOT`                             | 本地存储根目录，默认 `./storage`                                         |
| `UPLOAD_MAX_BYTES`                         | 单文件上限，默认 256MB                                                   |
| `SOFFICE_PATH`                             | 可选，LibreOffice 可执行文件；配置后 docx/xlsx/pptx 可转 PDF 在线预览    |
| `ONLYOFFICE_URL` / `ONLYOFFICE_JWT_SECRET` | 可选，OnlyOffice Document Server；配置后可在浏览器里真正编辑 Office 文档 |
| `BETTER_AUTH_TRUSTED_ORIGINS`              | 可选，逗号分隔，额外允许的来源（局域网 IP、反向代理域名）                |
| `SEED_ROOT_EMAIL` / `SEED_ROOT_PASSWORD`   | 可选，`pnpm seed` 时创建的超级管理员                                     |
| `UPDATE_ENABLED`                           | 可选，`true` 时开启 root 在线升级（需同时配置重启命令与安装目录）        |
| `UPDATE_WORKDIR`                           | 安装目录绝对路径（含 `package.json` 与 `apps/`），需服务用户可写         |
| `UPDATE_RESTART_CMD`                       | 重启命令，如 `systemctl restart medihub`                                 |
| `UPDATE_HEALTH_URL`                        | 升级后健康检查地址，默认 `http://127.0.0.1:3000/api/health`              |
| `UPDATE_DB_PATH` / `UPDATE_KEEP_BACKUPS`   | 升级备份的数据库路径与保留份数（默认 `apps/server/local.db` / 3）        |
| `UPDATE_REPO` / `UPDATE_GITHUB_TOKEN`      | 读取 Release 与下载源码包的仓库（默认 `Eunsolfs/medihub`）与可选 token   |

在线升级与回滚的完整说明见 `docs/UPGRADE.md`。

## 存储

存储目标在「系统管理 → 存储」里配置，三种驱动：

- `local`：`{ "rootPath": "./storage/default" }`
- `nas`：`{ "rootPath": "Z:\\科室资料" }`（NAS 挂载到本机的路径）
- `s3`：`{ "endpoint", "region", "bucket", "accessKeyId", "secretAccessKey", "forcePathStyle" }`

配置以 AES-256-GCM 密文入库，接口返回的只有掩码摘要。素材行只保存 `storageTargetId + storageKey`，换存储不影响历史数据。

## Office 在线预览与编辑

- **预览**：docx 用 `docx-preview`、xlsx 用 SheetJS、PDF/pptx 优先走 `/api/office/:id/pdf`（需要 `SOFFICE_PATH`）。
- **编辑**：配置 OnlyOffice 后，预览界面出现「在线编辑」，文档通过带签名的临时链接交给 Document Server，保存回调把新文件写回存储（新 `storageKey` + 更新 `checksum`）。参考启动方式：

```bash
docker run -d --name onlyoffice -p 8080:80 \
  -e JWT_ENABLED=true -e JWT_SECRET=<与ONLYOFFICE_JWT_SECRET一致> \
  onlyoffice/documentserver
```

## 导出

`/exports` 选择类型与目标 → 后台打包到存储 → 生成记录 → 下载 `/api/exports/:id/download`。ZIP 结构：

```
README.md          导出说明（时间、操作人、来源、字段）
manifest.json      结构化数据
data.csv           表格数据（UTF-8 BOM，Excel 直接打开）
files/...          原始文件（文件名重名时自动加序号）
```

## 常用命令

```bash
pnpm dev                 # 同时启动 web 与 api
pnpm build               # 构建全部
pnpm check               # fmt + lint + 类型检查
pnpm test                # 单元 + 集成测试
pnpm test:e2e            # Playwright 端到端
pnpm run ready           # 完整校验链
pnpm db:generate         # 修改 schema 后生成迁移
pnpm db:migrate          # 应用迁移
pnpm seed                # 演示数据
```

## 工程约束

- **Lint 取舍**：仓库保留 Ultracite 的类型安全规则，但对写业务代码时纯风格冲突的规则做了
  显式收敛（`vite.config.ts` 的 `lint.rules` / `lint.overrides` 里逐条写了理由，例如
  Drizzle 的部分更新惯用法、Markdown 必须用 `dangerouslySetInnerHTML`、自定义拖拽控件）。
  新增规则前请先看那里的注释，不要把被关掉的规则当成遗漏。
- **测试**：`packages/api/tests/integration` 走真实 SQLite + 真实会话；`apps/web/tests/e2e`
  在 3200/3201 端口起一套独立环境。端到端用例是产品行为的规格，改断言前先改需求。
- **截图脚本**：`node apps/web/scripts/screenshot.mjs`（需先 `pnpm dev`），产出全站
  桌面/移动截图到 `.design/shots/`，用于设计回归。

## 部署

完整手册见 [docs/DEPLOY-1PANEL.md](docs/DEPLOY-1PANEL.md)（1Panel + Nginx + HTTPS 单机部署），
Office 在线编辑的选型与许可证见 [docs/ONLYOFFICE.md](docs/ONLYOFFICE.md)。

1. `pnpm install && pnpm build`：`build` 会先构建 web 再构建 server，并把 web 产物复制到
   `apps/server/dist/public`（服务端生产模式据此托管 SPA）。
2. `pnpm db:migrate && pnpm --filter @medihub/server start`
3. 服务端监听 `PORT`（默认 3000），浏览器只访问一个端口/域名；访问 `/` 应返回 HTML。
4. 反向代理时把 `BETTER_AUTH_URL` 设为对外域名，并在 `BETTER_AUTH_TRUSTED_ORIGINS` 里加上该域名；
   Better Auth 按客户端 IP 限流，Nginx 需传**单值** `X-Forwarded-For $remote_addr;`。
5. 代理不要丢弃自定义头 `x-org-scope`（root 的科室切换依赖它）。
6. 定期备份 `DATABASE_URL` 指向的 `.db` 文件（含 `-wal`）与 `STORAGE_ROOT`。

## 设计规范

界面遵循 [.design/DESIGN.md](.design/DESIGN.md)：医疗场景的克制配色、信息密度优先、桌面侧栏 + 移动底部导航双形态、深浅色完整支持。改动 UI 前先读该文件，复用其中的令牌与组件，不要引入第二套设计语言。
