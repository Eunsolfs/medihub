import { useQuery } from "@tanstack/react-query";
import {
  Building2Icon,
  ChevronDownIcon,
  SearchIcon,
  UserCheckIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Checkbox } from "@medihub/ui/components/checkbox";
import { Input } from "@medihub/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Skeleton } from "@medihub/ui/components/skeleton";
import { cn } from "@medihub/ui/lib/utils";

import { api } from "#src/lib/api.ts";
import { roleLabel } from "#src/lib/format.ts";

interface AudienceSelectorProps {
  disabled?: boolean;
  /** 科室管理员固定的本科室；root 传 null。 */
  organizationId: string | null;
  organizationName: string | null;
  onChangeOrganizations: (ids: string[]) => void;
  onChangeUsers: (ids: string[]) => void;
  organizations: string[];
  role: string | null | undefined;
  users: string[];
}

const userLabelOf = (user: {
  organizationName: string | null;
  role: string;
  title: string | null;
}) =>
  [user.title, roleLabel(user.role), user.organizationName]
    .filter((part) => part !== null && part !== "" && part !== undefined)
    .join(" · ");

/**
 * 「指定对象」的名单选择器：
 * - 科室管理员固定本科室（勾选且置灰），成员列表也固定本科室；
 * - root 可以多选科室，并按所选科室切换成员列表；
 * - 移动端整体折叠，内部纵向滚动，不产生横向溢出。
 */
