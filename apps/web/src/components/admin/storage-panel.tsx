import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  HardDriveIcon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@medihub/ui/components/button";
import { Switch } from "@medihub/ui/components/switch";

import { Pill } from "#src/components/admin/badges.tsx";
import type { PillTone } from "#src/components/admin/badges.tsx";
import {
  storageDriverLabel,
  storageScopeLabel,
} from "#src/components/admin/constants.ts";
import { MirrorBackupCard } from "#src/components/admin/mirror-backup-card.tsx";
import { StorageFormDialog } from "#src/components/admin/storage-form-dialog.tsx";
import { StorageQuotaCard } from "#src/components/admin/storage-quota-card.tsx";
import type {
  AdminViewer,
  StorageDriver,
  StorageTargetRow,
} from "#src/components/admin/types.ts";
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { SkeletonTable } from "#src/components/app-shell/ui/skeletons.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";

const driverTone = (driver: StorageDriver): PillTone => {
  if (driver === "s3") {
    return "warning";
  }

  return driver === "nas" ? "info" : "neutral";
};

interface StorageCardProps {
  target: StorageTargetRow;
  testPending: boolean;
  togglePending: boolean;
  onDelete: (target: StorageTargetRow) => void;
  onEdit: (target: StorageTargetRow) => void;
  onSetDefault: (target: StorageTargetRow) => void;
  onTest: (target: StorageTargetRow) => void;
  onToggle: (target: StorageTargetRow, enabled: boolean) => void;
}

