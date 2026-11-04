#!/usr/bin/env bash
# 医档通 MediHub 容器化一键安装 / 运维脚本
#
# 最简用法（Linux 服务器）：
#   curl -fsSL https://github.com/Eunsolfs/medihub/releases/latest/download/medihub-ops.sh -o /tmp/medihub-ops.sh
#   sudo bash /tmp/medihub-ops.sh install
#
# 常用命令：
#   sudo bash ops.sh install              安装并启动（默认目录 /opt/medihub-docker，端口 8080）
#   sudo bash ops.sh upgrade [tag]        升级到指定版本（默认 latest），升级前自动备份
#   sudo bash ops.sh status               查看状态与健康检查
#   sudo bash ops.sh logs                 跟踪应用日志
#   sudo bash ops.sh backup [备注]        备份 SQLite、素材目录与环境变量
#   sudo bash ops.sh restore <备份文件>   从备份恢复（会二次确认）
#   sudo bash ops.sh rollback             回滚到上一次升级前的镜像
#   sudo bash ops.sh restart              重启应用
#   sudo bash ops.sh uninstall            卸载容器（可选删除数据卷）
#   sudo bash ops.sh menu                 交互式菜单（无参数时默认）
#
# 可通过环境变量覆盖：MH_DIR / MH_IMAGE / MH_PORT / MH_URL / MH_YES / MH_DRY_RUN
set -Eeuo pipefail

SCRIPT_VERSION="1.10.3"
MH_REPO="${MH_REPO:-Eunsolfs/medihub}"
MH_DIR="${MH_DIR:-/opt/medihub-docker}"
IMAGE_REPO="ghcr.io/$(printf '%s' "$MH_REPO" | tr '[:upper:]' '[:lower:]')"
DEFAULT_IMAGE="${IMAGE_REPO}:latest"

ENV_FILE="$MH_DIR/.env"
COMPOSE_FILE="$MH_DIR/docker-compose.yml"
BACKUP_DIR="$MH_DIR/backups"
DATA_VOLUME="medihub_data"
APP_PORT_DEFAULT="8080"
HEALTH_PATH="/api/health"
ENV_CREATED=0
MH_DRY_RUN="${MH_DRY_RUN:-0}"
MH_YES="${MH_YES:-0}"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

info() { printf '%s[信息]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[警告]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() { printf '%s[错误]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
title() { printf '\n%s%s%s\n' "$C_BOLD" "$*" "$C_RESET"; }

ask() {
  local prompt="$1" default="$2" answer=""
  if [ -r /dev/tty ]; then
    printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
    IFS= read -r answer < /dev/tty || answer=""
  fi
  if [ -z "$answer" ]; then printf '%s' "$default"; else printf '%s' "$answer"; fi
}

confirm() {
  local prompt="$1" answer=""
  if [ "$MH_YES" = "1" ]; then
    warn "MH_YES=1，自动确认：$prompt"
    return 0
  fi
  if [ ! -r /dev/tty ]; then
    warn "非交互环境，默认不执行：$prompt"
    return 1
  fi
  printf '%s [y/N]: ' "$prompt" > /dev/tty
  IFS= read -r answer < /dev/tty || answer=""
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

gen_hex() {
  local bytes="$1"
  [ -n "$bytes" ] || bytes=16
  od -An -N"$bytes" -tx1 /dev/urandom | tr -d ' \n'
}

detect_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  if [ -z "$ip" ]; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')" || true
  fi
  if [ -z "$ip" ]; then printf '127.0.0.1'; else printf '%s' "$ip"; fi
}

set_dir() {
  MH_DIR="$1"
  ENV_FILE="$MH_DIR/.env"
  COMPOSE_FILE="$MH_DIR/docker-compose.yml"
  BACKUP_DIR="$MH_DIR/backups"
}

need_docker() {
  if [ "$MH_DRY_RUN" = "1" ]; then
    info "dry-run：跳过 Docker 环境检查"
    return 0
  fi
  command -v docker >/dev/null 2>&1 || die "未安装 Docker。请先安装 Docker Engine 24+ 与 Compose v2，再重新运行。"
  docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件（Compose v2）。请安装 docker-compose-plugin 后重试。"
  docker info >/dev/null 2>&1 || die "当前用户无法访问 Docker。请使用 root 或 sudo 运行，或把用户加入 docker 组。"
}

compose() {
  # 清掉安装参数对应的 shell 变量，避免它们覆盖 .env（例如 upgrade 刚写入新 MH_IMAGE）。
  env -u MH_IMAGE -u MH_PORT -u MH_URL -u MH_SERVER_IP -u BETTER_AUTH_SECRET -u UPLOAD_MAX_BYTES \
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

get_env() {
  local key="$1" fallback="$2" value=""
  if [ -f "$ENV_FILE" ]; then
    value="$(awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi
  if [ -z "$value" ]; then printf '%s' "$fallback"; else printf '%s' "$value"; fi
}

set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (done == 0) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

require_installed() {
  [ -f "$ENV_FILE" ] || die "尚未安装：$ENV_FILE 不存在。请先执行 install。"
  [ -f "$COMPOSE_FILE" ] || die "缺少 $COMPOSE_FILE，请执行 install 重新生成。"
}

app_running() {
  local cid=""
  cid="$(compose ps -q app 2>/dev/null || true)"
  [ -n "$cid" ]
}

validate_url() {
  local url="$1"
  case "$url" in
    http://*|https://*) ;;
    *) die "访问地址必须以 http:// 或 https:// 开头：$url" ;;
  esac
  case "$url" in
    *' '*|*$'\t'*|*$'\n'*|*'"'*|*"'"*)
      die "访问地址不能包含空格、引号或换行：$url"
      ;;
  esac
}

