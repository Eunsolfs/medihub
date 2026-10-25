// 生成 PWA 图标（无第三方依赖）：深青圆角方块 + 白色医疗十字 + 底部相册缺口。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const outDir = path.join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;

  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }

  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, crc]);
};

const inRoundedRect = (x, y, size, radius) => {
  const r = radius;
  const corners = [
    [r, r],
    [size - r, r],
    [r, size - r],
    [size - r, size - r],
  ];

  if (x >= r && x <= size - r) return true;
  if (y >= r && y <= size - r) return true;

  for (const [cx, cy] of corners) {
    const dx = x - cx;
    const dy = y - cy;

    if (
      Math.sign(dx) === Math.sign(x - size / 2) ||
      Math.sign(dy) === Math.sign(y - size / 2)
    ) {
      continue;
    }

    if (dx * dx + dy * dy <= r * r) return true;
  }

  return false;
};

const render = (size, padding) => {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const crossHalf = size * 0.085;
  const crossArm = size * 0.26;
  const radius = size * 0.22;
  const inner = size - padding * 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const localX = x - padding;
      const localY = y - padding;
      const inside = inRoundedRect(
        localX,
        localY,
        inner,
        radius * (inner / size)
      );
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      const cross =
        (dx <= crossHalf && dy <= crossArm) ||
        (dy <= crossHalf && dx <= crossArm);

      // 圆角方块底：深青渐变；十字：白色；圆角外：透明。
      const t = y / size;
      const bg = [
        Math.round(15 - 6 * t),
        Math.round(118 - 18 * t),
        Math.round(110 - 16 * t),
      ];

      if (!inside) {
        pixels.fill(0, i, i + 4);
        continue;
      }

      if (cross) {
        pixels[i] = 255;
        pixels[i + 1] = 255;
        pixels[i + 2] = 255;
      } else {
        pixels[i] = bg[0];
        pixels[i + 1] = bg[1];
        pixels[i + 2] = bg[2];
      }

      pixels[i + 3] = 255;
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));

  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

for (const [name, size, padding] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 64],
  ["apple-touch-icon.png", 180, 0],
]) {
  writeFileSync(path.join(outDir, name), render(size, padding));
  console.log(`wrote ${name}`);
}

// 同步一份 Android 启动图标（Capacitor 模板的 mipmap 尺寸）。
const androidRes = path.join(
  process.cwd(),
  "..",
  "mobile",
  "android",
  "app",
  "src",
  "main",
  "res"
);
const androidSizes = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

for (const [dir, size] of Object.entries(androidSizes)) {
  const target = path.join(androidRes, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, "ic_launcher.png"), render(size, 0));
  writeFileSync(path.join(target, "ic_launcher_round.png"), render(size, 0));
  writeFileSync(
    path.join(target, "ic_launcher_foreground.png"),
    render(size * 2, size * 2 * 0.2)
  );
}
