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
#   --port 3000                 API 端口（默认自动选择空闲端口）
#   --user medihub              运行服务的系统用户
#   --seed                      创建超级管理员，随机密码打印一次
#   --onlyoffice-url URL        OnlyOffice Document Server 地址（可后填）
#   --onlyoffice-secret SECRET  OnlyOffice JWT 密钥（可后填）
#   --update                    升级现有安装（保留数据）
#   --dry-run                   只打印将执行的操作，不改动系统
#   --yes                       非交互确认
#   --purge                     清理一次失败/不再需要的安装（删服务、目录与用户）
#   --force                     与 --purge 连用：即使已有数据库也强制删除
#
# 全部逻辑幂等：重复执行会保留 .env、SQLite、storage 与 .updates 备份。
set -euo pipefail
trap on_error EXIT

REPO="${MEDIHUB_REPO:-Eunsolfs/medihub}"
DIR="/opt/medihub"
TAG=""
SITE_URL=""
APP_PORT=""
USER_PORT=""
RUN_USER="medihub"
NODE_VERSION="${NODE_VERSION:-24.22.1}"
PNPM_VERSION="${PNPM_VERSION:-12.15.0}"
SEED="false"
UPDATE_MODE="false"
DRY_RUN="false"
ASSUME_YES="false"
PURGE="false"
FORCE="false"
ONLYOFFICE_URL=""
ONLYOFFICE_SECRET=""
SERVICE_NAME="medihub"
TMP_DIR=""
PHASE="准备"
INSTALL_STARTED="false"

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

# 端口是否空闲：优先 ss，其次 netstat，最后用 Node 实际绑定测试。
port_is_free() {
  local port="$1"
  local pattern="[:.]${port}$"

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "$pattern"; then
      return 1
    fi

    return 0
  fi

  if command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "$pattern"; then
      return 1
    fi

    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    if node -e 'const net=require("node:net");const s=net.createServer();s.once("error",()=>process.exit(1));s.listen(Number(process.argv[1]),"0.0.0.0",()=>s.close(()=>process.exit(0)))' "$port" >/dev/null 2>&1; then
      return 0
    fi

    return 1
  fi

  # DRY-RUN 且系统没有任何检测工具时，不阻塞预览。
  [[ "$DRY_RUN" == "true" ]]
}

select_free_port() {
  local attempt port

  # 20000-29999：避开 80/443/3000/8080 等常被面板或开发服务器占用的端口。
  for ((attempt = 1; attempt <= 100; attempt += 1)); do
    port=$((20000 + RANDOM % 10000))

    if port_is_free "$port"; then
      echo "$port"
      return 0
    fi
  done

  fail "连续尝试 100 次都没有找到空闲端口，请用 --port 手动指定"
}

resolve_port() {
  local env_file="$DIR/apps/server/.env"
  local existing=""

  if [[ -n "$USER_PORT" ]]; then
    if ! port_is_free "$USER_PORT"; then
      fail "端口 $USER_PORT 已被占用，请换一个，或去掉 --port 让脚本自动选择"
    fi

    APP_PORT="$USER_PORT"
    log "使用指定端口：$APP_PORT"
    return 0
  fi

  if [[ -f "$env_file" ]]; then
    existing="$(sed -n 's/^PORT="\{0,1\}\([0-9]\+\)"\{0,1\}$/\1/p' "$env_file" | head -n1)"
  fi

  if [[ -n "$existing" ]]; then
    if port_is_free "$existing"; then
      APP_PORT="$existing"
      log "沿用现有 .env 里的端口：$APP_PORT"
      return 0
    fi

    warn "现有端口 $existing 已被占用，改为自动选择"
  fi

  APP_PORT="$(select_free_port)"
  log "自动选择端口：$APP_PORT"
}

on_error() {
  local code=$?

  if [[ "$code" -eq 0 ]]; then
    return 0
  fi

  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi

  if [[ "$INSTALL_STARTED" != "true" ]]; then
    exit "$code"
  fi

  # 失败时不要让残留的半成品服务继续跑。
  if command -v systemctl >/dev/null && systemctl list-unit-files | grep -q "^$SERVICE_NAME.service"; then
    systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi

  printf '\n' >&2
  warn "安装/升级在「$PHASE」阶段失败（退出码 $code）。"
  warn "已完成的文件与配置保留在 $DIR，数据库/素材不会被自动删除；修复原因后可直接重跑同一命令（幂等）。"
  warn "想彻底清掉这次残留：sudo bash $0 --purge --yes（有数据库时必须再加 --force）"
  exit "$code"
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
    --port) USER_PORT="$2"; shift 2 ;;
    --user) RUN_USER="$2"; shift 2 ;;
    --seed) SEED="true"; shift ;;
    --update) UPDATE_MODE="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --yes|-y) ASSUME_YES="true"; shift ;;
    --purge) PURGE="true"; shift ;;
    --force) FORCE="true"; shift ;;
    --onlyoffice-url) ONLYOFFICE_URL="$2"; shift 2 ;;
    --onlyoffice-secret) ONLYOFFICE_SECRET="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) fail "未知参数：$1（--help 查看用法）" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "请用 root 或 sudo 运行：sudo bash $0"
