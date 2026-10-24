import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { LatestRelease, UpdateState, UpdaterAccess } from "@medihub/api";

import { env } from "#src/env.ts";

const workdir = path.resolve(env.UPDATE_WORKDIR);
const updatesDir = path.join(workdir, ".updates");
const stateFile = path.join(updatesDir, "state.json");
const backupsDir = path.join(updatesDir, "backups");
const scriptPath = path.join(import.meta.dirname, "scripts", "updater.mjs");

const readState = (): UpdateState => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFile, "utf-8"));

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "phase" in parsed &&
      typeof parsed.phase === "string"
    ) {
      return parsed as UpdateState;
    }
  } catch {
    // 没有状态文件或内容损坏时视为空闲。
  }

  return { phase: "idle" };
};

/** 只有同时开启开关、配置重启命令、且安装目录可识别时才提供升级能力。 */
const enabled = () =>
  env.UPDATE_ENABLED === "true" &&
  Boolean(env.UPDATE_RESTART_CMD) &&
  existsSync(path.join(workdir, "package.json"));

let cachedLatest: { at: number; value: LatestRelease } | null = null;

const fetchLatest = async (): Promise<LatestRelease> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "medihub-updater",
  };

  if (env.UPDATE_GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.UPDATE_GITHUB_TOKEN}`;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${env.UPDATE_REPO}/releases/latest`,
      { headers, signal: AbortSignal.timeout(8000) }
    );

    if (response.ok) {
      const data = (await response.json()) as {
        body?: string;
        html_url?: string;
        published_at?: string;
        tag_name?: string;
      };

      const latestVersion = (data.tag_name ?? "").replace(/^v/u, "") || null;

      if (latestVersion) {
        return {
          latestVersion,
          notes: data.body?.slice(0, 2000),
          publishedAt: data.published_at,
          url: data.html_url,
        };
      }
    } else if (response.status !== 404) {
      return {
        error: `GitHub 返回 ${response.status}`,
        latestVersion: null,
      };
    }

    // 仓库可能只打了 tag、没有建 Release；回退到 tags 列表取最新的版本 tag。
    const tagsResponse = await fetch(
      `https://api.github.com/repos/${env.UPDATE_REPO}/tags?per_page=30`,
      { headers, signal: AbortSignal.timeout(8000) }
    );

    if (!tagsResponse.ok) {
      return {
        error:
          tagsResponse.status === 404
            ? "仓库没有可用的 Release 或 tag"
            : `GitHub 返回 ${tagsResponse.status}`,
        latestVersion: null,
      };
    }

    const tags = (await tagsResponse.json()) as { name?: string }[];

    const latestTag = tags
      .map((tag) => tag.name ?? "")
      .find((name) => /^v?\d+\.\d+\.\d+/u.test(name));

    if (!latestTag) {
      return { error: "仓库没有可用的版本 tag", latestVersion: null };
    }

    return {
      latestVersion: latestTag.replace(/^v/u, ""),
      url: `https://github.com/${env.UPDATE_REPO}/releases/tag/${latestTag}`,
    };
  } catch {
    return { error: "无法连接 GitHub，请检查服务器网络", latestVersion: null };
  }
};

const spawnUpdater = (mode: "upgrade" | "rollback", targetVersion?: string) => {
  const child = spawn(
    process.execPath,
    [scriptPath, mode, ...(targetVersion ? [targetVersion] : [])],
    {
      cwd: workdir,
      detached: true,
      env: {
        ...process.env,
        UPDATE_DB_PATH: env.UPDATE_DB_PATH,
        UPDATE_HEALTH_URL: env.UPDATE_HEALTH_URL,
        UPDATE_KEEP_BACKUPS: String(env.UPDATE_KEEP_BACKUPS),
        UPDATE_REPO: env.UPDATE_REPO,
        UPDATE_RESTART_CMD: env.UPDATE_RESTART_CMD ?? "",
        UPDATE_WORKDIR: workdir,
      },
      stdio: "ignore",
    }
  );

  child.unref();
};

export const updater: UpdaterAccess = {
  canRollback: async () => {
    if (!enabled() || !existsSync(backupsDir)) {
      return false;
    }

    return readdirSync(backupsDir).some((name) =>
      existsSync(path.join(backupsDir, name, "manifest.json"))
    );
  },

  checkLatest: async () => {
    if (cachedLatest && Date.now() - cachedLatest.at < 5 * 60 * 1000) {
      return cachedLatest.value;
    }

    const value = await fetchLatest();
    cachedLatest = { at: Date.now(), value };

    return value;
  },

  rollback: async () => {
    spawnUpdater("rollback");

    return {
      mode: "rollback",
      phase: "running",
      startedAt: Date.now(),
    };
  },

  start: async (targetVersion) => {
    spawnUpdater("upgrade", targetVersion);

    return {
      fromVersion: readState().fromVersion ?? undefined,
      mode: "upgrade",
      phase: "running",
      startedAt: Date.now(),
      targetVersion,
    };
  },

  state: async () => readState(),
};

export const updaterEnabled = enabled;
