# MediHub 文档地图

当前版本 **v1.10.4**（纯净版：安装后是空库，**必须先访问 `/install` 创建管理员**）。

文档按「你想做什么」分组。第一次来，只看第一组；日常运维查第二组；改功能/选型再看第三组。

---

## 一、只想把站跑起来（首次上线）

| 顺序  | 文档                                                                        | 什么时候看                                                                                                                 |
| ----- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **1** | [1PANEL-FIRST-DEPLOY.md](./1PANEL-FIRST-DEPLOY.md) — **首次部署（主入口）** | 第一次部署。DNS → 一键安装 → 反向代理 → HTTPS → `/install` 建管理员 → 建第一个科室 → 验收 → 备份 → 升级 → 排障，一条线走完 |
| 2     | [INSTALL-1PANEL.md](./INSTALL-1PANEL.md) — **安装器参考**                   | 查 `install-1panel.sh` 的参数含义、1.9.x–1.10.x 行为变化、卸载命令。**不重复开箱流程**                                     |
| 3     | [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md) — **手工/进阶部署**                  | 不用一键脚本：自定义目录/用户、Supervisor 或 PM2、手工 Nginx 与证书、逐项备份恢复与排障                                    |
| 4     | [DOCKER-OPS.md](./DOCKER-OPS.md) — **Docker 一键运维**（容器化推荐）        | 想用容器统一管理：一个 `ops.sh` 负责安装、升级、回滚、备份、恢复、自检；反代仍指向 `127.0.0.1:<MH_PORT>`                   |
| 5     | [DOCKER.md](./DOCKER.md) — **本地 Docker / GHCR（手工 compose）**           | 本地演示、验收，或自己写 compose；GHCR 镜像 public。没有 systemd，也就**没有页面里的在线升级**                             |

> 部署有**四条路**：
>
> 1. 一键脚本（**推荐**，第 1 行，systemd）；
> 2. **Docker 一键运维**（第 4 行，容器 + `ops.sh`）；
> 3. 手工部署（第 3 行）；
> 4. 本地/手工 Docker（第 5 行）。
>
> 第 2 行（**安装器参考**）不是部署路径，只是 `install-1panel.sh` 的参数手册。
> 四条路的「反代 + HTTPS + `/install` 建管理员 + 建第一个科室」完全一样。
> **一台机器只能选一种安装方式**：systemd 在 `/opt/medihub`，Docker 一键运维在
> `/opt/medihub-docker`，别混用。

## 二、日常运维

| 文档                                                     | 用途                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [UPGRADE.md](./UPGRADE.md) — **在线升级与回滚**          | systemd 部署用：系统管理 →「版本与升级」一键升级、失败自动回滚、`.updates/state.json` 读日志、回滚边界（Docker 用 `ops.sh upgrade`） |
| [ARCHIVE.md](./ARCHIVE.md) — **容量与归档**              | 存储配额（科室/全站、413/507 排查）、冷数据归档与定时计划、镜像备份（每目标留 2 份 + 一键恢复）                                      |
| [DEPLOY-1PANEL.md §12](./DEPLOY-1PANEL.md#12-备份与恢复) | 备份/恢复的具体命令（SQLite `.backup` + 素材目录）                                                                                   |
| [DEPLOY-1PANEL.md §15](./DEPLOY-1PANEL.md#15-故障排查)   | 完整故障排查表（403 Origin / 413 / 502 / SQLite 锁 / 时区 / 权限 / 429）                                                             |

## 三、功能深挖与端侧

| 文档                               | 用途                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| [ONLYOFFICE.md](./ONLYOFFICE.md)   | Office 在线编辑选型：许可证、免费边界、Docker 部署、反代与排错       |
| [MOBILE-PWA.md](./MOBILE-PWA.md)   | 手机端：安装成桌面 App（PWA）、拍照上传、能力边界、iOS 差异          |
| [ANDROID-APK.md](./ANDROID-APK.md) | 需要独立安装包时：Capacitor 套壳 + GitHub Actions 出 APK、签名与上架 |

---

## 最常见的四个坑

| 坑                                  | 说明                                                                                                                        | 详见                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 装完打不开账号页 / 以为坏了         | 纯净版是**空库**：先打开 `https://域名/install` 建管理员，再建第一个科室                                                    | [FIRST §5](./1PANEL-FIRST-DEPLOY.md#5-初始化第一个管理员)、[§6](./1PANEL-FIRST-DEPLOY.md#6-创建第一个科室必须) |
| 登录 403 / Invalid origin           | 用 `IP:端口` 打开但 `BETTER_AUTH_URL` 是域名 → Better Auth 拒绝；改成同一地址，或把该地址加进 `BETTER_AUTH_TRUSTED_ORIGINS` | [FIRST §11](./1PANEL-FIRST-DEPLOY.md#11-常见问题)                                                              |
| 上传 413 / 502                      | Nginx `client_max_body_size 300m`、`proxy_read_timeout 300s`，且 `X-Forwarded-For` 传**单值**                               | [FIRST §3.1](./1PANEL-FIRST-DEPLOY.md#31-加上传与超时配置)                                                     |
| 在线升级点了没反应 / 升级后自动回滚 | 先看 `.updates/state.json` 与 `journalctl -u medihub`；升级执行器需要 sudoers 免密重启与 `KillMode=process`                 | [UPGRADE §8](./UPGRADE.md#8-常见问题)                                                                          |

## 命令与仓库脚本的对应关系

| 文档里的命令                                                    | 实际定义                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm install` / `pnpm install --frozen-lockfile`               | pnpm 原生命令（仓库有 `pnpm-lock.yaml`）                                                          |
| `pnpm dev`                                                      | `vp run -r --parallel dev`（web :5173 / api :3000）                                               |
| `pnpm build`                                                    | `vp run --filter @medihub/web build && vp run --filter @medihub/server build`（先 web 后 server） |
| `pnpm db:migrate`                                               | `vp run --filter @medihub/server db:migrate`                                                      |
| `pnpm --filter @medihub/server reset-password --list`           | `apps/server` 的 `reset-password` 脚本                                                            |
| 生产启动                                                        | 等价 `apps/server` 的 `start`：`node --env-file-if-exists=.env dist/index.mjs`                    |
| `pnpm check` / `pnpm test` / `pnpm test:e2e` / `pnpm run ready` | `vp check` / `vp test` / `vp run --filter @medihub/web test:e2e` / 上述组合链                     |

> 生产部署只需要 `pnpm install --frozen-lockfile`、`pnpm db:migrate`、`pnpm build` 三步
> （一键脚本会自动做完）；`check` / `test` / `test:e2e` 属于本地与 CI。
> **管理员账号**只能通过 `/install` 或管理端创建——`v1.10.0` 起已移除 `seed` 脚本与演示数据。