validate_port() {
  local port="$1"
  case "$port" in
    ''|*[!0-9]*) die "端口必须是数字：$port" ;;
  esac
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || die "端口必须在 1-65535 之间：$port"
}

write_env() {
  mkdir -p "$MH_DIR"
  if [ -f "$ENV_FILE" ]; then
    if ! grep -q '^MH_IMAGE=' "$ENV_FILE"; then
      die "检测到 $ENV_FILE 不是由本脚本生成的 Docker 配置（可能是 systemd 安装目录）。请换一个 MH_DIR，例如 /opt/medihub-docker。"
    fi
    info "检测到已有环境配置，复用：$ENV_FILE"
    ENV_CREATED=0
    return 0
  fi

  local detected_ip port url auth_secret default_url
  detected_ip="$(detect_ip)"
  port="${MH_PORT:-$APP_PORT_DEFAULT}"
  default_url="http://$detected_ip:$port"
  url="${MH_URL:-$default_url}"

  if [ -r /dev/tty ] && [ -t 1 ]; then
    if [ -z "${MH_URL:-}" ]; then
      url="$(ask "对外访问地址（域名或 IP:端口）" "$url")"
    fi
    if [ -z "${MH_PORT:-}" ]; then
      port="$(ask "宿主机端口" "$port")"
    fi
  fi

  url="${url%/}"
  validate_url "$url"
  validate_port "$port"
  auth_secret="${BETTER_AUTH_SECRET:-}"
  [ -n "$auth_secret" ] || auth_secret="$(gen_hex 32)"
  case "$auth_secret" in
    *[!A-Za-z0-9._-]*) die "BETTER_AUTH_SECRET 只能包含字母、数字、点、下划线和连字符" ;;
  esac

  umask 077
  cat > "$ENV_FILE" <<EOF
# 由 medihub-ops.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
# 该文件包含密钥，请勿提交到 Git；备份时注意保护。
# 纯净版：不生成管理员账号，首次访问 <MH_URL>/install 创建超级管理员。
MH_IMAGE=${MH_IMAGE:-$DEFAULT_IMAGE}
MH_PORT=$port
MH_URL="$url"
MH_SERVER_IP=$detected_ip
BETTER_AUTH_SECRET=$auth_secret
TZ=${TZ:-Asia/Shanghai}
UPLOAD_MAX_BYTES=${UPLOAD_MAX_BYTES:-268435456}
EOF
  chmod 600 "$ENV_FILE"
  ENV_CREATED=1
  info "已生成环境配置：$ENV_FILE"
}