const StorageCard = ({
  target,
  testPending,
  togglePending,
  onDelete,
  onEdit,
  onSetDefault,
  onTest,
  onToggle,
}: StorageCardProps) => (
  <article className="bg-card ring-foreground/10 grid gap-4 rounded-xl p-4 text-sm ring-1">
    <div className="flex items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-medium">{target.name}</h3>
          {target.isDefault ? <Pill tone="primary">默认</Pill> : null}
          <Pill tone={driverTone(target.driver)}>
            {storageDriverLabel(target.driver)}
          </Pill>
        </div>
        <p className="text-muted-foreground text-xs">
          {storageScopeLabel(target.scope)}
          {target.scope === "organization" && target.organizationName
            ? ` · ${target.organizationName}`
            : ""}
          {" · "}
          {target.enabled ? "已启用" : "已停用"}
        </p>
      </div>
      <Switch
        aria-label={`${target.enabled ? "停用" : "启用"} ${target.name}`}
        checked={target.enabled}
        disabled={togglePending}
        onCheckedChange={(checked) => {
          onToggle(target, checked);
        }}
      />
    </div>

    <dl className="grid gap-1.5 text-xs">
      {target.summary.kind === "s3" ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground shrink-0">Endpoint</dt>
            <dd className="min-w-0 truncate text-right font-mono">
              {target.summary.endpoint ?? "AWS 默认"}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground shrink-0">Bucket</dt>
            <dd className="min-w-0 truncate text-right font-mono">
              {target.summary.bucket}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground shrink-0">Region</dt>
            <dd className="min-w-0 truncate text-right font-mono">
              {target.summary.region}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground shrink-0">Access Key</dt>
            <dd className="min-w-0 truncate text-right font-mono">
              {target.summary.accessKeyIdMasked}
            </dd>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground shrink-0">根路径</dt>
          <dd className="min-w-0 text-right font-mono break-all">
            {target.summary.rootPath}
          </dd>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <dt className="text-muted-foreground shrink-0">创建时间</dt>
        <dd className="text-right whitespace-nowrap tabular-nums">
          {formatDateTime(target.createdAt)}
        </dd>
      </div>
    </dl>

    <div className="flex flex-wrap items-center gap-2">
      <Button
        disabled={testPending}
        onClick={() => {
          onTest(target);
        }}
        size="sm"
        variant="outline"
      >
        <PlugZapIcon />
        {testPending ? "测试中…" : "测试连接"}
      </Button>
      <Button
        disabled={target.isDefault || !target.enabled}
        onClick={() => {
          onSetDefault(target);
        }}
        size="sm"
        title={target.enabled ? undefined : "请先启用该存储目标"}
        variant="outline"
      >
        <StarIcon />
        {target.isDefault ? "默认存储" : "设为默认"}
      </Button>
      <Button
        aria-label={`编辑 ${target.name}`}
        onClick={() => {
          onEdit(target);
        }}
        size="icon-sm"
        title="编辑存储目标"
        variant="ghost"
      >
        <PencilIcon />
      </Button>
      <Button
        aria-label={`删除 ${target.name}`}
        onClick={() => {
          onDelete(target);
        }}
        size="icon-sm"
        title="删除存储目标"
        variant="ghost"
      >
        <Trash2Icon />
      </Button>
    </div>
  </article>
);

interface StorageListProps {
  testId: string | null;
  togglePending: boolean;
  onDelete: (target: StorageTargetRow) => void;
  onEdit: (target: StorageTargetRow) => void;
  onSetDefault: (target: StorageTargetRow) => void;
  onTest: (target: StorageTargetRow) => void;
  onToggle: (target: StorageTargetRow, enabled: boolean) => void;
}

const StorageList = ({
  testId,
  togglePending,
  onDelete,
  onEdit,
  onSetDefault,
  onTest,
  onToggle,
}: StorageListProps) => {
  const { data } = useSuspenseQuery(api.storage.list.queryOptions());

  if (data.length === 0) {
    return (
      <EmptyState
        description="添加本地目录、NAS 挂载或 S3 对象存储，素材与导出包会写入默认目标。"
        icon={HardDriveIcon}
        title="还没有存储目标"
      />
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.map((target) => (
        <li key={target.id}>
          <StorageCard
            onDelete={onDelete}
            onEdit={onEdit}
            onSetDefault={onSetDefault}
            onTest={onTest}
            onToggle={onToggle}
            target={target}
            testPending={testId === target.id}
            togglePending={togglePending}
          />
        </li>
      ))}
    </ul>
  );
};

interface StoragePanelProps {
  viewer: AdminViewer;
}

export const StoragePanel = ({ viewer }: StoragePanelProps) => {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StorageTargetRow | null>(null);

  const [pendingDelete, setPendingDelete] = useState<StorageTargetRow | null>(
    null
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: api.storage.key() });
  };

  const updateMutation = useMutation(
    api.storage.update.mutationOptions({
      onSuccess: async (updated) => {
        toast.success(updated.enabled ? "存储目标已启用" : "存储目标已停用");
        await invalidate();
      },
    })
  );

  const testMutation = useMutation(
    api.storage.test.mutationOptions({
      onSuccess: (result) => {
        if (result.ok) {
          toast.success(result.message);
        } else {
          toast.error(`连接失败：${result.message}`);
        }
      },
    })
  );

  const defaultMutation = useMutation(
    api.storage.setDefault.mutationOptions({
      onSuccess: async () => {
        toast.success("已设为默认存储目标");
        await invalidate();
      },
    })
  );

  const removeMutation = useMutation(
    api.storage.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("存储目标已删除");
        setPendingDelete(null);
        await invalidate();
      },
    })
  );

  return (
    <div className="grid gap-3">
      <StorageQuotaCard viewer={viewer} />

      {viewer.role === "root" ? <MirrorBackupCard /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-medium">存储目标</h2>
          <p className="text-muted-foreground text-xs text-pretty">
            素材与导出包写入默认目标；每个作用范围只能有一个默认目标。
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          size="sm"
        >
          <PlusIcon />
          新建存储目标
        </Button>
      </div>

      <Suspense fallback={<SkeletonTable columns={3} rows={4} />}>
        <StorageList
          onDelete={setPendingDelete}
          onEdit={(target) => {
            setEditing(target);
            setFormOpen(true);
          }}
          onSetDefault={(target) => {
            defaultMutation.mutate({ id: target.id });
          }}
          onTest={(target) => {
            testMutation.mutate({ id: target.id });
          }}
          onToggle={(target, enabled) => {
            updateMutation.mutate({ enabled, id: target.id });
          }}
          testId={
            testMutation.isPending ? (testMutation.variables?.id ?? null) : null
          }
          togglePending={updateMutation.isPending}
        />
      </Suspense>

      {formOpen ? (
        <StorageFormDialog
          key={editing?.id ?? "create"}
          onOpenChange={setFormOpen}
          open={formOpen}
          target={editing}
          viewer={viewer}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除"
        description={
          pendingDelete
            ? `将删除存储目标「${pendingDelete.name}」；若仍有素材存放在此，后端会拒绝删除并提示原因。`
            : undefined
        }
        isPending={removeMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) {
            removeMutation.mutate({ id: pendingDelete.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        open={pendingDelete !== null}
        title="删除存储目标？"
        tone="destructive"
      />
    </div>
  );
};
