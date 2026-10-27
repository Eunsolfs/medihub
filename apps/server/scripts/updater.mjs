/**
 * 在线升级执行器：由 apps/server 的 updater 以 detached 子进程启动。
 *
 * 用法：node updater.mjs upgrade 1.1.0 / node updater.mjs rollback
 *
 * 设计原则：
 * - 只做「发布包 → 备份 → 构建 → 迁移 → 切换 → 重启 → 健康检查」这条链；
 * - 任何一步失败都尝试还原备份并重启（失败时 state.rolledBack 记录结果）；
 * - 所有步骤写进 .updates/state.json，前端轮询展示；不依赖 shell 插值命令。
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const workdir = path.resolve(process.env.UPDATE_WORKDIR || process.cwd());
const repo = process.env.UPDATE_REPO || "Eunsolfs/medihub";
const dbRelative = process.env.UPDATE_DB_PATH || "apps/server/local.db";
const healthUrl =
  process.env.UPDATE_HEALTH_URL || "http://127.0.0.1:3000/api/health";
const restartCommand = process.env.UPDATE_RESTART_CMD || "";
const keepBackups = Number(process.env.UPDATE_KEEP_BACKUPS || 3);

const updatesDir = path.join(workdir, ".updates");
const stateFile = path.join(updatesDir, "state.json");
const backupsDir = path.join(updatesDir, "backups");
const downloadsDir = path.join(updatesDir, "downloads");
const stagingRoot = path.join(updatesDir, "staging");

const liveDist = path.join(workdir, "apps", "server", "dist");
const liveDb = path.resolve(workdir, dbRelative);

const [mode = "upgrade", targetArg = ""] = process.argv.slice(2);

const state = {
  fromVersion: "",
  log: [],
  mode,
  phase: "running",
  startedAt: Date.now(),
  targetVersion: targetArg.replace(/^v/u, ""),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeState = async () => {
  await mkdir(updatesDir, { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
};

const logLine = async (line) => {
  state.log = [
    ...(state.log ?? []),
    `${new Date().toISOString()} ${line}`,
  ].slice(-200);
  await writeState();
};

const readVersion = async () => {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(workdir, "package.json"), "utf8")
    );

    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
};

const run = async (command, args, cwd = workdir, extraEnv = {}) => {
  await logLine(`$ ${command} ${args.join(" ")}`);

  const { stdout, stderr } = await exec(command, args, {
    cwd,
    env: { ...process.env, CI: "1", ...extraEnv },
    maxBuffer: 32 * 1024 * 1024,
  });

  if (stdout.trim()) {
    await logLine(stdout.trim().slice(-3000));
  }

  if (stderr.trim()) {
    await logLine(stderr.trim().slice(-2000));
  }
};

const restartService = async () => {
  if (!restartCommand) {
    throw new Error("未配置 UPDATE_RESTART_CMD，无法重启服务");
  }

  await logLine(`重启服务：${restartCommand}`);

  try {
    const { stdout, stderr } = await exec("sh", ["-c", restartCommand], {
      cwd: workdir,
      env: { ...process.env, CI: "1" },
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    });

    if (stdout.trim()) {
      await logLine(stdout.trim().slice(-1000));
    }

    if (stderr.trim()) {
      await logLine(stderr.trim().slice(-1000));
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(`重启服务失败（${restartCommand}）：${detail}`);
  }
};

const waitHealthy = async (expectedVersion) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();

        if (!expectedVersion || data.version === expectedVersion) {
          await logLine(`健康检查通过：${JSON.stringify(data)}`);
          return true;
        }
      }
    } catch {
      // 服务重启期间连接失败是预期行为，继续等待。
    }

    await sleep(2000);
  }

  return false;
};

const copyIfExists = async (from, to) => {
  if (!existsSync(from)) {
    return false;
  }

  await cp(from, to, { recursive: true });
  return true;
};

const backupCurrent = async () => {
  const fromVersion = await readVersion();
  state.fromVersion = fromVersion;

  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  const backupDir = path.join(backupsDir, `${fromVersion}-${stamp}`);

  await mkdir(backupDir, { recursive: true });
  await logLine(`备份当前版本 ${fromVersion} → ${backupDir}`);

  const hasDist = await copyIfExists(liveDist, path.join(backupDir, "dist"));
  const hasDb = await copyIfExists(liveDb, path.join(backupDir, "db.sqlite"));
  // 版本号来自安装根 package.json，必须与 dist 一起备份/还原，
  // 否则升级后 /api/health 仍报旧版本，健康检查永远不通过。
  const hasPackageJson = await copyIfExists(
    path.join(workdir, "package.json"),
    path.join(backupDir, "package.json")
  );

  await writeFile(
    path.join(backupDir, "manifest.json"),
    `${JSON.stringify(
      {
        createdAt: Date.now(),
        dbRelative,
        hasDb,
        hasDist,
        hasPackageJson,
        version: fromVersion,
      },
      null,
      2
    )}\n`
  );

  state.backupDir = path.basename(backupDir);

  return { backupDir, fromVersion, hasDb, hasDist };
};

const pruneBackups = async () => {
  if (!existsSync(backupsDir)) {
    return;
  }

  const entries = (await readdir(backupsDir)).sort();

  while (entries.length > keepBackups) {
    const oldest = entries.shift();
    await rm(path.join(backupsDir, oldest), { force: true, recursive: true });
    await logLine(`清理旧备份 ${oldest}`);
  }
};

const downloadSource = async (version) => {
  await mkdir(downloadsDir, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });

  const staging = path.join(stagingRoot, version);
  await rm(staging, { force: true, recursive: true });
  await mkdir(staging, { recursive: true });

  const candidates = [
    `https://codeload.github.com/${repo}/tar.gz/refs/tags/v${version}`,
    `https://codeload.github.com/${repo}/tar.gz/refs/tags/${version}`,
  ];

  const archive = path.join(downloadsDir, `${version}.tar.gz`);
  let downloaded = false;

  for (const url of candidates) {
    await logLine(`下载发布包：${url}`);

    const response = await fetch(url, {
      headers: { "User-Agent": "medihub-updater" },
      signal: AbortSignal.timeout(120_000),
    });

    if (response.ok) {
      await writeFile(archive, Buffer.from(await response.arrayBuffer()));
      downloaded = true;
      break;
    }
  }

  if (!downloaded) {
    throw new Error(`下载 ${version} 的发布包失败，请确认 tag 存在于 GitHub`);
  }

  await run("tar", ["-xzf", archive, "-C", staging]);

  const entries = await readdir(staging, { withFileTypes: true });
  const root = entries.find((entry) => entry.isDirectory());

  if (!root) {
    throw new Error("发布包内容为空");
  }

  return path.join(staging, root.name);
};

const buildRelease = async (sourceDir) => {
  await run("pnpm", ["install", "--frozen-lockfile"], sourceDir);
  await run("pnpm", ["run", "build"], sourceDir);

  const builtDist = path.join(sourceDir, "apps", "server", "dist");

  if (!existsSync(builtDist)) {
    throw new Error("构建产物 apps/server/dist 不存在");
  }

  return builtDist;
};

const migrateDatabase = async (sourceDir) => {
  // 迁移必须作用在正在使用的数据库上：显式传入绝对路径，避免在 staging 里新建库。
  await run("pnpm", ["run", "db:migrate"], sourceDir, {
    DATABASE_URL: liveDb,
  });
};

const swapDist = async (builtDist, sourceDir) => {
  await rm(liveDist, { force: true, recursive: true });
  await cp(builtDist, liveDist, { recursive: true });

  // 版本号以安装根 package.json 为准（/api/health 从这里读），随产物一起切换。
  await cp(
    path.join(sourceDir, "package.json"),
    path.join(workdir, "package.json")
  );

  await logLine("已切换新的服务端构建产物与版本号");
};

const restoreBackup = async (backupDir) => {
  await logLine(`回滚：还原备份 ${path.basename(backupDir)}`);

  const backupDist = path.join(backupDir, "dist");
  const backupDb = path.join(backupDir, "db.sqlite");

  if (existsSync(backupDist)) {
    await rm(liveDist, { force: true, recursive: true });
    await cp(backupDist, liveDist, { recursive: true });
  }

  if (existsSync(backupDb)) {
    await cp(backupDb, liveDb);
  }

  const backupPackageJson = path.join(backupDir, "package.json");

  if (existsSync(backupPackageJson)) {
    await cp(backupPackageJson, path.join(workdir, "package.json"));
  }
};

const findLatestBackup = async () => {
  if (!existsSync(backupsDir)) {
    return null;
  }

  const entries = (await readdir(backupsDir)).sort().reverse();

  for (const entry of entries) {
    const dir = path.join(backupsDir, entry);

    if (existsSync(path.join(dir, "manifest.json"))) {
      return dir;
    }
  }

  return null;
};

const upgrade = async () => {
  const target = state.targetVersion;

  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(target)) {
    throw new Error(`版本号格式不正确：${target}`);
  }

  const backup = await backupCurrent();
  const sourceDir = await downloadSource(target);
  const builtDist = await buildRelease(sourceDir);

  await migrateDatabase(sourceDir);
  await swapDist(builtDist, sourceDir);
  await restartService();

  if (!(await waitHealthy(target))) {
    throw new Error(`升级后健康检查未在超时内返回 ${target}`);
  }

  state.finishedAt = Date.now();
  state.phase = "succeeded";
  await writeState();
  await pruneBackups();
  await logLine(`升级完成：${backup.fromVersion} → ${target}`);
  return backup;
};

const rollback = async () => {
  const backup = await findLatestBackup();

  if (!backup) {
    throw new Error("没有可回滚的备份");
  }

  await restoreBackup(backup);
  await restartService();

  const manifest = JSON.parse(
    await readFile(path.join(backup, "manifest.json"), "utf8")
  );
  const expected = typeof manifest.version === "string" ? manifest.version : "";

  if (!(await waitHealthy(expected))) {
    throw new Error("回滚后健康检查未通过，请人工介入");
  }

  state.finishedAt = Date.now();
  state.phase = "rolled_back";
  state.targetVersion = expected;
  await writeState();
  await logLine(`回滚完成：${expected}`);
};

const main = async () => {
  await writeState();

  // 同一时间只允许一个任务；start API 已检查，这里再兜底一次。
  const previous = await readFile(stateFile, "utf8").catch(() => "{}");
  const previousState = JSON.parse(previous);

  if (
    previousState.phase === "running" &&
    previousState.startedAt &&
    Date.now() - previousState.startedAt < 30 * 60 * 1000 &&
    previousState.startedAt !== state.startedAt
  ) {
    return;
  }

  try {
    if (mode === "rollback") {
      await rollback();
    } else {
      await upgrade();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logLine(`失败：${message}`);
    state.error = message;
    state.finishedAt = Date.now();

    // 升级失败尽量自动回滚；回滚自身失败则保留错误，提示人工介入。
    if (mode === "upgrade" && state.backupDir) {
      try {
        const backupDir = path.join(backupsDir, state.backupDir);
        await restoreBackup(backupDir);
        await restartService();
        const healthy = await waitHealthy(state.fromVersion);
        state.rolledBack = healthy;
        state.phase = "failed";
        await logLine(
          healthy ? "已自动回滚到上一个版本" : "自动回滚后健康检查未通过"
        );
      } catch (rollbackError) {
        state.phase = "failed";
        state.error = `${message}；自动回滚失败：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`;
      }
    } else {
      state.phase = "failed";
    }

    await writeState();
    process.exitCode = 1;
  }
};

await main();

// 让 Node 在 detached 场景下正常退出。
await stat(stateFile).catch(() => null);