write_compose() {
  mkdir -p "$MH_DIR"
  cat > "$COMPOSE_FILE" <<'COMPOSE_EOF'
# 由 medihub-ops.sh 生成（每次 install / upgrade 会更新本文件，请勿手改）
name: medihub-docker

x-logging: &logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  app:
    image: "${MH_IMAGE:-ghcr.io/eunsolfs/medihub:latest}"
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    ports:
      - "${MH_PORT:-8080}:3000"
    environment:
      BETTER_AUTH_URL: "${MH_URL:?请在 .env 中设置 MH_URL}"
      BETTER_AUTH_SECRET: "${BETTER_AUTH_SECRET:?请在 .env 中设置 BETTER_AUTH_SECRET}"
      BETTER_AUTH_TRUSTED_ORIGINS: "${MH_URL},http://localhost:${MH_PORT:-8080},http://127.0.0.1:${MH_PORT:-8080},http://${MH_SERVER_IP:-127.0.0.1}:${MH_PORT:-8080}"
      DATABASE_URL: /data/local.db
      STORAGE_ROOT: /data/storage
      PORT: "3000"
      TZ: "${TZ:-Asia/Shanghai}"
      UPLOAD_MAX_BYTES: "${UPLOAD_MAX_BYTES:-268435456}"
      NODE_ENV: production
    volumes:
      - data:/data
    logging: *logging
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))",
        ]
      interval: 15s
      timeout: 5s
      start_period: 20s
      retries: 3

volumes:
  data:
    name: medihub_data
COMPOSE_EOF
  info "已生成编排文件：$COMPOSE_FILE"
}

pull_image() {
  local image
  image="$(get_env MH_IMAGE "${MH_IMAGE:-$DEFAULT_IMAGE}")"
  if [ "${MH_SKIP_PULL:-0}" = "1" ]; then
    info "MH_SKIP_PULL=1，跳过拉取，直接使用本地镜像：$image"
    return 0
  fi
  info "拉取镜像：$image"
  if ! compose pull; then
    if docker image inspect "$image" >/dev/null 2>&1; then
      warn "远程拉取失败，但本地已有镜像，继续使用：$image"
      return 0
    fi
    warn "镜像拉取失败。常见原因："
    warn "  1) GHCR 网络不可达：确认服务器能访问 ghcr.io；可改用镜像加速地址或私有 registry"
    warn "  2) 版本标签不存在：检查 https://github.com/Eunsolfs/medihub/pkgs/container/medihub"
    warn "  3) 离线安装：先在本地 docker load 镜像，再重试"
    return 1
  fi
}

wait_health() {
  local port url i cid status
  port="$(get_env MH_PORT "$APP_PORT_DEFAULT")"
  url="http://127.0.0.1:$port$HEALTH_PATH"
  info "等待服务健康检查（最长 3 分钟）..."
  if command -v curl >/dev/null 2>&1; then
    for i in $(seq 1 90); do
      if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
        info "健康检查通过：$url"
        return 0
      fi
      sleep 2
    done
  else
    for i in $(seq 1 90); do
      cid="$(compose ps -q app 2>/dev/null || true)"
      if [ -n "$cid" ]; then
        status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
        if [ "$status" = "healthy" ]; then
          info "健康检查通过（容器状态 healthy）"
          return 0
        fi
      fi
      sleep 2
    done
  fi
  return 1
}

summary() {
  local url image
  url="$(get_env MH_URL "")"
  image="$(get_env MH_IMAGE "$DEFAULT_IMAGE")"
  title "医档通 MediHub 已就绪"
  printf '  访问地址 : %s\n' "$url"
  printf '  首次初始化: %s/install\n' "${url%/}"
  printf '  镜像     : %s\n' "$image"
  printf '  安装目录 : %s\n' "$MH_DIR"
  printf '  数据卷   : %s（/data/local.db + /data/storage）\n' "$DATA_VOLUME"
  printf '  备份目录 : %s\n' "$BACKUP_DIR"
  printf '  运维命令 : sudo bash %s/ops.sh status|logs|backup|upgrade|rollback\n' "$MH_DIR"
  printf '  交互菜单 : sudo bash %s/ops.sh menu\n' "$MH_DIR"
  warn "纯净版：不创建任何默认账号。请打开上面的 /install 创建超级管理员，再创建第一个科室。"
  if [ "$ENV_CREATED" = "1" ]; then
    warn "首次安装：.env 含密钥，请妥善备份并限制权限（本脚本已设为 600）。"
  fi
}

