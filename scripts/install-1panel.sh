#!/usr/bin/env bash
#
# 医档通 MediHub · 1Panel 服务器一键安装 / 升级脚本
#
# 适用：Debian 12 / Ubuntu 22.04+ / Rocky / Alma / CentOS Stream 等常见发行版，
#       Node.js 24 + pnpm 12 + systemd。
# 不适用：Docker 镜像部署（容器内没有可写安装目录）、Windows。
#
# 用法（首次安装）：
#   sudo bash install-1panel.sh --url https://medihub.example.com --seed
#
# 升级到最新 Release（保留 .env / 数据库 / 素材 / 升级备份）：
#   sudo bash install-1panel.sh --update
#
# 常用参数：
#   --dir /opt/medihub          安装目录（默认 /opt/medihub）
#   --tag v1.1.0                指定版本（默认最新 Release）
#   --url https://...           浏览器访问地址（写入 BETTER_AUTH_URL）
#   --port 3000                 API 端口（默认 3000）
#   --user medihub              运行服务的系统用户
#   --seed                      创建超级管理员，随机密码打印一次
#   --onlyoffice-url URL        OnlyOffice Document Server 地址（可后填）
#   --onlyoffice-secret SECRET  OnlyOffice JWT 密钥（可后填）
#   --update                    升级现有安装（保留数据）
#   --dry-run                   只打印将执行的操作，不改动系统
#   --yes                       非交互确认
#
# 全部逻辑幂等：重复执行会保留 .env、SQLite、storage 与 .updates 备份。
set -euo pipefail

REPO="${MEDIHUB_REPO:-Eunsolfs/medihub}"
DIR="/opt/medihub"
TAG=""
SITE_URL=""
APP_PORT="3000"
RUN_USER="medihub"
NODE_VERSION="${NODE_VERSION:-24.22.1}"
PNPM_VERSION="${PNPM_VERSION:-12.15.0}"
SEED="false"
UPDATE_MODE="false"
DRY_RUN="false"
ASSUME_YES="false"
ONLYOFFICE_URL=""
ONLYOFFICE_SECRET=""
SERVICE_NAME="medihub"

log() { printf '\033[1;34m[medihub]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[medihub]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[medihub]\033[0m %s\n' "$*" >&2; exit 1; }
confirm() {
  if [[ "$ASSUME_YES" == "true" || "$DRY_RUN" == "true" || ! -t 0 ]]; then
    return 0
  fi
  local reply
  read -r -p "$1 [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || fail "已取消"
}
run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  + %s\n' "$*"
    return 0
  fi
  "$@"
}

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --url) SITE_URL="$2"; shift 2 ;;
    --port) APP_PORT="$2"; shift 2 ;;
    --user) RUN_USER="$2"; shift 2 ;;
    --seed) SEED="true"; shift ;;
    --update) UPDATE_MODE="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    --onlyoffice-url) ONLYOFFICE_URL="$2"; shift 2 ;;
    --onlyoffice-secret) ONLYOFFICE_SECRET="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) fail "未知参数：$1（--help 查看用法）" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "请用 root 或 sudo 运行：sudo bash $0"
[[ "$DRY_RUN" == "true" ]] || command -v systemctl >/dev/null || fail "未找到 systemd"

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) fail "暂不支持的 CPU 架构：$ARCH" ;;
esac

DISTRO="unknown"
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  DISTRO="$(. /etc/os-release && echo "$ID")"
fi

install_system_deps() {
  log "安装系统依赖（curl / tar / xz / ca-certificates）"
  case "$DISTRO" in
    debian|ubuntu)
      run apt-get update -qq
      run apt-get install -y -qq curl tar xz-utils ca-certificates jq
      ;;
    rocky|almalinux|centos|rhel|fedora)
      run dnf install -y -q curl tar xz ca-certificates jq
      ;;
    *)
      if command -v apt-get >/dev/null; then
        run apt-get update -qq && run apt-get install -y -qq curl tar xz-utils ca-certificates jq
      elif command -v dnf >/dev/null; then
        run dnf install -y -q curl tar xz ca-certificates jq
      else
        warn "未识别的发行版 $DISTRO，请确保 curl/tar/xz 已安装"
      fi
      ;;
  esac
}

