# 在 1Panel 服务器上一键安装

适用：已安装 1Panel 的 Linux 服务器（Debian / Ubuntu / Rocky / Alma / CentOS Stream）。
脚本会装好 Node.js 24、pnpm、系统服务，并把网站跑起来；OnlyOffice 参数可以稍后填。

> 需要 root 或 sudo。下载依赖 + 构建通常 **5–15 分钟**（取决于服务器带宽；国内机器可能更久）。
> 脚本**不会**替你创建 1Panel 站点与证书，也不会改你的 Nginx 配置——反向代理那一步需要在面板里点一次。

## 一条命令（真正的一行）

```bash
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh | sudo bash -s -- --url https://medihub.summerecho.cn --seed
```

不想用管道，也可以先下载再执行（脚本内容可先看一眼）：

```bash
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh -o install-medihub.sh
less install-medihub.sh   # 看完再跑
sudo bash install-medihub.sh --url https://medihub.summerecho.cn --seed
```

- `--url` 换成你准备绑定的域名（还没配 HTTPS 也可以先写 `http://服务器IP:3000`，之后用 `--update` 或直接改 `.env`）。
- `--seed` 会写入演示数据并创建超级管理员 `root@medihub.local`，**随机密码在安装结束时打印一次**。
  不想写演示数据就去掉 `--seed`，之后手动建账号。

安装完成后：

1. 在 1Panel「网站 → 反向代理」新建站点，目标 `http://127.0.0.1:3000`，申请 HTTPS；
2. **同站点配置里加上传与超时设置**（否则大视频/PPT 上传会 413 或 502）：

   ```nginx
   client_max_body_size 300m;
   proxy_read_timeout 300s;
   proxy_set_header X-Forwarded-For $remote_addr;
   ```

   Better Auth 按客户端 IP 限流，`X-Forwarded-For` 只接受单值；详细原因见
   [DEPLOY-1PANEL.md §9](./DEPLOY-1PANEL.md)。1Panel 的「网站 → 配置」里可直接加这几行。

3. 打开你的域名，用 root 登录（没加 `--seed` 则打开 `/install` 完成初始化）；
4. 到「我的 → 修改密码」改掉初始密码。

## 方式二：网页安装向导（不写命令行参数）

如果安装时**没有**加 `--seed`，脚本不会创建账号，站点会处于「未初始化」状态：

1. 部署完成后直接打开 `https://你的域名/install`（登录页也会出现「前往安装向导」按钮）；
2. 填写超级管理员姓名 / 邮箱 / 密码，可选填写 OnlyOffice 地址与 JWT 密钥；
3. 点「完成安装」→ 看到「配置完成」后自动跳到登录页，用刚创建的账号登录即可。

向导只在「系统还没有任何账号」时可用；安装完成后该接口返回 409，不会被用来重置管理员。
OnlyOffice 参数写入 `.env` 后需要重启服务才生效（页面会提示）。

## 常用参数

| 参数                                       | 说明                                              |
| ------------------------------------------ | ------------------------------------------------- |
| `--dir /opt/medihub`                       | 安装目录（默认 `/opt/medihub`）                   |
| `--url https://...`                        | 写入 `BETTER_AUTH_URL`，必须是浏览器访问地址      |
| `--port 3000`                              | API 端口（默认 3000，不对公网暴露）               |
| `--tag v1.1.0`                             | 指定版本（默认取最新 Release）                    |
| `--seed`                                   | 写入演示数据 + 超级管理员（随机密码）             |
| `--update`                                 | 升级现有安装，保留 `.env`、SQLite、素材与升级备份 |
| `--onlyoffice-url` / `--onlyoffice-secret` | OnlyOffice 地址与 JWT 密钥，可后填                |
| `--dry-run`                                | 只打印要执行的操作，不改系统                      |
| `--yes`                                    | 非交互确认                                        |

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
  注意：**命令行升级失败时不会自动回滚**，脚本会把升级前的数据库备份到
  `.updates/backups/manual-<时间>/db.sqlite`，需要时手动恢复：

  ```bash
  sudo systemctl stop medihub
  sudo cp /opt/medihub/.updates/backups/manual-<时间>/db.sqlite /opt/medihub/apps/server/local.db
  sudo rm -rf /opt/medihub/apps/server/dist
  sudo bash install-medihub.sh --update --tag <上一个版本>   # 重新铺回旧版本
  ```

  （系统磁盘上的完整自动回滚只在「系统管理 → 版本与升级」的在线升级里提供。）

升级与回滚细节见 [UPGRADE.md](UPGRADE.md)。

> `--dry-run` 不会修改系统、不会下载源码包（但仍会执行一次 GitHub 版本查询）；
> `--update` 与 `--seed` 不能同时使用（避免重复写入演示数据）。

## 脚本做了什么

1. 安装 `curl/tar/xz`（缺什么补什么）；
2. 安装 Node.js 24 与 pnpm 12（已有且版本足够则跳过）；
3. 创建系统用户 `medihub`；
4. 从 GitHub 下载目标版本源码包，解压到安装目录（保留 `.env`、`local.db`、`storage`、`.updates`）；
5. 生成 `.env`（含随机 `BETTER_AUTH_SECRET`、在线升级配置、OnlyOffice 占位）；
6. `pnpm install --frozen-lockfile` + `pnpm run build`；
7. 执行数据库迁移，可选写入演示数据；
8. 写入 systemd 服务 `medihub.service`（开机自启、崩溃自动重启）；
9. 启动并轮询 `/api/health`，失败时打印最近日志。

## 常见问题

| 现象                      | 处理                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| 下载源码包失败            | 服务器访问 GitHub 受限；可先在能上网的机器下载 `tar.gz`，解压后手动 `--dir` 指向目录执行安装 |
| `pnpm: command not found` | 检查 `node -v` 是否 ≥24；脚本安装在 `/usr/local/bin`，确认 PATH 包含它                       |
| 端口被占用                | `ss -lntp \| grep 3000` 找到占用进程，或安装时用 `--port 3001`                               |
| 健康检查失败              | `journalctl -u medihub -n 80 --no-pager` 看日志；常见是 `.env` 缺少 `BETTER_AUTH_SECRET`     |
| 登录后 403 / 域名不对     | `BETTER_AUTH_URL` 必须与浏览器地址完全一致（含 https）；改完重启服务                         |
| OnlyOffice 编辑报错       | 检查 Document Server 与本站的双向可达性，以及 JWT 密钥是否一致                               |

## 卸载

```bash
sudo systemctl disable --now medihub
sudo rm /etc/systemd/system/medihub.service
sudo rm -rf /opt/medihub   # 确认数据已备份
```
