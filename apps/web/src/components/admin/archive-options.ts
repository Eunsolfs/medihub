export const ARCHIVE_CHUNK_OPTIONS = [
  { label: "50 MB", value: String(50 * 1024 * 1024) },
  { label: "100 MB", value: String(100 * 1024 * 1024) },
  { label: "200 MB", value: String(200 * 1024 * 1024) },
  { label: "512 MB", value: String(512 * 1024 * 1024) },
  { label: "1 GB", value: String(1024 ** 3) },
  { label: "2 GB", value: String(2 * 1024 ** 3) },
  { label: "4 GB", value: String(4 * 1024 ** 3) },
] as const;

export const DEFAULT_ARCHIVE_CHUNK_BYTES = 200 * 1024 * 1024;

export const archiveChunkLabel = (bytes: number) => {
  const option = ARCHIVE_CHUNK_OPTIONS.find(
    (item) => Number(item.value) === bytes
  );

  return option?.label ?? `${Math.round(bytes / 1024 / 1024)} MB`;
};
