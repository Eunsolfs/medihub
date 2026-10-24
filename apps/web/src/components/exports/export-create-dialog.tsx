import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Checkbox } from "@medihub/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@medihub/ui/components/dialog";
import { Label } from "@medihub/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";

import {
  getSessionRole,
  isOrglessRole,
} from "#src/components/app-shell/roles.ts";
import type { ExportKind } from "#src/components/exports/exports-api.ts";
import { api } from "#src/lib/api.ts";
import { formatDate } from "#src/lib/format.ts";

const KIND_OPTIONS: readonly {
  hint: string;
  label: string;
  value: ExportKind;
}[] = [
  { hint: "按一次就诊的影像与文档打包", label: "就诊", value: "admission" },
  { hint: "手动挑选要导出的素材", label: "自定义素材", value: "selection" },
  { hint: "按患者的全部资料打包", label: "患者", value: "patient" },
  { hint: "按教学文章的附件打包", label: "文章", value: "post" },
  { hint: "按学习会议归档资料打包", label: "会议", value: "session" },
];

interface ExportCreateDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface ExportCreateBodyProps {
  onClose: () => void;
}

/** 表单主体：每次打开重新挂载，默认值写在初值里，省掉重置副作用。 */
const ExportCreateBody = ({ onClose }: ExportCreateBodyProps) => {
  const queryClient = useQueryClient();
  const { session: routeSession } = useRouteContext({ from: "__root__" });
  // 没有归属科室的账号拿不到患者/就诊数据，直接不提供这两类导出。
  const orgless = isOrglessRole(getSessionRole(routeSession));

  const kindOptions = orgless
    ? KIND_OPTIONS.filter(
        (option) => option.value === "selection" || option.value === "post"
      )
    : KIND_OPTIONS;

  const isAllowedKind = (candidate: string): candidate is ExportKind =>
    kindOptions.some((option) => option.value === candidate);

  const [kind, setKind] = useState<ExportKind>(
    orgless ? "selection" : "patient"
  );

  const [patientId, setPatientId] = useState("");
  const [admissionId, setAdmissionId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [postId, setPostId] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [includeFiles, setIncludeFiles] = useState(true);

  const needsPatients =
    !orgless && (kind === "patient" || kind === "admission");

  const patientsQuery = useQuery({
    ...api.patients.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: needsPatients,
  });

  const admissionsQuery = useQuery({
    ...api.admissions.listByPatient.queryOptions({ input: { patientId } }),
    enabled: !orgless && kind === "admission" && patientId.length > 0,
  });

  const sessionsQuery = useQuery({
    ...api.learning.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: kind === "session",
  });

  const postsQuery = useQuery({
    ...api.posts.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: kind === "post",
  });

  const assetsQuery = useQuery({
    ...api.assets.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: kind === "selection",
  });

  const createMutation = useMutation(
    api.exports.create.mutationOptions({
      onSuccess: async (job) => {
        await queryClient.invalidateQueries({
          queryKey: api.exports.list.key({ type: "query" }),
        });
        toast.success(
          job.status === "ready"
            ? "导出完成，可以直接下载"
            : "导出任务已创建，正在后台打包"
        );
        onClose();
      },
    })
  );

  const targetId =
    kind === "patient"
      ? patientId
      : kind === "admission"
        ? admissionId
        : kind === "session"
          ? sessionId
          : kind === "post"
            ? postId
            : "";

  const canSubmit =
    kind === "selection" ? assetIds.length > 0 : targetId.length > 0;

  const toggleAsset = (id: string) => {
    setAssetIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const handleSubmit = () => {
    if (!canSubmit) {
      return;
    }

    if (kind === "patient") {
      createMutation.mutate({ includeFiles, kind, patientId });
    } else if (kind === "admission") {
      createMutation.mutate({ admissionId, includeFiles, kind, patientId });
    } else if (kind === "session") {
      createMutation.mutate({ includeFiles, kind, sessionId });
    } else if (kind === "post") {
      createMutation.mutate({ includeFiles, kind, postId });
    } else {
      createMutation.mutate({ assetIds, includeFiles, kind });
    }
  };

  const patients = patientsQuery.data?.items ?? [];
  const admissions = admissionsQuery.data ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const posts = postsQuery.data?.items ?? [];
  const assets = assetsQuery.data?.items ?? [];

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>新建导出</DialogTitle>
        <DialogDescription>
          选择要打包的资料范围，后台生成压缩包后可在列表里下载。
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="export-kind">导出类型</Label>
          <Select
            items={kindOptions.map((option) => ({
              label: `${option.label} · ${option.hint}`,
              value: option.value,
            }))}
            onValueChange={(value) => {
              if (typeof value === "string" && isAllowedKind(value)) {
                setKind(value);
              }
            }}
            value={kind}
          >
            <SelectTrigger className="w-full" id="export-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {kindOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} · {option.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {orgless ? (
            <p className="text-muted-foreground text-xs">
              没有归属科室时只能导出资料库素材或文章附件；患者与就诊导出需先分配科室。
            </p>
          ) : null}
        </div>

        {needsPatients ? (
          <div className="grid gap-2">
            <Label htmlFor="export-patient">患者</Label>
            <Select
              items={patients.map((patient) => ({
                label: patient.name,
                value: patient.id,
              }))}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setPatientId(value);
                  setAdmissionId("");
                }
              }}
              value={patientId}
            >
              <SelectTrigger className="w-full" id="export-patient">
                <SelectValue placeholder="选择患者" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {kind === "admission" ? (
          <div className="grid gap-2">
            <Label htmlFor="export-admission">就诊记录</Label>
            <Select
              items={admissions.map((admission) => ({
                label: `${formatDate(admission.admittedAt)} · ${admission.diagnosis ?? "未填写诊断"}`,
                value: admission.id,
              }))}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setAdmissionId(value);
                }
              }}
              value={admissionId}
            >
              <SelectTrigger className="w-full" id="export-admission">
                <SelectValue placeholder="先选择患者，再选择就诊" />
              </SelectTrigger>
              <SelectContent>
                {admissions.map((admission) => (
                  <SelectItem key={admission.id} value={admission.id}>
                    {formatDate(admission.admittedAt)} ·{" "}
                    {admission.diagnosis ?? "未填写诊断"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {kind === "session" ? (
          <div className="grid gap-2">
            <Label htmlFor="export-session">学习会议</Label>
            <Select
              items={sessions.map((session) => ({
                label: session.title,
                value: session.id,
              }))}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setSessionId(value);
                }
              }}
              value={sessionId}
            >
              <SelectTrigger className="w-full" id="export-session">
                <SelectValue placeholder="选择会议" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {kind === "post" ? (
          <div className="grid gap-2">
            <Label htmlFor="export-post">文章</Label>
            <Select
              items={posts.map((post) => ({
                label: post.title,
                value: post.id,
              }))}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setPostId(value);
                }
              }}
              value={postId}
            >
              <SelectTrigger className="w-full" id="export-post">
                <SelectValue placeholder="选择文章" />
              </SelectTrigger>
              <SelectContent>
                {posts.map((post) => (
                  <SelectItem key={post.id} value={post.id}>
                    {post.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {kind === "selection" ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">选择素材</p>
              <span className="text-muted-foreground text-xs tabular-nums">
                已选 {assetIds.length} 个
              </span>
            </div>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
              {assets.length === 0 ? (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                  资料库里还没有素材
                </li>
              ) : null}
              {assets.map((asset) => (
                <li key={asset.id}>
                  <label className="hover:bg-muted/50 flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                    <Checkbox
                      checked={assetIds.includes(asset.id)}
                      onCheckedChange={() => {
                        toggleAsset(asset.id);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {asset.originalName}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatDate(asset.createdAt)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="hover:bg-muted/40 flex items-start gap-2.5 rounded-lg border p-3">
          <Checkbox
            checked={includeFiles}
            className="mt-0.5"
            id="export-include-files"
            onCheckedChange={(checked) => {
              setIncludeFiles(checked);
            }}
          />
          <div className="grid gap-0.5">
            <Label htmlFor="export-include-files">包含原始文件</Label>
            <span className="text-muted-foreground text-xs">
              关闭后只导出清单与元数据（data.csv），不打包图片与视频。
            </span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          取消
        </Button>
        <Button
          disabled={!canSubmit || createMutation.isPending}
          onClick={handleSubmit}
        >
          {createMutation.isPending ? "正在创建…" : "开始导出"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

/** 新建导出任务：先选类型与目标，再决定是否包含原始文件。 */
export const ExportCreateDialog = ({
  onOpenChange,
  open,
}: ExportCreateDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    {open ? (
      <ExportCreateBody
        onClose={() => {
          onOpenChange(false);
        }}
      />
    ) : null}
  </Dialog>
);