[[ "$DRY_RUN" == "true" ]] || command -v systemctl >/dev/null || fail "未找到 systemd"
SYSTEMCTL_BIN="$(command -v systemctl 2>/dev/null || echo /usr/bin/systemctl)"
[[ "$DIR" == /* && "$DIR" != "/" ]] || fail "--dir 必须是绝对路径，且不能是 /"

# 参数校验：早失败比装到一半失败好。
if [[ -n "$SITE_URL" ]]; then
  [[ "$SITE_URL" =~ ^https?:// ]] || fail "--url 必须以 http:// 或 https:// 开头"
  SITE_URL="${SITE_URL%/}"
fi

if [[ -n "$USER_PORT" ]]; then
  [[ "$USER_PORT" =~ ^[0-9]+$ ]] || fail "--port 必须是数字"
  [[ "$USER_PORT" -ge 1 && "$USER_PORT" -le 65535 ]] || fail "--port 超出范围（1-65535）"
fi

if [[ "$UPDATE_MODE" == "true" && "$SEED" == "true" ]]; then
  fail "--update 用于升级现有安装，不要再叠加 --seed（会重复写入演示数据）"
fi

if [[ -n "$ONLYOFFICE_URL" && ! "$ONLYOFFICE_URL" =~ ^https?:// ]]; then
  fail "--onlyoffice-url 必须以 http:// 或 https:// 开头"
fi

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
      run apt-get install -y -qq curl tar xz-utils ca-certificates sudo
      ;;
    rocky|almalinux|centos|rhel|fedora)
      run dnf install -y -q curl tar xz ca-certificates sudo
      ;;
    *)
      if command -v apt-get >/dev/null; then
        run apt-get update -qq && run apt-get install -y -qq curl tar xz-utils ca-certificates sudo
      elif command -v dnf >/dev/null; then
        run dnf install -y -q curl tar xz ca-certificates sudo
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

  # 版本至少 24.22.1（与仓库 engines.node 对齐）；`sort -V -C` 判断已排序即 current >= 目标。
  if [[ -n "$current" ]] &&
    printf '%s\n%s\n' "$NODE_VERSION" "$current" | sort -V -C; then
    local existing
    existing="$(command -v node)"

    if [[ "$existing" != "/usr/local/bin/node" ]]; then
      warn "检测到 Node.js 位于 $existing；systemd 会使用该路径，请确保 $RUN_USER 用户可执行"
    fi

    log "已安装 Node.js v$current，跳过"
    return
  fi

  log "安装 Node.js v$NODE_VERSION"
  local tarball="node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
  local url="https://nodejs.org/dist/v$NODE_VERSION/$tarball"
  run curl -fsSL "$url" -o "/tmp/$tarball"
  run tar -xJf "/tmp/$tarball" -C /usr/local --strip-components=1 --no-same-owner

  if [[ "$DRY_RUN" != "true" ]]; then
    local installed_major
    installed_major="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"

    [[ "${installed_major:-0}" -ge 24 ]] ||
      fail "Node.js 安装后版本不是 24.x（当前：$(node -v 2>/dev/null || echo 无)），请检查 PATH 中是否有旧版 node 抢先"
  fi
}

ensure_pnpm() {
  if command -v pnpm >/dev/null; then
    local current
    current="$(pnpm -v 2>/dev/null)"

    # 至少 PNPM_VERSION（与仓库 engines.pnpm 对齐）。
    if [[ -n "$current" ]] &&
      printf '%s\n%s\n' "$PNPM_VERSION" "$current" | sort -V -C; then
      log "已安装 pnpm $current，跳过"
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

  # DRY-RUN 不访问网络、不下载。
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  + 下载 https://codeload.github.com/%s/tar.gz/refs/tags/%s\n' "$REPO" "$tag"
    echo "$tmp/dry-run"
    return
  fi

  local url="https://codeload.github.com/$REPO/tar.gz/refs/tags/$tag"
  log "下载源码包：$url"

  curl -fsSL "$url" -o "$tmp/release.tar.gz" ||
    fail "下载 $tag 的源码包失败：请确认 tag 存在、服务器能访问 codeload.github.com，或手动指定 --tag"

  run tar -xzf "$tmp/release.tar.gz" -C "$tmp"
  local extracted
  extracted="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -n1)"

  [[ -n "$extracted" ]] || fail "解压源码包失败"
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
    # 排除项必须锚定到具体路径：`--exclude storage` 会把 packages/storage 一起排除，
    # 导致 @medihub/storage 链接缺失、构建与 seed 直接失败。
    run rsync -a --delete \
      --exclude '/apps/server/.env' \
      --exclude '/apps/server/local.db' \
      --exclude '/apps/server/storage' \
      --exclude '/.updates' \
      --exclude '/.local' \
      --exclude '/.pnpm-store' \
      --exclude 'node_modules' \
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
UPDATE_RESTART_CMD="sudo -n $SYSTEMCTL_BIN restart $SERVICE_NAME"
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
  set_env_kv UPDATE_RESTART_CMD "sudo -n $SYSTEMCTL_BIN restart $SERVICE_NAME" "$env_file"
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
  # .env 里有会话密钥与 OnlyOffice JWT，只允许服务用户读取。
  chmod 600 "$env_file"
}

install_deps_and_build() {
  log "安装依赖并构建（首次约 2-5 分钟）"
  # 显式补 /usr/local/bin：脚本把 Node/pnpm 装在这里，runuser 的登录 shell 未必包含。
  run runuser -u "$RUN_USER" -- bash -lc \
    "export PATH=/usr/local/bin:\$PATH; cd '$DIR' && pnpm install --frozen-lockfile"

  if [[ "$DRY_RUN" != "true" ]]; then
    verify_workspace_links
  fi

  run runuser -u "$RUN_USER" -- bash -lc \
    "export PATH=/usr/local/bin:\$PATH; cd '$DIR' && pnpm run build"
}

verify_source_tree() {
  [[ -f "$DIR/packages/storage/package.json" ]] ||
    fail "源码包缺少 packages/storage（常见原因：rsync 排除规则把 storage 目录一起排除了）。请重跑修复后的安装脚本"

  local pkg
  for pkg in "$DIR"/packages/*/package.json; do
    [[ -f "$pkg" ]] || fail "源码包缺少 workspace 包：$pkg"
  done
}

verify_workspace_links() {
  local pkg name missing=""

  for pkg in "$DIR"/packages/*/package.json; do
    [[ -f "$pkg" ]] || continue
    name="$(sed -n 's/.*"name": *"\([^"]*\)".*/\1/p' "$pkg" | head -n1)"

    # pnpm 默认 isolated：workspace 链接在各自消费方的 node_modules，不要把根目录当成唯一位置。
    if [[ -z "$name" ]] ||
      { [[ ! -e "$DIR/node_modules/$name" ]] &&
        [[ ! -e "$DIR/apps/server/node_modules/$name" ]] &&
        [[ ! -e "$DIR/apps/web/node_modules/$name" ]]; }; then
      missing="$missing ${name:-$pkg}"
    fi
  done

  [[ -z "$missing" ]] ||
    fail "工作区包未正确链接：$missing。请检查 $DIR/packages 是否完整，然后重跑安装脚本"

  # 真实解析一次，防止「文件在但 exports/链接是坏的」拖到 seed 才暴露。
  run runuser -u "$RUN_USER" -- bash -lc \
    "export PATH=/usr/local/bin:\$PATH; cd '$DIR/apps/server' && node --input-type=module -e \"await import('@medihub/storage')\""
}

purge_install() {
  [[ "$ASSUME_YES" == "true" ]] || fail "--purge 会删除目录、服务与用户，必须同时加 --yes 确认"

  if [[ -f "$DIR/apps/server/local.db" && "$FORCE" != "true" ]]; then
    fail "检测到数据库 $DIR/apps/server/local.db。确认要删除数据请加 --force"
  fi

  if systemctl list-unit-files 2>/dev/null | grep -q "^$SERVICE_NAME.service"; then
    run systemctl stop "$SERVICE_NAME" || true
    run systemctl disable "$SERVICE_NAME" || true
    run rm -f "/etc/systemd/system/$SERVICE_NAME.service"
  run rm -f "/etc/sudoers.d/medihub-update"
    run systemctl daemon-reload
  fi

  run rm -rf "$DIR"
  if id -u "$RUN_USER" >/dev/null 2>&1; then
    run userdel "$RUN_USER" 2>/dev/null || true
  fi

  log "已清理 $DIR、服务与用户（如存在）。"
}

migrate_and_seed() {
  log "初始化数据库"
  run runuser -u "$RUN_USER" -- bash -lc \
    "export PATH=/usr/local/bin:\$PATH; cd '$DIR' && pnpm run db:migrate"

  if [[ "$SEED" == "true" ]]; then
    local email="${SEED_ROOT_EMAIL:-root@medihub.local}"
    local password="${SEED_ROOT_PASSWORD:-$(openssl rand -base64 12 2>/dev/null | tr -d '/+=' | head -c 14)}"

    log "写入演示数据与超级管理员 $email"
    run runuser -u "$RUN_USER" -- bash -lc \
      "export PATH=/usr/local/bin:\$PATH; cd '$DIR' && SEED_ROOT_EMAIL='$email' SEED_ROOT_PASSWORD='$password' pnpm run seed"
    printf '\n  超级管理员：%s\n  初始密码：%s\n  （请登录后到「我的 → 修改密码」立即修改）\n\n' "$email" "$password"
  fi
}

write_sudoers() {
  local systemctl_bin sudoers_file tmp_file

  systemctl_bin="$SYSTEMCTL_BIN"
  sudoers_file="/etc/sudoers.d/medihub-update"

  if [[ "$DRY_RUN" == "true" ]]; then
    printf '  + 写入 %s（允许 %s 免密重启 %s）\n' "$sudoers_file" "$RUN_USER" "$SERVICE_NAME"
    return
  fi

  if ! command -v sudo >/dev/null 2>&1 || ! command -v visudo >/dev/null 2>&1; then
    warn "未找到 sudo/visudo，在线升级将无法重启服务；请安装 sudo 后重跑脚本"
    return
  fi

  tmp_file="$(mktemp)"
  printf '%s ALL=(root) NOPASSWD: %s restart %s\n' \
    "$RUN_USER" "$systemctl_bin" "$SERVICE_NAME" >"$tmp_file"

  if ! visudo -cf "$tmp_file" >/dev/null 2>&1; then
    rm -f "$tmp_file"
    fail "生成的 sudoers 规则校验失败：$sudoers_file"
  fi

  install -m 440 "$tmp_file" "$sudoers_file"
  rm -f "$tmp_file"
  log "已授权 $RUN_USER 免密执行 systemctl restart $SERVICE_NAME（用于在线升级）"
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
# 在线升级执行器从本服务启动，重启服务时不能被一起杀掉，否则健康检查/回滚会中断。
KillMode=process

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
 3. 首次初始化：打开 $url/install 创建超级管理员（若安装时用了 --seed 可跳过，直接登录）。
 4. OnlyOffice：编辑 $DIR/apps/server/.env 填入
    ONLYOFFICE_URL / ONLYOFFICE_JWT_SECRET，然后
    systemctl restart $SERVICE_NAME（或用系统管理页的「重新检测」确认）
 5. 日常升级：root 登录 → 系统管理 → 版本与升级；
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

  if [[ "$PURGE" == "true" ]]; then
    purge_install
    return
  fi

  if [[ "$UPDATE_MODE" == "true" ]]; then
    confirm "将升级 $DIR 到最新版本并重启服务，继续？"
  else
    confirm "将安装医档通到 $DIR 并启动 systemd 服务，继续？"
  fi

  INSTALL_STARTED="true"

  PHASE="安装系统依赖"
  install_system_deps
  PHASE="安装 Node.js / pnpm"
  ensure_node
  ensure_pnpm
  PHASE="创建运行用户"
  ensure_user

  PHASE="授权在线升级"
  write_sudoers

  PHASE="选择端口"
  resolve_port

  local tag
  if [[ -n "$TAG" ]]; then
    tag="$TAG"
  elif [[ "$DRY_RUN" == "true" ]]; then
    tag="latest"
  else
    tag="$(latest_tag)"
  fi
  log "目标版本：$tag"

  TMP_DIR="$(mktemp -d)"

  local source
  PHASE="下载并解压源码包"
  source="$(fetch_release "$tag" "$TMP_DIR")"
  [[ -n "$source" ]] || fail "解压源码包失败"

  PHASE="停止旧服务"
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
  PHASE="同步代码"
  apply_release "$source"
  if [[ "$DRY_RUN" != "true" ]]; then
    verify_source_tree
  fi
  write_env
  PHASE="安装依赖并构建"
  run chown -R "$RUN_USER:$RUN_USER" "$DIR"
  install_deps_and_build
  PHASE="初始化数据库"
  migrate_and_seed
  PHASE="写入并启动 systemd 服务"
  write_service
  start_and_check
  chown -R "$RUN_USER:$RUN_USER" "$DIR" 2>/dev/null || true

  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
    TMP_DIR=""
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN 完成：以上为将执行的操作"
    return
  fi

  print_summary "$tag"
}

main "$@"






