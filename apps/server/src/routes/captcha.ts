import { randomUUID } from "node:crypto";

import { Hono } from "hono";

/** 轻量图形验证码：进程内保存，5 分钟过期、一次性使用。 */
interface CaptchaEntry {
  answer: string;
  expiresAt: number;
}

const captchaStore = new Map<string, CaptchaEntry>();
const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const randomCode = (length = 4) =>
  Array.from(
    { length },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  ).join("");

const sweep = () => {
  const now = Date.now();

  for (const [id, entry] of captchaStore) {
    if (entry.expiresAt <= now) {
      captchaStore.delete(id);
    }
  }

  while (captchaStore.size > MAX_ENTRIES) {
    const oldest = captchaStore.keys().next().value;

    if (!oldest) {
      break;
    }

    captchaStore.delete(oldest);
  }
};

const svgFor = (code: string) => {
  const width = 120;
  const height = 40;

  const chars = code
    .split("")
    .map((char, index) => {
      const x = 14 + index * 26;
      const y = 27 + Math.round(Math.random() * 4 - 2);
      const rotate = Math.round(Math.random() * 24 - 12);

      return `<text x="${x}" y="${y}" font-family="monospace" font-size="24" font-weight="700" fill="#0f766e" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
    })
    .join("");

  const lines = Array.from({ length: 4 }, () => {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;

    return `<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#94a3b8" stroke-width="1" opacity="0.6" />`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false"><rect width="100%" height="100%" fill="#f1f5f9" rx="6" />${lines}${chars}</svg>`;
};

export const captchaRoute = new Hono()
  .get("/", (c) => {
    sweep();

    const id = randomUUID();
    const answer = randomCode();

    captchaStore.set(id, { answer, expiresAt: Date.now() + TTL_MS });
    c.header("Cache-Control", "no-store");

    return c.json({ id, svg: svgFor(answer) });
  })
  .post("/verify", async (c) => {
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "请求格式不对" }, 400);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as { id?: unknown }).id !== "string" ||
      typeof (body as { answer?: unknown }).answer !== "string"
    ) {
      return c.json({ error: "请求格式不对" }, 400);
    }

    const { id, answer } = body as { answer: string; id: string };
    const entry = captchaStore.get(id);

    captchaStore.delete(id);

    if (!entry || entry.expiresAt < Date.now()) {
      return c.json({ error: "验证码已过期，请刷新" }, 400);
    }

    if (entry.answer.toLowerCase() !== answer.trim().toLowerCase()) {
      return c.json({ error: "验证码错误，请重试" }, 400);
    }

    return c.json({ ok: true });
  });