ensure_node() {
  local current=""
  if command -v node >/dev/null; then
    current="$(node -v 2>/dev/null | sed 's/^v//')"
  fi

  local major="${current%%.*}"
  if [[ -n "$current" && "$major" -ge 24 ]]; then
    log "已安装 Node.js v$current，跳过"
    return
  fi

  log "安装 Node.js v$NODE_VERSION"
  local tarball="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  local url="https://nodejs.org/dist/v$NODE_VERSION/$tarball"
  run curl -fsSL "$url" -o "/tmp/$tarball"
  run tar -xJf "/tmp/$tarball" -C /usr/local --strip-components=1 --no-same-owner

  if [[ "$DRY_RUN" != "true" ]]; then
    node -v >/dev/null || fail "Node.js 安装失败"
  fi
}

ensure_pnpm() {
  if command -v pnpm >/dev/null; then
    local current
    current="$(pnpm -v 2>/dev/null | cut -d. -f1)"
    if [[ "$current" =~ ^[0-9]+$ && "$current" -ge 10 ]]; then
      log "已安装 pnpm $(pnpm -v)，跳过"
      return
    fi
  fi

  log "安装 pnpm $PNPM_VERSION"
  run npm install -g "pnpm@$PNPM_VERSION" --no-fund --no-audit
}

ensure_user() {
  if id -u "$RUN_USER" >/dev/null 2>&1; then
    log "运行用户 $RUN_USER 已存在"
    return
  fi

  log "创建系统用户 $RUN_USER"
  run useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$RUN_USER"
}

latest_tag() {
  local tag
  tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"

  if [[ -z "$tag" ]]; then
    tag="$(curl -fsSL "https://api.github.com/repos/$REPO/tags" \
      | sed -n 's/.*"name": *"\(v[0-9][^"]*\)".*/\1/p' | head -n1)"
  fi

  [[ -n "$tag" ]] || fail "无法从 GitHub 获取版本号，请检查服务器网络或手动指定 --tag"
  echo "$tag"
}

fetch_release() {
  local tag="$1" tmp="$2"
  local candidates=(
    "https://codeload.github.com/$REPO/tar.gz/refs/tags/$tag"
    "https://codeload.github.com/$REPO/tar.gz/refs/heads/main"
  )

  for url in "${candidates[@]}"; do
    log "下载源码包：$url"
    if curl -fsSL "$url" -o "$tmp/release.tar.gz"; then
      break
    fi
  done

  [[ -s "$tmp/release.tar.gz" ]] || fail "源码包下载失败，请检查 GitHub 网络或 tag"

  run tar -xzf "$tmp/release.tar.gz" -C "$tmp"
  local extracted
  extracted="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -n1)"
  echo "$extracted"
}

stop_service_if_running() {
  if systemctl list-unit-files | grep -q "^$SERVICE_NAME.service"; then
    log "停止现有 $SERVICE_NAME 服务，准备切换代码"
    run systemctl stop "$SERVICE_NAME" || true
  fi
}

preserve_data() {
  local source="$1"
  log "保留现有配置与数据（.env / SQLite / storage / .updates）"
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  + 保留 %s 下的数据文件\n' "$DIR"
    return
  fi

  mkdir -p "$DIR/apps/server"
  for item in ".env" "apps/server/local.db" "apps/server/storage" ".updates"; do
    if [[ -e "$DIR/$item" ]]; then
      mkdir -p "$(dirname "$source/$item")"
      cp -a "$DIR/$item" "$source/$item"
    fi
  done
}

apply_release() {
  local source="$1"
  log "同步代码到 $DIR"

  run mkdir -p "$DIR"
  if command -v rsync >/dev/null; then
    run rsync -a --delete \
      --exclude '.env' \
      --exclude 'local.db' \
      --exclude 'storage' \
      --exclude '.updates' \
      --exclude 'node_modules' \
      --exclude '.local' \
      --exclude '.pnpm-store' \
      "$source/" "$DIR/"
  else
    run cp -a "$source/." "$DIR/"
  fi
}

set_env_kv() {
  local key="$1" value="$2" file="$3"

  if grep -q "^${key}=" "$file"; then
    run sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$file"
  elif [[ "$DRY_RUN" != "true" ]]; then
    printf '%s="%s"\n' "$key" "$value" >>"$file"
  fi
}

