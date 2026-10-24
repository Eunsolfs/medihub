import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    /** 本地存储根目录（相对 apps/server 解析）。 */
    STORAGE_ROOT: z.string().default("./storage"),
    /** 单个文件上传上限，默认 256MB。 */
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(268_435_456),
    /** LibreOffice 可执行文件路径；配置后 Office 文档可转 PDF 在线预览。 */
    SOFFICE_PATH: z.string().optional(),
    /** OnlyOffice Document Server 地址；配置后可在浏览器里在线编辑 docx/xlsx/pptx。 */
    ONLYOFFICE_URL: z.url().optional(),
    ONLYOFFICE_JWT_SECRET: z.string().optional(),
    /** 额外允许的登录来源，逗号分隔（局域网 IP、反代域名）。 */
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    /** 首次启动时创建超级管理员的邮箱与密码。 */
    SEED_ROOT_EMAIL: z.email().optional(),
    SEED_ROOT_PASSWORD: z.string().min(8).optional(),
    /**
     * 在线升级：默认关闭。开启后 root 可在「系统管理 → 版本与升级」里
     * 直接从 GitHub Release 拉取新版本、构建、迁移、重启，失败自动回滚。
     */
    UPDATE_ENABLED: z.string().default("false"),
    /** GitHub 仓库（owner/repo），用于读取最新 Release 与下载源码包。 */
    UPDATE_REPO: z.string().default("Eunsolfs/medihub"),
    /** 安装目录（含 package.json 与 apps/），必须是运行服务的用户可写。 */
    UPDATE_WORKDIR: z.string().default("."),
    /** SQLite 文件路径（相对 UPDATE_WORKDIR），升级前会备份、失败时回滚。 */
    UPDATE_DB_PATH: z.string().default("apps/server/local.db"),
    /** 重启命令，如 `systemctl restart medihub` 或 `pm2 restart medihub`。 */
    UPDATE_RESTART_CMD: z.string().optional(),
    /** 升级后轮询的健康检查地址，默认本机 3000。 */
    UPDATE_HEALTH_URL: z.url().default("http://127.0.0.1:3000/api/health"),
    /** 保留的备份数量。 */
    UPDATE_KEEP_BACKUPS: z.coerce.number().int().positive().default(3),
    /** 可选：GitHub token，用于提高 Release 接口的速率限制。 */
    UPDATE_GITHUB_TOKEN: z.string().optional(),
  },
});
