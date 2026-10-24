import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

import {
  NO_ORGANIZATION,
  USER_ROLE_VALUES,
  isUserRole,
  userRoleLabel,
} from "#src/components/admin/constants.ts";
import type {
  AdminViewer,
  UserRole,
  UserRow,
} from "#src/components/admin/types.ts";
import { api } from "#src/lib/api.ts";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入即为编辑模式 */
  user: UserRow | null;
  viewer: AdminViewer;
}

/** 新建 / 编辑账号：科室管理员在这里只能创建普通成员。 */
export const UserFormDialog = ({
  open,
  onOpenChange,
  user,
  viewer,
}: UserFormDialogProps) => {
  const queryClient = useQueryClient();
  const isRoot = viewer.role === "root";
  const editing = user !== null;

  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "member");

  const [organizationId, setOrganizationId] = useState(
    user?.organizationId ?? NO_ORGANIZATION
  );

  const [title, setTitle] = useState(user?.title ?? "");
  const [phone, setPhone] = useState("");

  // 只有 root 需要选择归属科室；科室管理员创建时后端固定使用其本科室。
  const orgsQuery = useQuery({
    ...api.orgs.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: open && isRoot,
  });

  const orgItems = orgsQuery.data?.items ?? [];

  const organizationOptions = orgItems.map((organization) => ({
    label: organization.name,
    value: organization.id,
  }));

  const currentOrganizationId = user?.organizationId ?? null;
  const currentOrganizationName = user?.organizationName ?? null;

  // 组织列表只取前 100 条；当前账号所在科室不在列表里时补一个选项，
  // 避免编辑时下拉框显示成「不归属科室」。
  if (
    currentOrganizationId !== null &&
    currentOrganizationName !== null &&
    !orgItems.some((organization) => organization.id === currentOrganizationId)
  ) {
    organizationOptions.push({
      label: currentOrganizationName,
      value: currentOrganizationId,
    });
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: api.users.key() });
    await queryClient.invalidateQueries({ queryKey: api.orgs.key() });
  };

  const createMutation = useMutation(
    api.users.create.mutationOptions({
      onSuccess: async () => {
        toast.success("账号已创建，可使用邮箱与初始密码登录");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const updateMutation = useMutation(
    api.users.update.mutationOptions({
      onSuccess: async () => {
        toast.success("账号信息已更新");
        await invalidate();
        onOpenChange(false);
      },
    })
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    const effectiveRole: UserRole = isRoot ? role : "member";

    const effectiveOrganizationId =
      organizationId === NO_ORGANIZATION ? null : organizationId;

    if (user) {
      updateMutation.mutate({
        id: user.id,
        name: trimmedName,
        role: effectiveRole,
        // 科室管理员不能把成员移出本科室，因此不提交科室字段。
        ...(isRoot ? { organizationId: effectiveOrganizationId } : {}),
        ...(title.trim() ? { title: title.trim() } : { title: null }),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });

      return;
    }

    createMutation.mutate({
      email: email.trim(),
      name: trimmedName,
      password,
      role: effectiveRole,
      ...(isRoot && effectiveOrganizationId
        ? { organizationId: effectiveOrganizationId }
        : {}),
      title: title.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑账号" : "新建用户"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "邮箱不可修改；角色与归属科室决定账号能看到的数据范围。"
              : "账号创建后可直接使用邮箱与初始密码登录，无需邮件验证。"}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          id="admin-user-form"
          onSubmit={handleSubmit}
        >
          {editing && user ? (
            <div className="grid gap-2">
              <Label htmlFor="admin-user-email">邮箱</Label>
              <Input
                disabled
                id="admin-user-email"
                readOnly
                type="email"
                value={user.email}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="admin-user-email">邮箱</Label>
              <Input
                autoComplete="off"
                id="admin-user-email"
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="name@hospital.org"
                required
                type="email"
                value={email}
              />
            </div>
          )}

          {editing ? null : (
            <div className="grid gap-2">
              <Label htmlFor="admin-user-password">初始密码</Label>
              <Input
                autoComplete="new-password"
                id="admin-user-password"
                minLength={8}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                placeholder="至少 8 位，建议包含字母与数字"
                required
                type="password"
                value={password}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="admin-user-name">姓名</Label>
              <Input
                id="admin-user-name"
                maxLength={60}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder="如：李明"
                required
                value={name}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-user-title">职称 / 职务</Label>
              <Input
                id="admin-user-title"
                maxLength={60}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                placeholder="如：主治医师"
                value={title}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="admin-user-role">角色</Label>
              {isRoot ? (
                <Select
                  items={USER_ROLE_VALUES.map((value) => ({
                    label: userRoleLabel(value),
                    value,
                  }))}
                  onValueChange={(value) => {
                    if (typeof value === "string" && isUserRole(value)) {
                      setRole(value);
                    }
                  }}
                  value={role}
                >
                  <SelectTrigger className="w-full" id="admin-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLE_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {userRoleLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input disabled readOnly value={userRoleLabel("member")} />
                  <p className="text-muted-foreground text-xs">
                    科室管理员只能创建与编辑普通成员账号。
                  </p>
                </>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="admin-user-organization">归属科室</Label>
              {isRoot ? (
                <Select
                  items={[
                    { label: "不归属科室（全局账号）", value: NO_ORGANIZATION },
                    ...organizationOptions,
                  ]}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      setOrganizationId(value);
                    }
                  }}
                  value={organizationId}
                >
                  <SelectTrigger
                    className="w-full"
                    id="admin-user-organization"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ORGANIZATION}>
                      不归属科室（全局账号）
                    </SelectItem>
                    {organizationOptions.map((organization) => (
                      <SelectItem
                        key={organization.value}
                        value={organization.value}
                      >
                        {organization.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-muted-foreground flex h-8 items-center rounded-lg border border-dashed px-2.5 text-xs">
                  账号会自动归入您所在的科室
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="admin-user-phone">联系电话</Label>
            <Input
              id="admin-user-phone"
              inputMode="tel"
              maxLength={30}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              placeholder={
                editing ? "留空表示不修改" : "选填，用于科室内部联系"
              }
              value={phone}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={isPending} form="admin-user-form" type="submit">
            {isPending ? "正在保存…" : editing ? "保存修改" : "创建账号"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
