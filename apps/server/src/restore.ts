import { copyFile, readFile, rm } from "node:fs/promises";
import path from "node:path";

interface PendingRestore {
  dbPath: string;
  jobId: string;
  restoreFile: string;
}

const isPendingRestore = (value: unknown): value is PendingRestore => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.dbPath === "string" &&
    typeof record.restoreFile === "string" &&
    typeof record.jobId === "string"
  );
};

/**
 * 在打开数据库之前调用：如果上一次「从镜像恢复」写了 pending.json，
 * 就在这里替换 SQLite 文件（当前库先备份），保证进程启动后读到的就是恢复后的数据。
 */
export const applyPendingRestore = async () => {
  const dir = path.resolve(".restore");
  const pendingFile = path.join(dir, "pending.json");

  let raw: string;

  try {
    raw = await readFile(pendingFile, "utf-8");
  } catch {
    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("[restore] pending.json 不是合法 JSON，已忽略");

    return;
  }

  if (!isPendingRestore(parsed)) {
    console.error("[restore] pending.json 缺字段，已忽略");

    return;
  }

  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");

  try {
    await copyFile(parsed.dbPath, `${parsed.dbPath}.pre-restore-${stamp}`);
  } catch {
    // 首次安装还没有数据库时没有可备份的文件。
  }

  await copyFile(parsed.restoreFile, parsed.dbPath);
  // 旧库的 WAL/SHM 必须一起清掉，否则会和恢复后的主库文件混在一起。
  await rm(`${parsed.dbPath}-wal`, { force: true }).catch(() => {});
  await rm(`${parsed.dbPath}-shm`, { force: true }).catch(() => {});
  await rm(pendingFile, { force: true });
  await rm(parsed.restoreFile, { force: true });

  console.log(`[restore] 已应用镜像恢复（job ${parsed.jobId}）`);
};
