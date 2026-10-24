import type {
  ByteRange,
  S3StorageConfig,
  StorageDriver,
  StorageDriverKind,
} from "#src/types.ts";

// S3 SDK 体积较大，按需加载：只用本地存储的部署不为它付出启动成本。
const loadSdk = async () => await import("@aws-sdk/client-s3");

export class S3Storage implements StorageDriver {
  readonly kind: StorageDriverKind = "s3";
  readonly label = "S3 对象存储";
  readonly #config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    if (!config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw new Error("S3 存储缺少 bucket 或访问密钥");
    }

    this.#config = config;
  }

  async #client() {
    const { S3Client } = await loadSdk();
    const { endpoint, region, forcePathStyle } = this.#config;

    return new S3Client({
      credentials: {
        accessKeyId: this.#config.accessKeyId,
        secretAccessKey: this.#config.secretAccessKey,
      },
      ...(endpoint ? { endpoint } : {}),
      ...(region ? { region } : {}),
      forcePathStyle: forcePathStyle ?? Boolean(endpoint),
    });
  }

  async put(key: string, body: Uint8Array) {
    const { PutObjectCommand } = await loadSdk();
    const client = await this.#client();

    await client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.#config.bucket,
        Key: key,
      })
    );
  }

  async get(key: string, range?: ByteRange) {
    const { GetObjectCommand } = await loadSdk();
    const client = await this.#client();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: this.#config.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      })
    );

    if (!response.Body) {
      throw new Error(`对象不存在: ${key}`);
    }

    return response.Body.transformToWebStream() as ReadableStream<Uint8Array>;
  }

  async delete(key: string) {
    const { DeleteObjectCommand } = await loadSdk();
    const client = await this.#client();

    await client.send(
      new DeleteObjectCommand({ Bucket: this.#config.bucket, Key: key })
    );
  }

  async stat(key: string) {
    const { HeadObjectCommand } = await loadSdk();
    const client = await this.#client();

    try {
      const response = await client.send(
        new HeadObjectCommand({ Bucket: this.#config.bucket, Key: key })
      );

      return { size: response.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }

  async test() {
    const key = `.medihub-probe-${Date.now()}`;
    await this.put(key, new TextEncoder().encode("ok"));
    await this.delete(key);
  }
}