copy_self() {
  local self target
  self="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
  [ -f "$self" ] || return 0
  target="$MH_DIR/ops.sh"
  [ "$self" = "$target" ] && return 0
  cp "$self" "$target"
  chmod +x "$target"
  info "已复制运维脚本：$target"
}

cmd_install() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --url) [ "$#" -ge 2 ] || die "--url 缺参数"; MH_URL="$2"; shift 2 ;;
      --port) [ "$#" -ge 2 ] || die "--port 缺参数"; MH_PORT="$2"; shift 2 ;;
      --image) [ "$#" -ge 2 ] || die "--image 缺参数"; MH_IMAGE="$2"; shift 2 ;;
      --tag) [ "$#" -ge 2 ] || die "--tag 缺参数"; MH_IMAGE="$IMAGE_REPO:${2#v}"; shift 2 ;;
      --dir) [ "$#" -ge 2 ] || die "--dir 缺参数"; set_dir "$2"; shift 2 ;;
      --yes) MH_YES=1; shift ;;
      -h|--help) cmd_help; return 0 ;;
      *) die "install 未知参数：$1" ;;
    esac
  done

  need_docker
  mkdir -p "$MH_DIR" "$BACKUP_DIR"
  copy_self
  ENV_CREATED=0
  write_env
  write_compose
  if [ "$MH_DRY_RUN" = "1" ]; then
    info "dry-run：已生成 $ENV_FILE 与 $COMPOSE_FILE，跳过拉取与启动。"
    return 0
  fi
  pull_image || die "无法拉取镜像，安装中止。"
  if ! compose up -d; then
    compose logs --tail=100 app || true
    die "容器启动失败，请查看上方日志。"
  fi
  if ! wait_health; then
    compose logs --tail=100 app || true
    die "服务未在预期时间内健康。请查看上方日志或执行：bash $0 logs"
  fi
  summary
}

cmd_upgrade() {
  need_docker
  require_installed
  copy_self
  local target="${1:-latest}" prev new_image
  target="${target#v}"
  prev="$(get_env MH_IMAGE "$DEFAULT_IMAGE")"
  if printf '%s' "$target" | grep -qE '[:/]'; then
    new_image="$target"
  else
    new_image="${prev%:*}:$target"
  fi
  if [ "$new_image" = "$prev" ]; then
    warn "当前已经是 $new_image"
  fi
  info "升级：$prev -> $new_image"
  if app_running; then
    cmd_backup "pre-upgrade" || warn "升级前备份失败（继续升级）"
  else
    warn "应用当前未运行，跳过升级前备份"
  fi
  cp "$ENV_FILE" "$ENV_FILE.bak"
  set_env MH_IMAGE "$new_image"
  write_compose

  if ! pull_image; then
    warn "拉取失败，恢复原环境配置"
    cp "$ENV_FILE.bak" "$ENV_FILE"
    write_compose
    die "升级中止（未改动运行中的容器）。"
  fi

  if ! compose up -d; then
    warn "新版本启动失败，自动回滚镜像配置..."
    compose logs --tail=120 app || true
    cp "$ENV_FILE.bak" "$ENV_FILE"
    write_compose
    compose up -d || true
    wait_health || warn "回滚后仍未健康，请检查日志并考虑从备份恢复。"
    die "升级失败，已尝试回滚镜像配置。"
  fi

  if ! wait_health; then
    warn "新版本健康检查失败，自动回滚镜像配置（如数据库已迁移，旧镜像可能仍不可用）。"
    compose logs --tail=120 app || true
    cp "$ENV_FILE.bak" "$ENV_FILE"
    write_compose
    compose up -d || true
    wait_health || warn "回滚后仍未健康，请执行 restore 恢复升级前备份。"
    die "升级失败，已尝试回滚镜像配置。"
  fi
  summary
  info "升级完成。"
}

