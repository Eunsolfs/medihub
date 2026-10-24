import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Textarea } from "@medihub/ui/components/textarea";

import {
  isLearningKind,
  LEARNING_KIND_OPTIONS,
  parseTags,
  toDateTimeInput,
} from "#src/components/sessions/session-kind.ts";
import type { LearningKind } from "#src/components/sessions/session-kind.ts";
import { api } from "#src/lib/api.ts";

export interface SessionRecord {
  description?: string | null;
  heldAt: Date | string;
  id: string;
  kind?: string | null;
  location?: string | null;
  speaker?: string | null;
  tags?: string[] | null;
  title: string;
}

interface SessionFormDialogProps {
  /** 新建时的默认举办时间（由打开对话框的事件算出，避免渲染期读取当前时间） */
  defaultHeldAt?: string;
  onOpenChange: (open: boolean) => void;
  /** 新建后回调，通常用于跳转到详情 */
  onCreated?: (id: string) => void;
  open: boolean;
  /** 传入即为编辑模式 */
  session?: SessionRecord | null;
}

interface SessionFormBodyProps {
  defaultHeldAt: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
  session: SessionRecord | null;
}

/** 表单主体：每次打开都是全新挂载，初值直接取自 props，不需要重置副作用。 */
const SessionFormBody = ({
  defaultHeldAt,
  onClose,
  onCreated,
  session,
}: SessionFormBodyProps) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(session?.title ?? "");
  const sessionKind = session?.kind;

  const [kind, setKind] = useState<LearningKind>(
    sessionKind && isLearningKind(sessionKind) ? sessionKind : "lecture"
  );

  const [heldAt, setHeldAt] = useState(
    session ? toDateTimeInput(session.heldAt) : defaultHeldAt
  );

  const [location, setLocation] = useState(session?.location ?? "");
  const [speaker, setSpeaker] = useState(session?.speaker ?? "");
  const [description, setDescription] = useState(session?.description ?? "");
  const [tags, setTags] = useState((session?.tags ?? []).join("、"));

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: api.learning.list.key({ type: "query" }),
    });
    await queryClient.invalidateQueries({
      queryKey: api.learning.get.key({ type: "query" }),
    });
  };

  const createMutation = useMutation(
    api.learning.create.mutationOptions({
      onSuccess: async (created) => {
        toast.success("学习会议已创建");
        await invalidate();
        onClose();
        onCreated?.(created.id);
      },
    })
  );

  const updateMutation = useMutation(
    api.learning.update.mutationOptions({
      onSuccess: async () => {
        toast.success("学习会议已更新");
        await invalidate();
        onClose();
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const values = {
      description: description.trim() || undefined,
      heldAt: new Date(heldAt),
      kind,
      location: location.trim() || undefined,
      speaker: speaker.trim() || undefined,
      tags: parseTags(tags),
      title: title.trim(),
    };

    if (session) {
      updateMutation.mutate({ ...values, id: session.id });
    } else {
      createMutation.mutate(values);
    }
  };

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{session ? "编辑学习会议" : "新建学习会议"}</DialogTitle>
        <DialogDescription>
          会议的资料（课件、照片、录音）建档后可在详情页上传归档。
        </DialogDescription>
      </DialogHeader>

      <form className="grid gap-4" id="session-form" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="session-title">标题</Label>
          <Input
            id="session-title"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            placeholder="如：10 月科室病例讨论：鼻部缺损修复"
            required
            value={title}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="session-kind">类型</Label>
            <Select
              items={LEARNING_KIND_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              onValueChange={(value) => {
                if (typeof value === "string" && isLearningKind(value)) {
                  setKind(value);
                }
              }}
              value={kind}
            >
              <SelectTrigger className="w-full" id="session-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEARNING_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="session-held-at">举办时间</Label>
            <Input
              id="session-held-at"
              onChange={(event) => {
                setHeldAt(event.target.value);
              }}
              required
              type="datetime-local"
              value={heldAt}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="session-location">地点</Label>
            <Input
              id="session-location"
              onChange={(event) => {
                setLocation(event.target.value);
              }}
              placeholder="如：科室示教室"
              value={location}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="session-speaker">讲者 / 主持人</Label>
            <Input
              id="session-speaker"
              onChange={(event) => {
                setSpeaker(event.target.value);
              }}
              placeholder="如：李主任"
              value={speaker}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="session-description">简介</Label>
          <Textarea
            id="session-description"
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="记录讨论要点、资料范围，便于日后检索。"
            rows={4}
            value={description}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="session-tags">标签</Label>
          <Input
            id="session-tags"
            onChange={(event) => {
              setTags(event.target.value);
            }}
            placeholder="用顿号或逗号分隔，如：皮瓣、创面修复"
            value={tags}
          />
        </div>
      </form>

      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          取消
        </Button>
        <Button disabled={isPending} form="session-form" type="submit">
          {isPending ? "正在保存…" : session ? "保存修改" : "创建会议"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

/** 新建 / 编辑学习会议：讲课、会议、培训、病例讨论统一入口。 */
export const SessionFormDialog = ({
  defaultHeldAt = "",
  onOpenChange,
  onCreated,
  open,
  session,
}: SessionFormDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    {open ? (
      <SessionFormBody
        defaultHeldAt={defaultHeldAt}
        key={session?.id ?? "new"}
        onClose={() => {
          onOpenChange(false);
        }}
        onCreated={onCreated}
        session={session ?? null}
      />
    ) : null}
  </Dialog>
);
