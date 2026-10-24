import { useMutation } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Input } from "@medihub/ui/components/input";
import { Label } from "@medihub/ui/components/label";
import { Textarea } from "@medihub/ui/components/textarea";

import { api } from "#src/lib/api.ts";
import type { DateInput } from "#src/lib/format.ts";
import { stageLabels } from "#src/lib/format.ts";

import type { MediaAsset } from "./types.ts";

export interface AssetMetaDialogProps {
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

type StageValue = keyof typeof stageLabels;

type VisibilityValue = "org" | "private";

const isStage = (value: string): value is StageValue => value in stageLabels;

const isVisibility = (value: string): value is VisibilityValue =>
  value === "org" || value === "private";

const stageOptions: { value: StageValue; label: string }[] = [
  { label: stageLabels.preop, value: "preop" },
  { label: stageLabels.intraop, value: "intraop" },
  { label: stageLabels.postop, value: "postop" },
  { label: stageLabels.follow_up, value: "follow_up" },
  { label: stageLabels.imaging, value: "imaging" },
  { label: stageLabels.pathology, value: "pathology" },
  { label: stageLabels.other, value: "other" },
];

const visibilityOptions: { value: VisibilityValue; label: string }[] = [
  { label: "仅科室内部", value: "org" },
  { label: "仅自己", value: "private" },
];

const pad = (value: number) => String(value).padStart(2, "0");

const toDateTimeLocal = (value: DateInput) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseTags = (value: string) =>
  value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 30);

const fieldClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface MetaFormProps {
  asset: MediaAsset;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * 表单本身只在弹窗打开时挂载（DialogContent 关闭即卸载），
 * 初始值直接来自 useState 初始化函数，不需要 effect 重置。
 */
const MetaForm = ({ asset, onCancel, onSaved }: MetaFormProps) => {
  const [capturedAt, setCapturedAt] = useState(() =>
    toDateTimeLocal(asset.capturedAt)
  );

  const [stage, setStage] = useState<StageValue | "">(() =>
    asset.stage && isStage(asset.stage) ? asset.stage : ""
  );

  const [bodyPart, setBodyPart] = useState(asset.bodyPart ?? "");
  const [tags, setTags] = useState((asset.tags ?? []).join(", "));
  const [description, setDescription] = useState(asset.description ?? "");

  const [visibility, setVisibility] = useState<VisibilityValue>(() =>
    asset.visibility === "private" ? "private" : "org"
  );

  const update = useMutation(api.assets.update.mutationOptions());

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    update.mutate(
      {
        bodyPart: bodyPart.trim() || null,
        capturedAt: capturedAt ? new Date(capturedAt) : null,
        description: description.trim() || null,
        id: asset.id,
        stage: stage === "" ? null : stage,
        tags: parseTags(tags),
        visibility,
      },
      {
        onError: (error) => {
          toast.error(error.message || "保存失败，请稍后重试");
        },
        onSuccess: () => {
          toast.success("素材信息已保存");
          onSaved();
        },
      }
    );
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="grid gap-1.5">
        <Label htmlFor="asset-captured-at">拍摄时间</Label>
        <Input
          id="asset-captured-at"
          type="datetime-local"
          value={capturedAt}
          onChange={(event) => {
            setCapturedAt(event.target.value);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="asset-stage">分期</Label>
          <select
            id="asset-stage"
            value={stage}
            onChange={(event) => {
              setStage(isStage(event.target.value) ? event.target.value : "");
            }}
            className={fieldClass}
          >
            <option value="">未分期</option>
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="asset-visibility">可见性</Label>
          <select
            id="asset-visibility"
            value={visibility}
            onChange={(event) => {
              setVisibility(
                isVisibility(event.target.value) ? event.target.value : "org"
              );
            }}
            className={fieldClass}
          >
            {visibilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="asset-body-part">部位</Label>
        <Input
          id="asset-body-part"
          value={bodyPart}
          maxLength={60}
          placeholder="例如：左膝、腹部"
          onChange={(event) => {
            setBodyPart(event.target.value);
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="asset-tags">标签</Label>
        <Input
          id="asset-tags"
          value={tags}
          placeholder="用逗号分隔，例如：术前, 外观, 随访"
          onChange={(event) => {
            setTags(event.target.value);
          }}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="asset-description">描述</Label>
        <Textarea
          id="asset-description"
          value={description}
          rows={3}
          maxLength={4000}
          placeholder="补充说明，便于检索"
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2Icon className="animate-spin" /> : null}
          保存
        </Button>
      </DialogFooter>
    </form>
  );
};

/** 素材元数据编辑：拍摄时间 / 分期 / 部位 / 标签 / 描述 / 可见性。 */
export const AssetMetaDialog = ({
  asset,
  open,
  onOpenChange,
  onSaved,
}: AssetMetaDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>编辑素材信息</DialogTitle>
        <DialogDescription>
          <span className="block truncate">{asset?.originalName ?? ""}</span>
        </DialogDescription>
      </DialogHeader>

      {asset ? (
        <MetaForm
          asset={asset}
          key={asset.id}
          onCancel={() => {
            onOpenChange(false);
          }}
          onSaved={() => {
            onOpenChange(false);
            onSaved?.();
          }}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);
