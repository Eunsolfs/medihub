/** 在线升级的状态模型（服务端执行，前端只读展示）。 */
export type UpdatePhase =
  | "idle"
  | "running"
  | "succeeded"
  | "failed"
  | "rolled_back";

export interface UpdateState {
  /** 备份目录名（回滚时同时还原代码与数据库）。 */
  backupDir?: string;
  finishedAt?: number;
  /** 当前版本（执行升级时记录，便于失败回滚后展示）。 */
  fromVersion?: string;
  /** 逐条进度，前端按行展示。 */
  log?: string[];
  /** 本次任务类型。 */
  mode?: "upgrade" | "rollback";
  phase: UpdatePhase;
  startedAt?: number;
  targetVersion?: string;
  error?: string;
  rolledBack?: boolean;
}

export interface LatestRelease {
  error?: string;
  latestVersion: string | null;
  notes?: string;
  publishedAt?: string;
  url?: string;
}

export interface UpdateStatus {
  canRollback: boolean;
  currentVersion: string;
  /** 是否配置了在线升级（未配置时前端只展示说明）。 */
  enabled: boolean;
  latest: LatestRelease;
  state: UpdateState;
}

/**
 * 在线升级的宿主能力：由 apps/server 注入，api 包只依赖接口，
 * 这样集成测试可以注入假实现来验证权限与状态机。
 */
export interface UpdaterAccess {
  canRollback: () => Promise<boolean>;
  checkLatest: () => Promise<LatestRelease>;
  /** 回滚到最近一次升级前的备份。 */
  rollback: () => Promise<UpdateState>;
  state: () => Promise<UpdateState>;
  /** 发起升级到指定版本；任务异步执行，调用后立即返回 running 状态。 */
  start: (targetVersion: string) => Promise<UpdateState>;
}
