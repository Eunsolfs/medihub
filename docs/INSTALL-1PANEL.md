# 在 1Panel 服务器上一键安装

适用：已安装 1Panel 的 Linux 服务器（Debian / Ubuntu / Rocky / Alma / CentOS Stream）。
脚本会装好 Node.js 24、pnpm、系统服务，并把网站跑起来；OnlyOffice 参数可以稍后填。

> 需要 root 或 sudo。全程约 3–6 分钟（取决于服务器带宽，构建占大头）。

## 一条命令

```bash
curl -fsSL https://raw.githubusercontent.com/Eunsolfs/medihub/main/scripts/install-1panel.sh -o install-medihub.sh
sudo bash install-medihub.sh --url https://medihub.example.com --seed
```

- `--url` 换成你准备绑定的域名（还没配 HTTPS 也可以先写 `http://服务器IP:3000`，之后用 `--update` 或直接改 `.env`）。
- `--seed` 会写入演示数据并创建超级管理员 `root@medihub.local`，**随机密码在安装结束时打印一次**。
  不想写演示数据就去掉 `--seed`，之后手动建账号。

安装完成后：

1. 在 1Panel「网站 → 反向代理」新建站点，目标 `http://127.0.0.1:3000`，申请 HTTPS；
2. 打开你的域名，用 root 登录；
3. 到「我的 → 修改密码」改掉初始密码。

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

## 日常升级

- 界面：root 登录 → 系统管理 → 版本与升级 → 检查更新 → 升级（失败自动回滚）；
- 命令行：`sudo bash install-medihub.sh --update`（保留数据，升级前自动备份数据库）。

升级与回滚细节见 [UPGRADE.md](UPGRADE.md)。

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