cmd_backup() {
  need_docker
  require_installed
  local label="$1" file tmp image cid
  [ -n "$label" ] || label="manual"
  label="$(printf '%s' "$label" | tr -c 'A-Za-z0-9._-' '-' | sed 's/-*$//')"

  if ! app_running; then
    warn "应用未运行，无法在线备份。请先执行 bash $0 install（或 status 检查）。"
    return 1
  fi
  mkdir -p "$BACKUP_DIR"
  image="$(get_env MH_IMAGE "$DEFAULT_IMAGE")"
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull "$image" || { warn "备份失败：镜像不可用（$image）"; return 1; }
  fi

  tmp="$(mktemp -d)"
  APP_STOPPED=0
  cleanup_backup() {
    rm -rf "$tmp"
    if [ "${APP_STOPPED:-0}" = "1" ]; then
      compose up -d >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_backup EXIT

  info "备份期间短暂停止应用，以保证 SQLite 与素材一致..."
  compose stop app
  APP_STOPPED=1

  info "导出 SQLite 与素材目录..."
  docker run --rm -u 0 \
    -e BACKUP_UID="$(id -u)" \
    -e BACKUP_GID="$(id -g)" \
    -v "$DATA_VOLUME:/data:ro" \
    -v "$tmp:/backup" \
    "$image" \
    sh -c 'cp /data/local.db /backup/local.db || exit 1; cp /data/local.db-wal /backup/local.db-wal 2>/dev/null || true; cp /data/local.db-shm /backup/local.db-shm 2>/dev/null || true; if [ -d /data/storage ]; then cp -a /data/storage /backup/storage; fi; chown -R "$BACKUP_UID:$BACKUP_GID" /backup'
  cp "$ENV_FILE" "$tmp/env.bak"

  file="$BACKUP_DIR/medihub-$(date +%Y%m%d-%H%M%S)-$label.tar.gz"
  tar -czf "$file" -C "$tmp" .
  chmod 600 "$file"

  APP_STOPPED=0
  trap - EXIT
  rm -rf "$tmp"
  info "备份完成：$file"
  compose up -d >/dev/null 2>&1 || warn "备份后启动失败，请执行 restart 检查。"
  wait_health || warn "备份后健康检查未通过，请执行 status/logs 检查。"
  printf '%s\n' "$file"
}

cmd_restore() {
  need_docker
  require_installed
  local archive="$1" tmp image
  [ -n "$archive" ] || die "用法：bash $0 restore <备份文件.tar.gz>"
  [ -f "$archive" ] || die "备份文件不存在：$archive"
  confirm "恢复会覆盖当前数据库与素材（数据卷 $DATA_VOLUME），确定继续？" || die "已取消。"
  if app_running; then
    cmd_backup "pre-restore" || warn "恢复前备份失败（继续恢复）"
  fi

  tmp="$(mktemp -d)"
  RESTORE_TMP="$tmp"
  RESTORE_STOPPED=0
  cleanup_restore() {
    rm -rf "$RESTORE_TMP"
    if [ "${RESTORE_STOPPED:-0}" = "1" ]; then
      compose up -d >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_restore EXIT
  tar -xzf "$archive" -C "$tmp"
  [ -f "$tmp/local.db" ] || die "备份包中缺少 local.db"

  image="$(get_env MH_IMAGE "$DEFAULT_IMAGE")"
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    docker pull "$image" || die "恢复失败：镜像不可用（$image）"
  fi

  compose stop app || true
  RESTORE_STOPPED=1
  info "写入数据库与素材..."
  docker run --rm -u 0 \
    -v "$DATA_VOLUME:/data" \
    -v "$tmp:/restore:ro" \
    "$image" \
    sh -c 'rm -f /data/local.db /data/local.db-wal /data/local.db-shm; cp /restore/local.db /data/local.db; rm -rf /data/storage; if [ -d /restore/storage ]; then cp -a /restore/storage /data/storage; fi; chown -R 1000:1000 /data'

  RESTORE_STOPPED=0
  trap - EXIT
  rm -rf "$tmp"
  compose up -d
  wait_health || die "恢复后健康检查失败，请查看日志。"
  info "恢复完成（环境变量未覆盖，仍使用当前 .env）。"
}

cmd_rollback() {
  need_docker
  require_installed
  [ -f "$ENV_FILE.bak" ] || die "没有可用的回滚配置（$ENV_FILE.bak）。"
  info "回滚到上一次升级前的镜像..."
  cp "$ENV_FILE.bak" "$ENV_FILE"
  write_compose
  pull_image || die "回滚镜像拉取失败。"
  compose up -d
  wait_health || die "回滚后健康检查失败，请查看日志。"
  info "回滚完成。"
  local latest
  latest="$(ls -1t "$BACKUP_DIR"/*-pre-upgrade.tar.gz 2>/dev/null | head -n 1 || true)"
  if [ -n "$latest" ]; then
    warn "镜像已回滚；如果数据库已被新版本迁移，旧镜像可能仍不可用。可执行："
    warn "  sudo bash $0 restore $latest"
  fi
}

cmd_status() {
  need_docker
  require_installed
  title "运行状态"
  compose ps || true
  local port url cid health
  port="$(get_env MH_PORT "$APP_PORT_DEFAULT")"
  url="http://127.0.0.1:$port$HEALTH_PATH"
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      info "健康检查：通过（$url）"
    else
      warn "健康检查：未通过（$url）"
    fi
  else
    cid="$(compose ps -q app 2>/dev/null || true)"
    health="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
    if [ "$health" = "healthy" ]; then
      info "健康检查：通过（容器状态 healthy）"
    else
      warn "健康检查：未通过（容器状态 ${health:-unknown}）"
    fi
  fi
  printf '镜像: %s\n' "$(get_env MH_IMAGE "$DEFAULT_IMAGE")"
  printf '访问: %s\n' "$(get_env MH_URL "")"
  printf '数据卷: %s\n' "$DATA_VOLUME"
  printf '备份目录: %s\n' "$BACKUP_DIR"
}

cmd_logs() {
  require_installed
  compose logs -f --tail=200 app
}

cmd_restart() {
  need_docker
  require_installed
  compose restart app
  if wait_health; then info "重启完成。"; else die "重启后健康检查失败。"; fi
}

cmd_down() {
  need_docker
  require_installed
  compose down
  info "已停止并移除容器（数据卷保留）。"
}

cmd_uninstall() {
  need_docker
  require_installed
  confirm "停止并移除容器？数据卷会保留。" || die "已取消。"
  compose down
  if confirm "是否同时删除数据卷 $DATA_VOLUME（不可恢复）？"; then
    docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || warn "删除数据卷失败（可能不存在或仍被占用）。"
    info "数据卷已删除。"
  else
    info "数据卷已保留。"
  fi
  if confirm "是否删除安装目录 $MH_DIR（含 .env 与备份）？"; then
    if [ "$MH_DIR" = "/" ] || [ -z "$MH_DIR" ]; then die "拒绝删除根目录"; fi
    if rm -rf "$MH_DIR"; then
      info "安装目录已删除。"
    else
      warn "安装目录删除失败，请手动清理：$MH_DIR"
    fi
  fi
}

cmd_doctor() {
  title "环境自检"
  if command -v docker >/dev/null 2>&1; then info "Docker: $(docker --version)"; else warn "Docker: 未安装"; fi
  if docker compose version >/dev/null 2>&1; then info "Compose: $(docker compose version --short 2>/dev/null || echo v2)"; else warn "Compose: 未安装"; fi
  if docker info >/dev/null 2>&1; then info "Docker 权限: 正常"; else warn "Docker 权限: 当前用户不可用（请用 sudo）"; fi
  if command -v curl >/dev/null 2>&1; then info "curl: 可用"; else warn "curl: 未安装（健康检查将改用容器状态）"; fi
  if [ -f "$ENV_FILE" ]; then info "配置: $ENV_FILE"; else warn "配置: 未安装"; fi
  if [ -f "$COMPOSE_FILE" ]; then info "编排: $COMPOSE_FILE"; else warn "编排: 未安装"; fi
  if [ -f "$ENV_FILE" ]; then
    if docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then info "数据卷: $DATA_VOLUME"; else warn "数据卷: $DATA_VOLUME 不存在"; fi
  fi
}

cmd_version() {
  printf 'medihub-ops %s（默认镜像 %s）\n' "$SCRIPT_VERSION" "$DEFAULT_IMAGE"
}

cmd_help() {
  cat <<'HELP'
医档通 MediHub 容器化一键安装 / 运维脚本（纯净版，无演示数据）

用法：bash medihub-ops.sh <命令> [参数]

  install [--url URL] [--port 端口] [--tag 版本] [--image 镜像] [--dir 目录]
                      安装并启动（默认目录 /opt/medihub-docker、端口 8080）
  upgrade [tag]       升级镜像（默认 latest），升级前自动备份，失败自动回滚镜像配置
  rollback            回滚到上一次升级前的镜像配置
  status              查看容器状态与健康检查
  logs                跟踪应用日志
  backup [备注]       在线备份 SQLite、素材目录与 .env 到安装目录/backups
  restore <文件>      从备份恢复（二次确认，恢复前自动备份）
  restart             重启应用
  down                停止并移除容器（保留数据卷）
  uninstall           卸载容器（可选删除数据卷与安装目录）
  doctor              检查 Docker/Compose/配置等环境
  version             显示脚本版本
  menu                交互式菜单（无参数且为终端时默认）

可覆盖的环境变量：
  MH_DIR=/opt/medihub-docker           安装目录（不要与 systemd 的 /opt/medihub 混用）
  MH_IMAGE=ghcr.io/.../medihub:tag     镜像地址
  MH_PORT=8080                         宿主机端口
  MH_URL=http://IP:8080                对外访问地址（反代域名）
  MH_YES=1                             自动化场景自动确认 restore/uninstall 等操作
  MH_DRY_RUN=1                         只生成 .env/compose，不拉镜像不启动
  MH_SKIP_PULL=1                       离线/测试时跳过拉取，直接使用本地镜像

示例：
  sudo bash medihub-ops.sh install --url https://medihub.summerecho.cn --port 18080
  sudo bash medihub-ops.sh upgrade 1.10.2
  sudo bash medihub-ops.sh backup manual
  sudo bash medihub-ops.sh restore /opt/medihub-docker/backups/medihub-20261104-120000-manual.tar.gz
  sudo bash medihub-ops.sh menu

提示：
  - 首次安装后打开 <MH_URL>/install 创建超级管理员，再创建第一个科室。
  - 数据卷名为 medihub_data，包含 /data/local.db 与 /data/storage。
  - Docker 部署请用本脚本升级/备份；不要在「系统管理 → 版本与升级」里点在线升级。
  - 本脚本与 systemd 一键安装互斥，一台机器只选一种方式。
HELP
}

cmd_menu() {
  while true; do
    title "医档通运维菜单"
    cat <<'MENU'
  1) 安装 / 启动
  2) 升级到最新版（自动备份）
  3) 查看状态
  4) 备份数据库与素材
  5) 从备份恢复
  6) 查看日志
  7) 重启
  8) 回滚上次升级
  9) 卸载
  0) 退出
