# MediHub 部署与运维文档

仓库 `docs/` 下的运维文档索引。六份文档都按「可以直接照做」的标准写：命令可复制、界面路径给出
1Panel 的具体位置、关键结论标注来源。

| 文档                                     | 内容                                                                                                                                                                                                                                                                                                                                      | 适合谁                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [INSTALL-1PANEL.md](./INSTALL-1PANEL.md) | **1Panel 服务器一键安装**：一条命令装好 Node/pnpm/服务/站点依赖，`--seed` 建管理员，OnlyOffice 参数可后填，`--update` 升级；含参数表、常见问题、卸载                                                                                                                                                                                      | 不想逐节读部署手册、想尽快把站点跑起来的人                                     |
| [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md)   | **1Panel + Nginx 反向代理 + HTTPS 单机部署手册**：服务器规格、Node 24 / pnpm 12 安装（面板与手动两种）、目录与系统用户、`apps/server/.env` 全字段、构建与迁移、进程守护（Supervisor / pm2 两套完整配置）、反向代理必需指令与原因、证书、防火墙、备份与恢复、手工升级与回滚、上线验收清单、故障排查表、科室作用域                          | 第一次把 MediHub 部署到一台 Linux 服务器的人；接手运维的人                     |
| [UPGRADE.md](./UPGRADE.md)               | **在线升级与回滚**（系统管理 → 版本与升级，**v1.1.0+**）：适用与不适用清单、执行器原理与时序、`UPDATE_*` 环境变量表、三种部署方式（systemd / PM2 / 1Panel）的重启命令与 sudoers 配置、操作步骤、回滚边界、常见问题、安全说明                                                                                                              | 负责发版与线上运维的人；被「升级失败/自动回滚」卡住的人                        |
| [ONLYOFFICE.md](./ONLYOFFICE.md)         | **ONLYOFFICE 是否免费与接入方案**：AGPLv3 与商用边界、9.4 起取消 20 并发限制、社区版 / 企业版 / 开发者版能力对照、与 Collabora / Microsoft WOPI 的门槛对比、1Panel Docker 编排全文、`https://office.example.com` 反代要点、本项目 `.env` 两个变量与完整验证流程、常见报错、不部署时的降级路径                                             | 正在决定「Office 文档要不要在线编辑、要花多少钱」的人；负责接入排错的人        |
| [ARCHIVE.md](./ARCHIVE.md)               | **容量与冷数据归档**（存储配额 / 冷数据归档 / 定时计划 / 镜像备份）：容量规划、GB↔字节与 413/507 排查、手工归档与分片选择、**定时归档计划**（频率/整点/本地目标 200MB 规则）、**镜像备份**（SQLite 快照 + 可选素材、恢复方式）、归档包内容（`manifest.json` / `viewer.html`）、归档后如何取回、桌面端离线查看、大文件断点续传、运维与备份 | 磁盘快满、要给科室设上传上限、要把旧素材下线归档、或需要一份能恢复的冷备份的人 |
| [MOBILE-PWA.md](./MOBILE-PWA.md)         | **手机端使用与安装（PWA）**：安装到安卓桌面（两个入口）、手机能做什么/不能做什么、拍照录像上传、HTTPS 硬要求、iOS 差异、为什么先做 PWA、什么时候值得上原生（Expo / Electron 壳，含 VibeStart 命令示例但未实现）、常见问题自检清单                                                                                                         | 要在手机上拍照上传的科室、负责上线 HTTPS 与答疑的人                            |

## 阅读顺序建议

1. 想最快跑起来：[INSTALL-1PANEL.md](./INSTALL-1PANEL.md) 的一条命令，然后回来按需补
   [UPGRADE.md](./UPGRADE.md) 的在线升级配置。
2. 需要逐项控制（自定义目录、Supervisor、证书细节）：按 [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md)
   从 §1 顺序做到 §13。
3. 上线前逐条过一遍 §14「上线验收清单」，别跳过 §16「与仓库现状的已知差异」
   和 §17「科室作用域」——后者解释了「切换科室后数据没变」这类只会在反代后面才出现的现象。
