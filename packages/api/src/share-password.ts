import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCHEME = "scrypt";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** scrypt 哈希：`scrypt:<salt>:<hash>`，不存明文密码。 */
export const hashSharePassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH);

  return `${SCHEME}:${salt}:${hash.toString("hex")}`;
};

export const verifySharePassword = (password: string, stored: string) => {
  const [scheme, salt, hash] = stored.split(":");

  if (scheme !== SCHEME || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const candidate = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH);

  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  );
};

export interface ShareAccessPayload {
  exp: number;
  postId: string;
}

/**
 * 通过密码后签发的访问令牌：借用存储配置的加解密器（AES-GCM + 服务端密钥），
 * 因此不需要额外的密钥配置，也不能被伪造。
 */
export const signShareAccess = (
  encrypt: (value: unknown) => string,
  postId: string
) =>
  encrypt({
    exp: Date.now() + TOKEN_TTL_MS,
    postId,
  } satisfies ShareAccessPayload);

export const verifyShareAccess = (
  decrypt: <T>(payload: string) => T,
  token: string | undefined,
  postId: string
) => {
  if (!token) {
    return false;
  }

  try {
    const payload = decrypt<ShareAccessPayload>(token);

    return (
      payload.postId === postId &&
      typeof payload.exp === "number" &&
      payload.exp > Date.now()
    );
  } catch {
    return false;
  }
};