MENU
    local choice=""
    printf '请选择: '
    IFS= read -r choice || break
    case "$choice" in
      1) cmd_install ;;
      2) cmd_upgrade latest ;;
      3) cmd_status ;;
      4) cmd_backup manual ;;
      5)
        printf '备份文件路径: '
        local file=""
        IFS= read -r file || file=""
        if [ -n "$file" ]; then cmd_restore "$file"; fi
        ;;
      6) cmd_logs ;;
      7) cmd_restart ;;
      8) cmd_rollback ;;
      9) cmd_uninstall ;;
      0|q|Q) break ;;
      *) warn "无效选项" ;;
    esac
  done
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    install) cmd_install "$@" ;;
    upgrade|update) cmd_upgrade "${1:-latest}" ;;
    rollback) cmd_rollback ;;
    status|ps) cmd_status ;;
    logs) cmd_logs ;;
    backup) cmd_backup "${1:-manual}" ;;
    restore) cmd_restore "${1:-}" ;;
    restart) cmd_restart ;;
    down|stop) cmd_down ;;
    uninstall|remove) cmd_uninstall ;;
    doctor|check) cmd_doctor ;;
    version|-v|--version) cmd_version ;;
    help|-h|--help) cmd_help ;;
    menu) cmd_menu ;;
    "")
      if [ -t 0 ] && [ -r /dev/tty ]; then cmd_menu; else cmd_help; fi
      ;;
    *) warn "未知命令：$cmd"; cmd_help; exit 1 ;;
  esac
}

main "$@"
