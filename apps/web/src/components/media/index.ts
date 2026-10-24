/**
 * 医档通「媒体工具箱」统一出口。
 *
 * 使用示例（全部从 `#src/components/media/index.ts` 导入）：
 *
 * 1）上传按钮 + 拖拽区
 * ```tsx
 * <UploadButton
 *   target={{ admissionId, patientId, stage: "preop", capturedAt: new Date() }}
 *   accept="image/*,video/*,application/pdf"
 *   onUploaded={() => queryClient.invalidateQueries(api.assets.list.queryKey({ input: { admissionId } }))}
 * />
 * <UploadDropzone target={{ collectionId }} hint="拖入照片、视频或病历扫描件" onUploaded={refresh} />
 * ```
 *
 * 2）素材网格（不传 onOpen 时点击缩略图自动打开预览；多选传 selection）
 * ```tsx
 * const [selected, setSelected] = useState<string[]>([]);
 * <AssetGrid
 *   assets={items}
 *   selection={{ selectedIds: selected, onChange: setSelected }}
 *   onDelete={(asset) => remove(asset.id)}
 *   layout={view}            // "grid" | "list"
 *   empty={<p>还没有素材</p>}
 * />
 * ```
 *
 * 3）就诊时间线（内部含预览、元数据编辑、删除与拖拽排序）
 * ```tsx
 * <AssetTimeline admissionId={admissionId} assets={items} onChanged={() => refetch()} />
 * ```
 *
 * 4）文章正文与编辑器
 * ```tsx
 * <Markdown content={post.content} />
 * <MarkdownEditor value={value} onChange={setValue} minHeight={360} />
 * ```
 *
 * 5）视频
 * ```tsx
 * <VideoEmbed provider="bilibili" url="https://www.bilibili.com/video/BV1xx411c7mD" title="手术示教" />
 * <VideoEmbed provider="asset" url={assetId} title="术中录像" />
 * ```
 */
export { AssetThumb } from "./asset-thumb.tsx";

export { AssetGrid } from "./asset-grid.tsx";

export { AssetTimeline } from "./asset-timeline.tsx";

export { Markdown, MarkdownEditor } from "./markdown.tsx";

export { UploadButton, UploadDropzone } from "./upload-button.tsx";

export { VideoEmbed } from "./video-embed.tsx";

export type { AssetSelection, ThumbAsset } from "./types.ts";

export { assetFileUrl } from "./types.ts";

export type { UploadTarget } from "#src/lib/upload.ts";