4. 要开启「系统管理 → 版本与升级」的在线升级，先读 [UPGRADE.md](./UPGRADE.md) 的 §3
   前置条件与 §5 重启命令——九成失败都出在这两节。
5. 磁盘开始紧张、或要给科室设上传上限时，读 [ARCHIVE.md](./ARCHIVE.md)：§1 容量规划、
   §2 配额（含 413/507 排查）、§3 归档操作与 §3.7 定时计划 / §3.8 镜像备份；
   动手前务必看清 §9「限制与注意事项」。
6. 要让医生在手机上拍照上传，读 [MOBILE-PWA.md](./MOBILE-PWA.md)：先确认 HTTPS（§5.1），
   再按 §2 教他们装到桌面；能力边界见 §4。

## 三个最容易踩的坑

| 坑                                     | 说明                                                                                                                                                                                                                                                                                                     | 详见                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 构建流程被改动后 SPA 没进静态目录      | 现在 `pnpm build` 会自动把 `apps/web/dist` 复制到 `apps/server/dist/public`（服务端 build 末尾跑 `scripts/copy-spa.mjs`）。**只有在你换掉构建方式**（自定义 Dockerfile / CI 只跑 `vp pack` / 单独跑 `--filter @medihub/server build` 而 web 未构建）时才会缺这一步，表现为站点 404 而 `/api/health` 正常 | [DEPLOY-1PANEL.md §7.1](./DEPLOY-1PANEL.md#71-spa-静态产物由构建自动复制)                      |
| `BETTER_AUTH_URL` 与实际访问地址不一致 | 结果是「页面能打开、一登录就 403」，因为 Better Auth 按 Origin 校验                                                                                                                                                                                                                                      | [DEPLOY-1PANEL.md §6.2](./DEPLOY-1PANEL.md#62-变量清单)、[§15](./DEPLOY-1PANEL.md#15-故障排查) |
| OnlyOffice 与主站不同协议              | 主站 https、编辑器 http，浏览器按混合内容直接拦掉，表现为白屏                                                                                                                                                                                                                                            | [ONLYOFFICE.md §4.4](./ONLYOFFICE.md#44-为什么必须与主站同协议https)                           |

> 在线升级另有两个当前版本的行为约束（「点了升级没反应」与「升级后自动回滚」），
> 都写在 [UPGRADE.md §8](./UPGRADE.md#8-常见问题) 里。开启升级功能前请先读那一节，
> 并在首次使用前按 [UPGRADE.md §3.6](./UPGRADE.md#36-构建产物里带着执行器脚本)、
> [§3.7](./UPGRADE.md#37-版本号随产物一起切换) 做两项自检。

## 与仓库脚本的对应关系

文档里引用的命令都来自根 `package.json` 与 `apps/server/package.json`：

| 文档里的命令                                      | 实际定义                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install` / `pnpm install --frozen-lockfile` | pnpm 原生命令（仓库有 `pnpm-lock.yaml`）                                                          |
| `pnpm dev`                                        | `vp run -r --parallel dev`                                                                        |
| `pnpm build`                                      | `vp run --filter @medihub/web build && vp run --filter @medihub/server build`（先 web 后 server） |
| `pnpm check`                                      | `vp check`                                                                                        |
| `pnpm test`                                       | `vp test`（unit + integration 两个 project）                                                      |
| `pnpm test:e2e`                                   | `vp run --filter @medihub/web test:e2e`                                                           |
| `pnpm seed`                                       | `vp run --filter @medihub/server seed`                                                            |
| `pnpm db:generate`                                | `vp run --filter @medihub/db db:generate`                                                         |
| `pnpm db:migrate`                                 | `vp run --filter @medihub/server db:migrate`                                                      |
| `pnpm run ready`                                  | `vp check && vp run knip && vp test && vp run test:e2e && vp run build`                           |
| 生产启动（Supervisor / pm2）                      | 等价于 `apps/server` 的 `start`：`node --env-file-if-exists=.env dist/index.mjs`                  |

> 生产部署只需要 `pnpm install --frozen-lockfile`、`pnpm db:migrate`、`pnpm build`
> 三步；`check` / `test` / `test:e2e` 属于本地与 CI。
