import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import type {
  ByteRange,
  LocalStorageConfig,
  StorageDriver,
  StorageDriverKind,
} from "#src/types.ts";

const joinSafe = (root: string, key: string) => {
  const full = path.resolve(root, key);

  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error(`存储路径越界: ${key}`);
  }

  return full;
};

export class LocalStorage implements StorageDriver {
  readonly kind: StorageDriverKind;
  readonly label: string;
  readonly #root: string;

  constructor(config: LocalStorageConfig, kind: StorageDriverKind) {
    if (!config.rootPath) {
      throw new Error("本地存储缺少 rootPath");
    }

    this.#root = path.resolve(config.rootPath);
    this.kind = kind;
    this.label = kind === "nas" ? "NAS 挂载目录" : "服务器本地磁盘";
  }

  async put(key: string, body: Uint8Array) {
    const full = joinSafe(this.#root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string, range?: ByteRange) {
    const full = joinSafe(this.#root, key);

    const stream = createReadStream(
      full,
      range ? { end: range.end, start: range.start } : {}
    );

    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  }

  async delete(key: string) {
    await rm(joinSafe(this.#root, key), { force: true });
  }

  async stat(key: string) {
    try {
      const info = await stat(joinSafe(this.#root, key));

      return { size: info.size };
    } catch {
      return null;
    }
  }

  async test() {
    const probe = `.medihub-probe-${Date.now()}`;
    await mkdir(this.#root, { recursive: true });
    await writeFile(joinSafe(this.#root, probe), "ok");
    await rm(joinSafe(this.#root, probe), { force: true });
  }
}
