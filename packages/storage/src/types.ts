/** 本地磁盘与 NAS 走同一条实现：NAS 只是挂载到本机的一个绝对路径。 */
export interface LocalStorageConfig {
  rootPath: string;
}

/** S3 兼容对象存储（AWS S3、MinIO、阿里云 OSS 的 S3 网关、群晖 C2 等）。 */
export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO 等自建网关需要 path-style；AWS 用 virtual-hosted。 */
  forcePathStyle?: boolean;
  /** 可选的自定义访问域名，用于生成外链。 */
  publicBaseUrl?: string;
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig;

export type StorageDriverKind = "local" | "nas" | "s3";

export interface ByteRange {
  /** 含端点。 */
  start: number;
  end: number;
}

export interface StorageDriver {
  readonly kind: StorageDriverKind;
  readonly label: string;
  put: (key: string, body: Uint8Array) => Promise<void>;
  /** 返回 Web ReadableStream，Hono 可直接作为 Response body 流式输出。 */
  get: (key: string, range?: ByteRange) => Promise<ReadableStream<Uint8Array>>;
  delete: (key: string) => Promise<void>;
  /** 不存在时返回 null。 */
  stat: (key: string) => Promise<{ size: number } | null>;
  /** 连通性 / 写权限自检，用于「测试连接」。 */
  test: () => Promise<void>;
}
