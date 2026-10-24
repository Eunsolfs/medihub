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
  },
});
