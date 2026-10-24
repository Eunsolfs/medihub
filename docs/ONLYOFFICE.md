# ONLYOFFICE 是否免费，以及 MediHub 的接入方案

本文回答两个问题：**ONLYOFFICE Docs 能不能免费用、能用到什么程度**，以及**在 MediHub 里怎么把它接起来**。
许可证结论已于 2026 年 10 月联网核实，来源链接见 [§9](#9-来源)。

## 结论速览

| 问题                | 结论                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| 自托管要钱吗？      | **不要**。ONLYOFFICE Docs（Document Server）社区版免费下载、免费自托管                                |
| 开源协议？          | **AGPLv3**，附带「保留版权声明、标明修改、署名原作者」等附加条款                                      |
| 能商用吗？          | **能**。AGPLv3 不禁止商业使用；但对外提供**修改版**服务时必须提供对应源码，且不得使用 ONLYOFFICE 商标 |
| 并发连接数限制？    | **9.4 起已取消**（此前社区版限制 20 个同时连接）。当前最新 10.x 沿用此政策                            |
| 什么要花钱？        | 企业版 / 开发者版：管理面板、移动端 Web 编辑器、白标、文档生成器服务、自动化 API、集群、官方技术支持  |
| 对 MediHub 够用吗？ | 够。本项目只用 `docx/xlsx/pptx` 的在线编辑 + 保存回调，不依赖管理面板与移动端 Web 编辑器              |

一句话：**科室内部自用的在线编辑，社区版免费且够用**；只有要白标（换成医院自己的品牌）、要给移动端浏览器提供编辑、要官方 SLA 时，才需要买企业版/开发者版。

---

## 1. 许可证事实

### 1.1 双重许可模型

ONLYOFFICE 官方在《许可和商标政策》里给出如下对照（原文表）：

| 解决方案                               | 免费/付费 | 许可       |
| -------------------------------------- | --------- | ---------- |
| **ONLYOFFICE 文档**（Document Server） | **免费**  | **AGPLv3** |
| ONLYOFFICE 文档企业版 / 开发者版       | 付费      | 商业许可   |
| ONLYOFFICE 文档云                      | 付费      | 使用条款   |
| 桌面编辑器                             | 免费      | AGPLv3     |
| 移动应用程序（iOS & Android）          | 免费      | 商业许可   |
| 协作空间                               | 免费      | AGPLv3     |

Docker 镜像仓库的 README 同样写明：社区版镜像 `onlyoffice/documentserver` 的 License 是
**GNU AGPL v3.0**。

### 1.2 AGPLv3 的附加义务（9.4 起明确写入）

社区版你可以自由下载、安装、修改、自托管，但必须做到：

- **保留法律声明**：所有版权、许可证、担保与归属声明不得删除；
- **标明修改**：任何修改版本必须声明「已修改」、写明修改日期，并承认其基于
  Ascensio System SIA 的原始 ONLYOFFICE；
- **界面声明**：若你的版本带交互界面，必须清楚标注 ONLYOFFICE 为原始开发者、指出修改处、
  链接到许可证信息；
- **非代码内容**：插图、图标、技术文档等按 CC BY-SA 4.0 授权；
- **商标**：许可证**不授予商标使用权**，见下。

对 MediHub 的实操含义：**不要删掉编辑器关于对话框里的 ONLYOFFICE 版权信息，不要把
「ONLYOFFICE」写进你的产品名、域名或子域名**。仅作事实描述（例如文档里写「基于 ONLYOFFICE」）是允许的。

### 1.3 AGPLv3 第 13 条（网络条款）怎么看

AGPL 比 GPL 多一条：**如果你修改了程序并让它通过网络对外提供服务，你必须向这些网络用户提供
对应源码**。

- **不修改**、原样跑官方镜像 → 不触发「提供源码」义务（源码本来就在 GitHub 上）；
- **修改了** Document Server 并对外服务（例如改品牌、加插件、改默认设置文件之外的代码）→
  必须能向使用者提供你修改后的源码；
- **MediHub 自身的代码不需要开源**。MediHub 与 Document Server 是两个独立进程，通过
  HTTP（`document.url` + `callbackUrl` + JWT）交互，不构成同一个程序的衍生作品；
- 求稳做法：不 fork、不打补丁，只在 `.env` / 环境变量层面配置。本项目就是这条路。

> 本节是对公开许可证文本的工程解读，不构成法律意见。涉及对外商业交付时请让法务确认。

### 1.4 并发连接限制：9.4 起已取消

这是最容易过时的信息。**旧资料（以及很多 2024–2025 年的中文教程）都说社区版限制 20 个同时连接**，
这条在 **ONLYOFFICE Docs 9.4（2026 年 5 月）** 已经作废。官方发布说明原文：

> 「从 9.4 版本开始，开源社区版也取消了 20 个同时连接的限制。」

同版本还做了三项「减负」改动，对接管运维的人很关键：

- 移除代码压缩，便于阅读；
- **架构整合为单一流程**，降低资源消耗；
- **移除 RabbitMQ 与数据库依赖**，低配机器也能跑。

也就是说：9.4+ 的社区版容器**不再需要**挂 `/var/lib/postgresql`、`/var/lib/rabbitmq`、
`/var/lib/redis` 这三个卷（那是企业版/开发者版内置依赖的路径）。下文 compose 按社区版写。

### 1.5 社区版 vs 企业版 / 开发者版

来自官方版本对照表与许可 FAQ：

| 能力                                         | 社区版（免费）       | 企业版（付费）    | 开发者版（付费）  |
| -------------------------------------------- | -------------------- | ----------------- | ----------------- |
| 文档 / 表格 / 演示 / PDF / 表单 / 图表编辑器 | ✅                   | ✅                | ✅                |
| 协作编辑、批注、修订、内置聊天、版本历史     | ✅                   | ✅                | ✅                |
| JWT 保护                                     | ✅                   | ✅                | ✅                |
| HTTPS 加密                                   | ✅                   | ✅                | ✅                |
| 并发连接数                                   | 9.4 起不限           | 不限              | 不限              |
| **管理面板**（网页端改服务器配置、看监控）   | ❌（只能改配置文件） | ✅                | ✅                |
| **移动端 Web 编辑器**                        | ❌                   | ✅                | ✅                |
| **白标**（换 logo、隐藏菜单）                | ❌                   | 需联系销售        | ✅（扩展许可）    |
| **文档生成器服务**（不起编辑器直接生成文档） | ❌                   | ❌                | ✅                |
| **自动化 API**                               | ❌                   | 按需              | ✅                |
| **实时查看器**（只读跟随他人实时更新）       | ❌                   | 按需提供          | ✅                |
| 集群 / 上千并发用户                          | ❌                   | ✅                | ✅                |
| 官方技术支持                                 | ❌（社区/GitHub）    | ✅ 初级/中级/高级 | ✅ 初级/中级/高级 |

对 MediHub 的影响：社区版**没有管理面板**，所以所有配置只能通过环境变量与容器内配置文件完成
（下文全部走环境变量，不需要进容器改文件）。**没有移动端 Web 编辑器**，意味着手机上打开
在线编辑可能退化成只读或提示不支持 —— 如果科室必须在手机上改病历附件，这是唯一真正需要付费的点。

---

## 2. 与商业方案的门槛对比

| 方案                                             | 许可                                 | 自托管费用                   | 集成方式                            | 主要门槛                                                                                                                       |
| ------------------------------------------------ | ------------------------------------ | ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **ONLYOFFICE Docs 社区版**                       | AGPLv3                               | **免费**，9.4 起不限并发     | JS API（`api.js` + JWT）+ HTTP 回调 | AGPL 署名义务；无管理面板、无移动端 Web 编辑、无白标                                                                           |
| **ONLYOFFICE 企业版 / 开发者版**                 | 商业许可                             | 按年订阅（按并发/用户）      | 同上                                | 费用；但拿到管理面板、移动端编辑、白标、SLA                                                                                    |
| **Collabora Online**                             | 主要为 **MPLv2**（部分组件另有许可） | 免费（CODE 开发版 / 自编译） | WOPI 协议（需自建 WOPI host）       | 走 WOPI 意味着要按 WOPI 规范实现 `CheckFileInfo` / `GetFile` / `PutFile` 等端点；官方支持与企业级构建需订阅                    |
| **Microsoft 365 + Office Online Server（WOPI）** | 商业许可                             | **不免费**                   | WOPI                                | Office Online Server 只对持有相应 Office 批量许可 / Microsoft 365 版本的客户开放；还要 Windows Server + 独立部署，运维成本最高 |

选型建议：

- **已经在用 MediHub、只做内部在线编辑** → ONLYOFFICE 社区版，零许可成本；
- **需要严格 MPL 许可、或已在 Nextcloud 生态里** → Collabora，但要接受 WOPI 的实现成本；
- **医院已统一采购 Microsoft 365 且要 Complicance 对齐** → WOPI 路线，但要先确认批量许可覆盖
  自建 Office Online Server，这通常不是一个科室能推动的。

---

## 3. 部署：1Panel 里用 Docker 编排

### 3.1 放置位置

**界面：容器 → 编排 → 创建编排**（v1：`容器 → 编排`）。

| 字段     | 值                                                              |
| -------- | --------------------------------------------------------------- |
| 名称     | `onlyoffice`                                                    |
| 编排目录 | `/opt/1panel/docker/compose/onlyoffice`（面板默认目录，可自定） |
| 内容     | 下面整段 `docker-compose.yml`                                   |

先把 JWT 密钥准备好（**和主站 `.env` 的 `ONLYOFFICE_JWT_SECRET` 必须是同一个值**）：

```bash
openssl rand -hex 32
```

在同目录新建 `.env` 给编排用（1Panel 的编排页面允许直接写 compose 内容，如果它不支持旁边的
`.env` 文件，就把密钥直接写进 compose 的 `environment` 里，但**不要提交到任何仓库**）：

```bash
# /opt/1panel/docker/compose/onlyoffice/.env
ONLYOFFICE_JWT_SECRET=把上面生成的串贴在这里
```

### 3.2 `docker-compose.yml` 全文

```yaml
# ONLYOFFICE Docs（Document Server）社区版
# 9.4 起为单进程架构，不再依赖 RabbitMQ / PostgreSQL / Redis。
services:
  onlyoffice:
    # 生产建议锁定具体版本：先把 latest 拉下来用 `docker inspect` 看版本，
    # 再把这里改成 10.0.0 之类的固定 tag，避免自动升级踩坑。
    image: onlyoffice/documentserver:latest
    container_name: onlyoffice
    restart: always

    # 只监听本机：外网访问一律走 Nginx 反代（见 §4），不要把 80 直接暴露。
    # 容器内 80 是它的 nginx；TLS 由外层 1Panel OpenResty 终结。
    ports:
      - "127.0.0.1:8080:80"

    environment:
      # 必开：所有编辑器初始化请求都要校验 JWT
      JWT_ENABLED: "true"
      # 必填：必须与主站 apps/server/.env 的 ONLYOFFICE_JWT_SECRET 完全一致
      JWT_SECRET: "${ONLYOFFICE_JWT_SECRET}"
      # token 默认走 Authorization 头；本项目把 token 放进编辑器 config 体内传递，
      # 若出现「token 格式不正确」，把下面这行打开再重启容器。
      JWT_IN_BODY: "true"
      # 默认不允许 Document Server 回调私网地址。主站用公网域名访问时保持 false；
      # 若 callbackUrl 指向内网 IP（如 http://10.0.0.8:3000），必须改成 "true"，
      # 并且把 ALLOW_META_IP_ADDRESS 一并打开，否则保存回调会被拒。
      ALLOW_PRIVATE_IP_ADDRESS: "false"
      ALLOW_META_IP_ADDRESS: "false"
      # 关掉欢迎页（多一个不需要的对外页面）
      WELCOME_PAGE_ENABLED: "false"
      # 与主站同一时区，便于对照日志时间
      TZ: "Asia/Shanghai"

    volumes:
      # 官方社区版三个数据卷：日志 / 证书 / 文件缓存
      - ./onlyoffice/logs:/var/log/onlyoffice
      - ./onlyoffice/data:/var/www/onlyoffice/Data
      - ./onlyoffice/lib:/var/lib/onlyoffice

    # 渲染大文档时容器内的 /dev/shm 太小会崩，显式给 512M
    shm_size: "512m"

    # 内存上限：官方推荐 RAM 4 GB 起、swap 2 GB 起。
    # 留出上限防它把宿主机吃光；低于 3g 时打开 100 页的 xlsx 容易 OOM。
    # 注意：docker compose v2 认 deploy.resources.limits；很老的 compose 换成
    # `mem_limit: 4g`，两者不要同时写。
    deploy:
      resources:
        limits:
          memory: 4g

    healthcheck:
      # 官方镜像内置 /healthcheck 端点，返回 true。
      # 若你用的镜像版本没有该端点（健康检查一直 unhealthy），
      # 改成 `curl -fsS http://127.0.0.1/ >/dev/null || exit 1`。
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1/healthcheck || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
```

### 3.3 资源与运维要点

| 项目        | 建议                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU / 内存  | 官方推荐：RAM **4 GB 起**、双核 2 GHz、swap ≥ 2 GB、磁盘 ≥ 2 GB                                                                                                                  |
| Docker 版本 | 镜像基于 `ubuntu:24.04`，官方要求 docker-engine ≥ `20.10.21`，过旧会有兼容问题                                                                                                   |
| 首次启动    | 首次启动要生成字体缓存，`start_period` 给了 120s，别急着判死                                                                                                                     |
| 停机        | **先 `docker exec onlyoffice documentserver-prepare4shutdown` 再停容器**。Document Server 只在所有编辑者关闭文档后才落盘，直接 `docker stop` 会丢未保存内容；该脚本最多要 5 分钟 |
| 升级        | 先备份 `./onlyoffice/data`，再 `docker compose pull && docker compose up -d`                                                                                                     |
| 日志        | `docker logs -f onlyoffice`，或看挂载出来的 `./onlyoffice/logs`                                                                                                                  |
| 备份        | 只需要备份 `./onlyoffice/data`（证书）与主站的数据库/素材；`lib` 是文件缓存，可丢                                                                                                |

### 3.4 验证容器本身

```bash
docker ps --filter name=onlyoffice
docker exec onlyoffice curl -fsS http://127.0.0.1/healthcheck && echo " OK"
# 应输出 true OK
```

---

## 4. 反向代理到 `https://office.example.com`

### 4.1 为什么要单独一个子域名

`ONLYOFFICE_URL` 会被前端拼成
`${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js` 动态插进 `<script>`，并由它再去加载
编辑器 iframe。子域名是最省事的分法：同一个 IP、同一套证书体系、互不干扰的 Cookie 域。

也可以把 OnlyOffice 挂在主站路径下（如 `https://medihub.example.com/office/`），但那需要同时改
Document Server 内部的基础路径与反向代理重写，任何一处漏掉都会白屏。**不推荐**。

### 4.2 在 1Panel 建站

**界面：网站 → 网站 → 创建网站**，类型选反向代理；域名 `office.example.com`；
代理地址 `http://127.0.0.1:8080`（与 compose 里的端口映射一致）。

然后 **网站 → SSL 证书 → 申请证书**，给 `office.example.com` 申请 Let's Encrypt，
回到站点 **设置 → HTTPS** 选该证书并开启「自动跳转 HTTPS」。

### 4.3 关键配置

```nginx
server {
    # 【1Panel 自动生成】listen / 证书 / 协议 这些行由面板写入，保持原样；
    # 下面只列需要手动补的部分。
    server_name office.example.com;

    # 【1Panel 自动生成】证书与协议配置，保持原样
    # ssl_certificate / ssl_certificate_key / ssl_protocols ...

    # Document Server 上传/下载大文档；编辑器初始化时 XHR 体不大，但转换下载会大
    client_max_body_size 100m;

    # WebSocket 必须开：编辑器与 Document Server 之间的实时协同走 ws（/doc/... 路径）
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # 【必须】下面两个头是 WebSocket 升级的核心，缺一就只有只读白屏
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # 【必须】Host 要传外部域名：Document Server 生成的内部链接以此为准
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 【必须】告诉容器外部是 https，否则它内部生成 http 链接 → 浏览器混合内容拦截
        proxy_set_header X-Forwarded-Proto $scheme;

        # 大文档转换、首次字体加载会久一点
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 15s;
        proxy_buffering off;
    }

    # 静态资源可以放心长缓存（文件名带版本号）
    location ~* \.(js|css|woff2?|svg|png|gif|ico)$ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        expires 7d;
    }
}
```

`$connection_upgrade` 需要在 `http` 层定义一次（1Panel 的 OpenResty 主配置里若还没有，加到
`http {}` 段，或直接用常量代替）：

```nginx
# 没有 $connection_upgrade 变量时，最简单的替代写法：
# proxy_set_header Connection "upgrade";
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

### 4.4 为什么必须与主站同协议（https）

浏览器在 `https://medihub.example.com` 页面里加载 `http://office.example.com/.../api.js`，
或反过来嵌一个 http 的 iframe，都会被**混合内容（Mixed Content）策略**直接拦掉：

```
Mixed Content: The page at 'https://medihub.example.com' was loaded over HTTPS,
but requested an insecure script 'http://office.example.com/web-apps/.../api.js'.
This request has been blocked.
```

而且这条不只是「安全建议」，是**浏览器的硬拦截**：http 的**脚本**与 **iframe** 属于
blockable content，不会降级执行，只会报错。具体到本项目会看到：

1. 点「在线编辑」后白屏，或直接显示「OnlyOffice 编辑器脚本加载失败」；
2. F12 Console 出现上面那条 `Mixed Content`；
3. Network 里 `api.js` 的状态是 `(blocked:mixed-content)`。

正确做法只有一条：**给 Document Server 配 https 证书，`ONLYOFFICE_URL` 写
`https://office.example.com`**。不要试图在浏览器侧绕过。

顺带的第二层原因：Document Server 自身也会按 `X-Forwarded-Proto` 生成内部链接。
如果容器以为自己是 http，即使外层是 https，它返回给编辑器的资源地址仍是 `http://...`，
结果同上。所以 §4.3 里的 `X-Forwarded-Proto $scheme` 同样是必需项。

### 4.5 主站与 Document Server 必须能互访

本项目的互联方向有两条，缺一不可：

| 方向                                    | 用途                                                                                 | 要求                       |
| --------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| 浏览器 → office.example.com             | 加载编辑器                                                                           | 公网可达、证书有效         |
| **Document Server → `BETTER_AUTH_URL`** | 下载原件（`/api/office/:id/source`）、**报送保存回调**（`/api/office/:id/callback`） | 容器内能解析并访问主站域名 |

同机 Docker 部署时，最容易踩的是「域名在公网解析，容器里回环不出去」（hairpin NAT）：

```bash
# 在容器里验证能否访问主站
docker exec onlyoffice curl -fsS -o /dev/null -w '%{http_code}\n' https://medihub.example.com/
# 期望 200 / 302；连不上就是 DNS 或出网问题
```

补救办法（任选一）：

- 同机部署且内网可直连：让容器解析主站到宿主机内网 IP，并在主站 `.env` 里把
  `BETTER_AUTH_URL` 之外再加 `BETTER_AUTH_TRUSTED_ORIGINS`，同时把 compose 的
  `ALLOW_PRIVATE_IP_ADDRESS: "true"`；但注意 `callbackUrl` 是按 `BETTER_AUTH_URL` 拼的，
  所以更干净的做法是保持公网域名、把出网修好；
- 在 compose 里加 `extra_hosts`，把主站域名指向宿主机 IP（仅当主站也监听在该 IP 上）：

  ```yaml
  extra_hosts:
    - "medihub.example.com:172.17.0.1"
  ```

---

## 5. 在 MediHub 里接入

### 5.1 两个变量

编辑 `/opt/medihub/apps/server/.env`：

```bash
ONLYOFFICE_URL="https://office.example.com"
ONLYOFFICE_JWT_SECRET="与 onlyoffice 容器 JWT_SECRET 完全一致"
```

规则（来自 `apps/server/src/env.ts` 与 `apps/server/src/routes/office.ts`）：

- `ONLYOFFICE_URL` 必须是**合法 URL**（Zod `z.url()`），末尾斜杠会被自动去掉；
- **两个都填**才启用；只填一个等于没配，`/api/office/:id/config` 返回 `{ "configured": false }`，
  界面不会出现「在线编辑」入口；
- `ONLYOFFICE_JWT_SECRET` 与容器里的 `JWT_SECRET` 不一致 → 编辑器能打开但立刻报 token 错误。

改完重启主站进程：

```bash
sudo supervisorctl restart medihub     # 或 sudo -u www pm2 restart medihub
```

### 5.2 一次完整的接入链路（照着核对）

```
浏览器                 MediHub server (:3000)                Document Server
  │ GET /api/office/:id/config │                                    │
  │───────────────────────────>│ 读 asset + storageTarget            │
  │<───────────────────────────│ { configured:true, editorUrl,       │
  │                            │   config, token }                   │
  │ 动态插入 api.js ← editorUrl│                                     │
  │──────────────────────────────────────────────────────────────>  │
  │ new DocsAPI.DocEditor(id, { ...config, token })                 │
  │──────────────────────────────────────────────────────────────>  │ 校验 JWT
  │                            │  GET /api/office/:id/source?expires&signature
  │                            │<───────────────────────────────────│ 取原件
  │                            │  POST /api/office/:id/callback?...  │ 编辑完成
  │                            │<───────────────────────────────────│ (status 2/6)
  │                            │ 写新文件 → 更新 storageKey/checksum │
  │                            │───────────────────────────────────>│ { "error": 0 }
```

对照代码里的几个关键设计：

| 设计                  | 代码位置                                                                    | 说明                                                                                                          |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 编辑器地址            | `office.ts` → `editorUrl: env.ONLYOFFICE_URL`                               | 前端拼 `/web-apps/apps/api/documents/api.js`                                                                  |
| 取件用签名而非 Cookie | `GET /:id/source?expires=&signature=`                                       | HMAC-SHA256(`${assetId}:${expiresAt})`，密钥是 `BETTER_AUTH_SECRET`；**不把登录 Cookie 交给 Document Server** |
| 签名有效期            | `expiresAt = Date.now() + 60 * 60 * 1000`                                   | **1 小时**。文档打开超过 1 小时再保存会 403（见 §6）                                                          |
| 回调地址              | `editorConfig.callbackUrl = ${BETTER_AUTH_URL}/api/office/:id/callback?...` | 所以 Document Server 必须能访问 `BETTER_AUTH_URL`                                                             |
| 文档版本键            | `document.key = ${assetId}-${checksum.slice(0,8)}`                          | 内容变了 key 就变，Document Server 缓存自动失效，不会拿旧内容                                                 |
| JWT                   | 服务端用 HS256 自签 `signJwt(config, ONLYOFFICE_JWT_SECRET)`                | 前端把它作为 `token` 放进 config 体                                                                           |
| 保存                  | 回调里 `status === 2                                                        |                                                                                                               | status === 6`时拉`url` 写回存储 | 生成**新** `storageKey`（`buildStorageKey`）+ 新 `checksum`，旧文件保留 |

### 5.3 验证流程（5 步）

前置：主站已能登录，OnlyOffice 容器 `healthy`，两个环境变量已填并重启。

1. **确认配置生效**

   ```bash
   # 用登录后的浏览器直接访问（未登录会 401）
   curl -s -b 'better-auth.session_token=<你的cookie>' \
     https://medihub.example.com/api/office/<素材id>/config | head -c 400
   ```

   期望看到 `"configured":true`、`"editorUrl":"https://office.example.com"`、一段 `token`。
   若是 `{"configured":false}` → 两个变量没填全，或该素材不是 Office 文档。

2. **打开素材进入在线编辑**
   资料库里点一个 `.docx` 素材 → 预览 → 应出现 **「在 OnlyOffice 中编辑」** 按钮
   （`office.status === 'ready'` 才渲染）→ 点进去，编辑器加载完成（不是白屏）。

3. **改内容并保存**
   在编辑器里改一句话 → 等 3–5 秒（Document Server 自动保存）→ 点左上「返回预览」。
   Document Server 会在编辑者全部关闭后回调 `status=2`；也可以点编辑器内的保存按钮触发 `status=6`。

4. **确认服务端收到了回调**

   ```bash
   # 主站访问日志（或进程日志）里应能看到
   grep 'POST /api/office/' /www/wwwlogs/medihub-server.log | tail -5
   ```

5. **确认存储里的文件真的换了**

   ```bash
   sqlite3 /data/medihub/local.db \
     "select id, storageKey, checksum, byteSize from asset where id='<素材id>';"
   ```

   `storageKey` 应变成**新的**路径（`<组织>/<年-月>/<hash>.<ext>` 形式），`checksum` 与
   `byteSize` 都变了。再回界面打开该素材，内容应是刚改过的。

   > 注意：如果「内容变了但 checksum 没变」，说明回调没走通，改的是 Document Server 的缓存；
   > 如果「checksum 变了但界面内容没变」，先强制刷新（SPA 缓存），再核对 `storageKey` 指向的文件。

### 5.4 常见报错

| 现象                                                                                             | 原因                                                                                                                                                 | 排查                                                                                                           | 处理                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 编辑器弹出 **「文档安全令牌的格式不正确」/ The document security token is not correctly formed** | 两边 `JWT_SECRET` 不一致；或只改了主站没重启容器                                                                                                     | `docker exec onlyoffice printenv \| grep JWT`；`sudo grep ONLYOFFICE_JWT_SECRET /opt/medihub/apps/server/.env` | 改成同一个值：主站改完**重启进程**，容器改完**重启容器**。注意末尾空格与引号                                                                |
| 同上，但密钥确认一致                                                                             | `token` 放在 config 体里，而容器只认 `Authorization` 头                                                                                              | `docker exec onlyoffice printenv \| grep JWT_IN_BODY`                                                          | compose 里设 `JWT_IN_BODY: "true"` 后重启容器                                                                                               |
| **Document Server 下载文档 403**（编辑器里提示下载失败 / 一直在转）                              | ① 签名过期 ② Document Server 访问不到主站 ③ 主站返回 403                                                                                             | `docker exec onlyoffice curl -i '<把第一个段 document.url 原样贴进来>'`                                        | ① 重新打开素材刷新签名（有效期 1h）；② 修 DNS/出网（§4.5）；③ 若 `callbackUrl`/`source` 指向私网 IP，容器需 `ALLOW_PRIVATE_IP_ADDRESS=true` |
| **保存回调未触发**，内容丢失                                                                     | ① Document Server 访问不到 `${BETTER_AUTH_URL}/api/office/.../callback` ② Nginx 读超时太短 ③ 文档打开超过 1 小时（签名过期，回调返回 `{"error":1}`） | `docker logs onlyoffice \| grep -i callback`；主站日志有无对应 `POST`                                          | ① 修互访；② 主站侧 `proxy_read_timeout 300s`；③ 超过 1 小时请重新打开文档再编辑                                                             |
| 编辑器**白屏**，Console 有 `Mixed Content`                                                       | 主站 https，`ONLYOFFICE_URL` 是 http                                                                                                                 | F12 Console                                                                                                    | 给 office 子域名配 https，改 `ONLYOFFICE_URL` 后重启。见 §4.4                                                                               |
| 编辑器**白屏**，Console 无报错，Network 里 `websocket` 失败                                      | 反代没开 WebSocket 升级                                                                                                                              | 看 `office.example.com` 的 `WS` 请求是否 400/404                                                               | 补 `proxy_set_header Upgrade`/`Connection`（§4.3）                                                                                          |
| 完全看不到「在线编辑」按钮                                                                       | `configured=false`：变量没填全，或文件不是 Office 类型                                                                                               | `curl .../api/office/:id/config`                                                                               | 补变量并重启；`isOfficeDocument()` 只认 word/spreadsheet/presentation 与 `doc(x)/xls(x)/ppt(x)/odt/ods/odp`                                 |
| 手机浏览器上编辑不了                                                                             | 社区版**没有移动端 Web 编辑器**                                                                                                                      | —                                                                                                              | 这是许可证边界，不是配置问题。手机端只用预览，或采购企业版/开发者版                                                                         |
| 容器起来就 `unhealthy`                                                                           | 镜像版本无 `/healthcheck` 端点，或首次启动字体缓存没生成完                                                                                           | `docker logs onlyoffice \| tail -50`                                                                           | 把 healthcheck 换成首页探测；`start_period` 给足 120s                                                                                       |

---

## 6. 不部署 OnlyOffice 时的降级路径

不配 `ONLYOFFICE_URL` / `ONLYOFFICE_JWT_SECRET` 时，系统**不会加载任何外部脚本**，
所有预览走本地能力，功能少一块但完全可用：

| 格式                              | 降级后的能力                | 依赖                              | 说明                                                                                                                                                           |
| --------------------------------- | --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **docx**                          | 只读预览                    | 无（`docx-preview` 纯前端渲染）   | 排版接近 Word；不能编辑，只能下载后本地改                                                                                                                      |
| **xlsx**                          | 只读预览 + 「保存为新版本」 | 无（SheetJS 纯前端）              | 表格可以在浏览器里改并另存为新素材（不覆盖原件），是降级后体验最好的一类                                                                                       |
| **pptx**                          | 转 PDF 预览                 | **`SOFFICE_PATH`**（LibreOffice） | pptx 没有浏览器本地渲染方案，`PptxViewer` 先探测 `/api/office/:id/pdf`；装了 LibreOffice 就出 PDF iframe，没装就提示「服务器没有安装 LibreOffice」并给下载按钮 |
| **pdf**                           | 原生预览                    | 无                                | 浏览器内置阅读器                                                                                                                                               |
| **图片 / 视频 / 文本 / Markdown** | 完整                        | 无                                | 与本议题无关                                                                                                                                                   |

因此降级方案分两档：

**A 档：什么都不装（纯前端预览）**

- docx 只读、xlsx 可看可另存新版本、pptx 不可预览（只能下载）；
- 适合「素材主要是照片，Office 文件偶尔看一眼」的科室。

**B 档：只装 LibreOffice（推荐的最小可用组合）**

```bash
sudo apt-get install -y libreoffice libreoffice-writer libreoffice-calc libreoffice-impress
command -v soffice     # /usr/bin/soffice
```

```bash
# apps/server/.env
SOFFICE_PATH="/usr/bin/soffice"
```

- 额外收益：pptx 也能在线看；docx/xlsx/pptx 都可经 `/api/office/:id/pdf` 转 PDF；
- 代价：首次转换较慢（缓存在 `$STORAGE_ROOT/.office-cache`，同一素材第二次是秒开）；
- 仍然**不能编辑**，编辑能力只有 OnlyOffice 能给。

决策建议：

| 需求                                    | 选择                                         |
| --------------------------------------- | -------------------------------------------- |
| 只读、偶尔看一眼                        | 不装，或只装 LibreOffice                     |
| 需要在浏览器里改 docx/pptx 并保存回系统 | **OnlyOffice 社区版**（免费）                |
| 需要在手机上改                          | 企业版/开发者版（社区版无移动端 Web 编辑器） |
| 要白标成医院品牌                        | 开发者版（白标属扩展许可）                   |

---

## 7. 反向代理到 `https://office.example.com`

见 [§4](#4-反向代理到-httpsofficeexamplecom)。要点重复一遍：**WebSocket 升级头 + Host +
X-Forwarded-Proto 三者缺一不可**，且必须与主站同协议。

---

## 8. 与本项目的一致性说明

- 本文用到的环境变量名与 `apps/server/.env.example`、`apps/server/src/env.ts` 完全一致：
  `ONLYOFFICE_URL`、`ONLYOFFICE_JWT_SECRET`、`SOFFICE_PATH`。
- 前端加载脚本的路径来自 `apps/web/src/components/media/office-editor.tsx`：
  `${editorUrl}/web-apps/apps/api/documents/api.js`，并把 `token` 合并进 `config`，
  所以服务端的 `editorUrl` 必须是一个**根地址**（不带路径后缀）。
- 回调与取件的签名有效期、状态码（`2` / `6`）、返回体（`{"error":0}` / `{"error":1}`）
  均照 `apps/server/src/routes/office.ts` 的现有实现描述，未做改动。
- 目录 `docs/` 之外的文件没有改动。

## 9. 来源

核实时间：2026-10-24。

| 结论                                                                                                                                                                                         | 来源                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文档社区版免费、AGPLv3；企业版/开发者版为商业许可；双重许可模型与商标政策                                                                                                                    | [ONLYOFFICE 许可和商标政策：常见问题答疑](https://www.onlyoffice.com/blog/zh-hans/2026/05/onlyoffice-license-and-trademark-policy)                                  |
| 9.4 起**取消社区版 20 个同时连接限制**；单进程架构、移除 RabbitMQ 与数据库依赖；AGPLv3 附加署名条款                                                                                          | [ONLYOFFICE 文档 9.4 发布](https://www.onlyoffice.com/blog/zh-hans/2026/05/onlyoffice-docs-9-4)（[IT之家报道](https://www.ithome.com/0/953/867.htm)佐证）           |
| 社区版 / 企业版 / 开发者版能力对照（管理面板、移动端 Web 编辑器、白标等）                                                                                                                    | [对比 ONLYOFFICE 文档版本](https://www.onlyoffice.com/zh/compare-editions)                                                                                          |
| Docker 镜像、AGPLv3、社区版卷路径、推荐系统要求（RAM 4 GB 起）、`JWT_ENABLED`/`JWT_SECRET`/`JWT_HEADER`/`JWT_IN_BODY`/`ALLOW_PRIVATE_IP_ADDRESS` 环境变量、`documentserver-prepare4shutdown` | [ONLYOFFICE/Docker-DocumentServer README](https://github.com/ONLYOFFICE/Docker-DocumentServer)                                                                      |
| Document Server 源码与许可证                                                                                                                                                                 | [ONLYOFFICE/DocumentServer](https://github.com/ONLYOFFICE/DocumentServer)                                                                                           |
| Collabora Online 主要为 MPLv2、基于 WOPI                                                                                                                                                     | [CollaboraOnline/online.mirror README](https://github.com/CollaboraOnline/online.mirror)                                                                            |
| Office Online Server 需要 Office 批量许可 / 含 Office 的 Microsoft 365 订阅，非免费                                                                                                          | [Office Online Server License Requirements（Microsoft Q&A）](https://learn.microsoft.com/en-us/answers/questions/5143051/office-online-server-license-requirements) |
| 1Panel 菜单与操作路径（编排、Supervisor、网站反向代理/证书）                                                                                                                                 | [1Panel Docs](https://1panel.pro/docs/v2/user_manual/websites/node/)                                                                                                |

## 相关文档

- [1Panel 单机部署手册](./DEPLOY-1PANEL.md)
- [文档索引](./README.md)
