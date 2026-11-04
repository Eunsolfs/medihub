# 1Panel 首次部署图解教程（v1.10.0 纯净版）

面向第一次把医档通部署到 1Panel 服务器的人。照着做即可，不需要先懂 Node.js 或 Nginx。

> **纯净版说明**：v1.10.0 起安装脚本**不创建任何账号、不写入演示数据**。
> 装完是一台空库：先打开 `/install` 创建超级管理员，再登录创建第一个科室。
> 旧教程里的 `--seed` 已移除，不要再用。

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
- 建议固定版本时加 `--tag v1.10.0`；不写默认取最新 Release。
- **不要加 `--seed`**：纯净版没有这个参数，脚本会直接提示已移除。

安装过程会：

1. 安装/检查 Node.js 24、pnpm、systemd；
2. 创建 `medihub` 系统用户；
3. 生成 `/opt/medihub/apps/server/.env`（含随机密钥）；
4. 构建 Web + API；
5. 只执行数据库迁移（**不建账号、不写演示数据**）；
6. 写入 `medihub.service` 并启动。

看到下面类似内容说明成功：

```text
医档通 MediHub 安装完成（v1.10.0）
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
{ "status": "ok", "version": "1.10.0" }
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
# 数据库 + 配置
sudo tar czf /root/medihub-backup-$(date +%F).tar.gz \
  -C /opt/medihub/apps/server local.db .env

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
sudo bash install-medihub.sh --update --yes --tag v1.10.0
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

## 14. 相关文档

- [INSTALL-1PANEL.md](./INSTALL-1PANEL.md)：安装脚本全部参数与卸载
- [DEPLOY-1PANEL.md](./DEPLOY-1PANEL.md)：手工部署、Nginx 细节、备份恢复
- [UPGRADE.md](./UPGRADE.md)：在线升级与回滚
- [DOCKER.md](./DOCKER.md)：本地 Docker 试运行
- [ONLYOFFICE.md](./ONLYOFFICE.md)：需要 Office 在线编辑时再看
