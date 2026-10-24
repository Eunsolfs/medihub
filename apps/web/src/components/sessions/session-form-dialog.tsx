import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode, SubmitEvent } from "react";
import { toast } from "sonner";

import type { AppRouterClient } from "@medihub/api";
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

import { LoadingRows } from "#src/components/app-shell/ui/skeletons.tsx";
import { AudiencePicker } from "#src/components/sessions/audience-picker.tsx";
import {
  isLearningKind,
  LEARNING_KIND_OPTIONS,
  parseTags,
  toDateTimeInput,
} from "#src/components/sessions/session-kind.ts";
import type { LearningKind } from "#src/components/sessions/session-kind.ts";
import {
  isSessionVisibility,
  sessionVisibilityLabel,
  visibilityOptionsFor,
} from "#src/components/sessions/visibility.ts";
import type { SessionVisibility } from "#src/components/sessions/visibility.ts";
import { api } from "#src/lib/api.ts";

export type SessionDetail = Awaited<
  ReturnType<AppRouterClient["learning"]["get"]>
>;

type ViewerProfile = NonNullable<
  Awaited<ReturnType<AppRouterClient["me"]["profile"]>>
>;

interface SessionFormDialogProps {
  /** 新建时的默认举办时间（由打开对话框的事件算出，避免渲染期读取当前时间） */
  defaultHeldAt?: string;
  onOpenChange: (open: boolean) => void;
  /** 新建后回调，通常用于跳转到详情 */
  onCreated?: (id: string) => void;
  open: boolean;
  /** 传入即为编辑模式：详情由对话框自己拉取，用于回填可见范围与受众 */
  sessionId?: string | null;
}

interface SessionFormBodyProps {
  defaultHeldAt: string;
  detail: SessionDetail | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
  profile: ViewerProfile;
}

const VISIBILITY_HINTS: Record<SessionVisibility, string> = {
  logged_in: "全系统任何已登录用户都能看到这场会议。",
  org: "本科室登录成员可见，也是默认设置。",
  private: "仅自己可见，科室管理员可在管理端查看。",
  public: "拿到链接的任何人都能查看，注意患者隐私。",
  selected: "仅指定科室与指定用户可见。",
};

const LoadingContent = ({ children }: { children: ReactNode }) => (
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>学习会议</DialogTitle>
      <DialogDescription>{children}</DialogDescription>
    </DialogHeader>
    <LoadingRows rows={3} />
  </DialogContent>
);

/** 表单主体：每次打开都是全新挂载，初值直接取自 props，不需要重置副作用。 */
const SessionFormBody = ({
  defaultHeldAt,
  detail,
  onClose,
  onCreated,
  profile,
}: SessionFormBodyProps) => {
  const queryClient = useQueryClient();
  const { role } = profile.viewer;
  const viewerOrganizationId = profile.viewer.organizationId;

  const [title, setTitle] = useState(detail?.title ?? "");
  const detailKind = detail?.kind;

  const [kind, setKind] = useState<LearningKind>(
    detailKind && isLearningKind(detailKind) ? detailKind : "lecture"
  );

  const [heldAt, setHeldAt] = useState(
    detail ? toDateTimeInput(detail.heldAt) : defaultHeldAt
  );

  const [location, setLocation] = useState(detail?.location ?? "");
  const [speaker, setSpeaker] = useState(detail?.speaker ?? "");
  const [description, setDescription] = useState(detail?.description ?? "");
  const [tags, setTags] = useState((detail?.tags ?? []).join("、"));

  const [visibility, setVisibility] = useState<SessionVisibility>(
    detail && isSessionVisibility(detail.visibility) ? detail.visibility : "org"
  );

  const [organizationValues, setOrganizationValues] = useState<string[]>(() => {
    const saved = detail?.audience.organizations ?? [];

    if (saved.length > 0) {
      return saved;
    }

    return role === "root" || !viewerOrganizationId
      ? []
      : [viewerOrganizationId];
  });

  const [userValues, setUserValues] = useState<string[]>(
    detail?.audience.users ?? []
  );

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

  const handleVisibilityChange = (next: SessionVisibility) => {
    setVisibility(next);

    // 科室管理员的「指定科室」固定为本科室，切到指定对象时补上。
    if (
      next === "selected" &&
      role !== "root" &&
      viewerOrganizationId &&
      organizationValues.length === 0
    ) {
      setOrganizationValues([viewerOrganizationId]);
    }
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const values = {
      audienceOrganizations:
        visibility === "selected" ? organizationValues : [],
      audienceUsers: visibility === "selected" ? userValues : [],
      description: description.trim() || undefined,
      heldAt: new Date(heldAt),
      kind,
      location: location.trim() || undefined,
      speaker: speaker.trim() || undefined,
      tags: parseTags(tags),
      title: title.trim(),
      visibility,
    };

    if (detail) {
      updateMutation.mutate({ ...values, id: detail.id });
    } else {
      createMutation.mutate(values);
    }
  };

  return (
    <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{detail ? "编辑学习会议" : "新建学习会议"}</DialogTitle>
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
            rows={3}
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

        <div className="grid gap-2">
          <Label htmlFor="session-visibility">可见范围</Label>
          <Select
            items={visibilityOptionsFor(role).map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            onValueChange={(value) => {
              if (typeof value === "string" && isSessionVisibility(value)) {
                handleVisibilityChange(value);
              }
            }}
            value={visibility}
          >
            <SelectTrigger className="w-full" id="session-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibilityOptionsFor(role).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {VISIBILITY_HINTS[visibility]}当前：{" "}
            {sessionVisibilityLabel(visibility)}
          </p>
        </div>

        {visibility === "selected" ? (
          <AudiencePicker
            onOrganizationChange={setOrganizationValues}
            onUserChange={setUserValues}
            organizationId={viewerOrganizationId}
            organizationName={profile.organization?.name ?? null}
            organizationValues={organizationValues}
            role={role}
            userValues={userValues}
          />
        ) : null}
      </form>

      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          取消
        </Button>
        <Button disabled={isPending} form="session-form" type="submit">
          {isPending ? "正在保存…" : detail ? "保存修改" : "创建会议"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

/** 新建 / 编辑学习会议：编辑时先拉详情，以回填可见范围与指定受众。 */
export const SessionFormDialog = ({
  defaultHeldAt = "",
  onOpenChange,
  onCreated,
  open,
  sessionId,
}: SessionFormDialogProps) => {
  const detailQuery = useQuery({
    ...api.learning.get.queryOptions({ input: { id: sessionId ?? "" } }),
    enabled: open && Boolean(sessionId),
  });

  const profileQuery = useQuery({
    ...api.me.profile.queryOptions(),
    enabled: open,
  });

  const profile = profileQuery.data;
  const detail = sessionId ? detailQuery.data : null;
  const ready = Boolean(profile) && (!sessionId || Boolean(detail));

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {open ? (
        ready && profile ? (
          <SessionFormBody
            defaultHeldAt={defaultHeldAt}
            detail={detail ?? null}
            key={sessionId ?? "new"}
            onClose={() => {
              onOpenChange(false);
            }}
            onCreated={onCreated}
            profile={profile}
          />
        ) : (
          <LoadingContent>正在加载会议信息…</LoadingContent>
        )
      ) : null}
    </Dialog>
  );
};