write_env() {
  local env_file="$DIR/apps/server/.env"

  if [[ -f "$env_file" ]]; then
    log "检测到现有 .env，保留密钥与已有配置，仅补齐缺失项"
    if [[ "$DRY_RUN" != "true" ]]; then
      cp -a "$env_file" "$env_file.bak-$(date +%Y%m%d-%H%M%S)"
    fi
  else
    log "生成 $env_file"
    local secret
    secret="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    local url="${SITE_URL:-http://127.0.0.1:$APP_PORT}"

    run mkdir -p "$DIR/apps/server"
    if [[ "$DRY_RUN" == "true" ]]; then
      printf '  + 写入 .env（BETTER_AUTH_URL=%s PORT=%s）\n' "$url" "$APP_PORT"
      return
    fi

    cat > "$env_file" <<EOF
# 由 scripts/install-1panel.sh 生成，可自行修改；修改后 systemctl restart $SERVICE_NAME
BETTER_AUTH_SECRET="$secret"
BETTER_AUTH_URL="$url"
DATABASE_URL="./local.db"
PORT="$APP_PORT"
STORAGE_ROOT="./storage"
UPLOAD_MAX_BYTES="268435456"

# 在线升级（root 在「系统管理 → 版本与升级」操作）
UPDATE_ENABLED="true"
UPDATE_WORKDIR="$DIR"
UPDATE_RESTART_CMD="systemctl restart $SERVICE_NAME"
UPDATE_HEALTH_URL="http://127.0.0.1:$APP_PORT/api/health"
UPDATE_DB_PATH="apps/server/local.db"
UPDATE_KEEP_BACKUPS="3"

# OnlyOffice：装上 Document Server 后填这两项，再重启服务
ONLYOFFICE_URL="$ONLYOFFICE_URL"
ONLYOFFICE_JWT_SECRET="$ONLYOFFICE_SECRET"

# 可选：LibreOffice 转 PDF（docx/xlsx/pptx 预览）
# SOFFICE_PATH="/usr/bin/soffice"

# 可选：pnpm seed 时创建的超级管理员
# SEED_ROOT_EMAIL="root@medihub.local"
# SEED_ROOT_PASSWORD="Medihub@2026"
EOF
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    return
  fi

  # 升级旧安装时补齐在线升级与访问地址等配置，避免手工改 .env。
  local url="${SITE_URL:-http://127.0.0.1:$APP_PORT}"
  set_env_kv BETTER_AUTH_URL "$url" "$env_file"
  set_env_kv PORT "$APP_PORT" "$env_file"
  set_env_kv UPDATE_ENABLED "true" "$env_file"
  set_env_kv UPDATE_WORKDIR "$DIR" "$env_file"
  set_env_kv UPDATE_RESTART_CMD "systemctl restart $SERVICE_NAME" "$env_file"
  set_env_kv UPDATE_HEALTH_URL "http://127.0.0.1:$APP_PORT/api/health" "$env_file"
  set_env_kv UPDATE_DB_PATH "apps/server/local.db" "$env_file"
  set_env_kv UPDATE_KEEP_BACKUPS "3" "$env_file"

  if [[ -n "$ONLYOFFICE_URL" ]]; then
    set_env_kv ONLYOFFICE_URL "$ONLYOFFICE_URL" "$env_file"
  fi

  if [[ -n "$ONLYOFFICE_SECRET" ]]; then
    set_env_kv ONLYOFFICE_JWT_SECRET "$ONLYOFFICE_SECRET" "$env_file"
  fi

  chown "$RUN_USER:$RUN_USER" "$env_file"
}

install_deps_and_build() {
  log "安装依赖并构建（首次约 2-5 分钟）"
  run runuser -u "$RUN_USER" -- bash -lc "cd '$DIR' && pnpm install --frozen-lockfile"
  run runuser -u "$RUN_USER" -- bash -lc "cd '$DIR' && pnpm run build"
}

migrate_and_seed() {
  log "初始化数据库"
  run runuser -u "$RUN_USER" -- bash -lc "cd '$DIR' && pnpm run db:migrate"

  if [[ "$SEED" == "true" ]]; then
    local email="${SEED_ROOT_EMAIL:-root@medihub.local}"
    local password="${SEED_ROOT_PASSWORD:-$(openssl rand -base64 12 2>/dev/null | tr -d '/+=' | head -c 14)}"

    log "写入演示数据与超级管理员 $email"
    run runuser -u "$RUN_USER" -- bash -lc \
      "cd '$DIR' && SEED_ROOT_EMAIL='$email' SEED_ROOT_PASSWORD='$password' pnpm run seed"
    printf '\n  超级管理员：%s\n  初始密码：%s\n  （请登录后到「我的 → 修改密码」立即修改）\n\n' "$email" "$password"
  fi
}

write_service() {
  local node_bin
  node_bin="$(command -v node)"
  local service_file="/etc/systemd/system/$SERVICE_NAME.service"

  log "写入 systemd 服务：$service_file"
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  + 写入 %s（User=%s, WorkingDirectory=%s/apps/server）\n' "$service_file" "$RUN_USER" "$DIR"
    return
  fi

  cat > "$service_file" <<EOF
[Unit]
Description=MediHub (医档通)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$DIR/apps/server
EnvironmentFile=$DIR/apps/server/.env
Environment=NODE_ENV=production
ExecStart=$node_bin $DIR/apps/server/dist/index.mjs
Restart=always
RestartSec=3
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null
}

start_and_check() {
  log "启动服务并等待健康检查"
  run systemctl restart "$SERVICE_NAME"

  if [[ "$DRY_RUN" == "true" ]]; then
    return
  fi

  local ok="false"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$APP_PORT/api/health" >/dev/null 2>&1; then
      ok="true"
      break
    fi
    sleep 1
  done

  [[ "$ok" == "true" ]] || {
    warn "健康检查未通过，最近日志："
    journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
    fail "启动失败，请根据日志排查（常见：端口被占用、.env 缺少 BETTER_AUTH_SECRET）"
  }
}

print_summary() {
  local tag="$1"
  local url="${SITE_URL:-http://<服务器IP>:$APP_PORT}"

  cat <<EOF

────────────────────────────────────────────
 医档通 MediHub 安装完成（$tag）
────────────────────────────────────────────
 安装目录：$DIR
 运行用户：$RUN_USER
 服务名  ：$SERVICE_NAME（systemctl status $SERVICE_NAME）
 监听端口：127.0.0.1:$APP_PORT
 版本接口：curl http://127.0.0.1:$APP_PORT/api/health

 下一步：
 1. 在 1Panel「网站」里新建反向代理，目标 http://127.0.0.1:$APP_PORT，并申请 HTTPS。
 2. 浏览器打开：$url
 3. OnlyOffice：编辑 $DIR/apps/server/.env 填入
    ONLYOFFICE_URL / ONLYOFFICE_JWT_SECRET，然后
    systemctl restart $SERVICE_NAME（或用系统管理页的「重新检测」确认）
 4. 日常升级：root 登录 → 系统管理 → 版本与升级；
    或命令行：sudo bash install-1panel.sh --update

 防火墙：若使用 1Panel 防火墙/安全组，只需放行 80/443；$APP_PORT 不必对公网开放。
────────────────────────────────────────────

EOF
}

main() {
  log "医档通 MediHub 安装脚本 · 仓库 $REPO"
  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN：只打印操作，不修改系统"
  fi

  if [[ "$UPDATE_MODE" == "true" ]]; then
    confirm "将升级 $DIR 到最新版本并重启服务，继续？"
  else
    confirm "将安装医档通到 $DIR 并启动 systemd 服务，继续？"
  fi

  install_system_deps
  ensure_node
  ensure_pnpm
  ensure_user

  local tag="${TAG:-$(latest_tag)}"
  if [[ "$UPDATE_MODE" == "true" && -z "$TAG" ]]; then
    tag="$(latest_tag)"
  fi
  log "目标版本：$tag"

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  local source
  source="$(fetch_release "$tag" "$tmp")"
  [[ -n "$source" ]] || fail "解压源码包失败"

  stop_service_if_running

  # 升级前留一份数据库备份（与在线升级共用 .updates/backups 约定）
  if [[ "$UPDATE_MODE" == "true" && -f "$DIR/apps/server/local.db" && "$DRY_RUN" != "true" ]]; then
    local stamp backup_db
    stamp="$(date +%Y%m%d-%H%M%S)"
    backup_db="$DIR/.updates/backups/manual-$stamp"
    mkdir -p "$backup_db"
    cp -a "$DIR/apps/server/local.db" "$backup_db/db.sqlite"
    log "已备份数据库到 $backup_db"
  fi

  preserve_data "$source"
  apply_release "$source"
  write_env
  run chown -R "$RUN_USER:$RUN_USER" "$DIR"
  install_deps_and_build
  migrate_and_seed
  write_service
  start_and_check
  chown -R "$RUN_USER:$RUN_USER" "$DIR" 2>/dev/null || true

  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN 完成：以上为将执行的操作"
    return
  fi

  print_summary "$tag"
}

main "$@"