export const AudienceSelector = ({
  disabled = false,
  organizationId,
  organizationName,
  onChangeOrganizations,
  onChangeUsers,
  organizations,
  role,
  users,
}: AudienceSelectorProps) => {
  const isRoot = role === "root";
  const canListPeople = isRoot || role === "dept_admin";
  const [open, setOpen] = useState(true);
  const [memberOrgFilter, setMemberOrgFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const orgsQuery = useQuery(
    api.orgs.list.queryOptions({
      enabled: isRoot,
      input: { kind: "department", page: 1, pageSize: 100 },
    })
  );

  const usersQuery = useQuery(
    api.users.list.queryOptions({
      enabled: canListPeople,
      input: { page: 1, pageSize: 100 },
    })
  );

  const orgOptions = orgsQuery.data?.items ?? [];

  const allUsers = useMemo(
    () => usersQuery.data?.items ?? [],
    [usersQuery.data]
  );

  const selectedOrgIds = useMemo(
    () => (isRoot ? organizations : organizationId ? [organizationId] : []),
    [isRoot, organizations, organizationId]
  );

  const organizationNameOf = (id: string): string =>
    orgOptions.find((option) => option.id === id)?.name ??
    (id === organizationId ? (organizationName ?? "本科室") : "未知科室");

  const activeMemberOrg =
    memberOrgFilter !== "all" && selectedOrgIds.includes(memberOrgFilter)
      ? memberOrgFilter
      : "all";

  const filteredUsers = useMemo(() => {
    const byOrganization = allUsers.filter((user) => {
      if (!isRoot) {
        return true;
      }

      if (activeMemberOrg !== "all") {
        return user.organizationId === activeMemberOrg;
      }

      return (
        selectedOrgIds.length === 0 ||
        selectedOrgIds.includes(user.organizationId ?? "")
      );
    });

    const term = keyword.trim();

    return term.length === 0
      ? byOrganization
      : byOrganization.filter(
          (user) =>
            user.name.includes(term) ||
            (user.title ?? "").includes(term) ||
            user.email.includes(term)
        );
  }, [activeMemberOrg, allUsers, isRoot, keyword, selectedOrgIds]);

  const memberOrgItems = [
    { label: "全部已选科室", value: "all" },
    ...selectedOrgIds.map((id) => ({
      label: organizationNameOf(id),
      value: id,
    })),
  ];

  const toggleOrganization = (id: string) => {
    if (disabled || !isRoot) {
      return;
    }

    onChangeOrganizations(
      organizations.includes(id)
        ? organizations.filter((item) => item !== id)
        : [...organizations, id]
    );
  };

  const toggleUser = (id: string) => {
    if (disabled) {
      return;
    }

    onChangeUsers(
      users.includes(id) ? users.filter((item) => item !== id) : [...users, id]
    );
  };

  const userNameOf = (id: string): string =>
    allUsers.find((user) => user.id === id)?.name ?? "已选成员";

  return (
    <div className="grid gap-2">
      <button
        aria-expanded={open}
        className="border-input hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors"
        onClick={() => {
          setOpen((previous) => !previous);
        }}
        type="button"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <UserCheckIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate font-medium">指定对象</span>
        </span>
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs tabular-nums">
          科室 {selectedOrgIds.length} · 用户 {users.length}
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180"
            )}
          />
        </span>
      </button>

      {open ? (
        <div className="grid min-w-0 gap-3 rounded-lg border p-2.5">
          <div className="grid min-w-0 gap-1.5">
            <p className="inline-flex items-center gap-1 text-xs font-medium">
              <Building2Icon className="text-muted-foreground size-3.5" />
              指定科室
            </p>

            {isRoot ? (
              orgsQuery.isPending ? (
                <div className="grid gap-1">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : orgOptions.length === 0 ? (
                <p className="text-muted-foreground rounded-md border border-dashed px-2 py-2 text-xs">
                  暂无可选科室。
                </p>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-lg border p-1">
                  {orgOptions.map((organization) => (
                    <label
                      className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1"
                      key={organization.id}
                    >
                      <Checkbox
                        checked={organizations.includes(organization.id)}
                        disabled={disabled}
                        onCheckedChange={() => {
                          toggleOrganization(organization.id);
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {organization.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-[0.7rem]">
                          {organization.code}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            ) : (
              <label className="bg-muted/40 flex items-start gap-2 rounded-lg px-2 py-1.5">
                <Checkbox checked disabled />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {organizationName ?? "本科室"}
                  </span>
                  <span className="text-muted-foreground block text-[0.7rem]">
                    科室管理员只能指定本科室
                  </span>
                </span>
              </label>
            )}
          </div>

          <div className="grid min-w-0 gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">指定用户</p>
              {isRoot && selectedOrgIds.length > 0 ? (
                <Select
                  items={memberOrgItems}
                  onValueChange={(next) => {
                    if (next) {
                      setMemberOrgFilter(next);
                    }
                  }}
                  value={activeMemberOrg}
                >
                  <SelectTrigger
                    aria-label="按科室切换成员列表"
                    className="h-7 w-36"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {memberOrgItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            <div className="relative">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                aria-label="搜索指定用户"
                className="h-8 pl-8"
                disabled={disabled}
                onChange={(event) => {
                  setKeyword(event.target.value);
                }}
                placeholder="搜索姓名、职称或邮箱"
                value={keyword}
              />
            </div>

            {usersQuery.isPending ? (
              <div className="grid gap-1">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-2 py-2 text-xs">
                {selectedOrgIds.length === 0 && isRoot
                  ? "先选择科室，或直接在全部成员里挑选。"
                  : "没有匹配的成员。"}
              </p>
            ) : (
              <div className="max-h-52 overflow-y-auto rounded-lg border p-1">
                {filteredUsers.map((user) => (
                  <label
                    className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1"
                    key={user.id}
                  >
                    <Checkbox
                      checked={users.includes(user.id)}
                      disabled={disabled}
                      onCheckedChange={() => {
                        toggleUser(user.id);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {user.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-[0.7rem]">
                        {userLabelOf(user)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {users.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {users.map((id) => (
                  <span
                    className="bg-secondary text-secondary-foreground inline-flex h-6 max-w-full items-center gap-1 rounded-md pr-1 pl-2 text-xs"
                    key={id}
                  >
                    <span className="truncate">{userNameOf(id)}</span>
                    <button
                      aria-label={`移除指定用户 ${userNameOf(id)}`}
                      className="hover:bg-foreground/10 grid size-4 shrink-0 place-items-center rounded-sm transition-colors disabled:opacity-50"
                      disabled={disabled}
                      onClick={() => {
                        toggleUser(id);
                      }}
                      type="button"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <p className="text-muted-foreground text-[0.7rem] leading-relaxed">
            {isRoot
              ? "可以同时指定多个科室与成员；名单内的人登录后即可阅读。"
              : "本科室成员登录后即可阅读；名单外的同事看不到正文。"}
          </p>
        </div>
      ) : null}
    </div>
  );
};
