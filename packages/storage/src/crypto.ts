import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

const deriveKey = (secret: string) =>
  createHash("sha256").update(`medihub:storage:${secret}`).digest();

/**
 * 存储目标的配置（含 S3 密钥）以密文入库，密钥来自服务端 secret。
 * 格式：v1:<iv>:<authTag>:<ciphertext>，均为 base64。
 */
export const encryptConfig = (value: unknown, secret: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf-8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
};

export const decryptConfig = <T>(payload: string, secret: string): T => {
  const [version, iv, tag, ciphertext] = payload.split(":");

  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("无法识别的存储配置格式");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(secret),
    Buffer.from(iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf-8")) as T;
};
