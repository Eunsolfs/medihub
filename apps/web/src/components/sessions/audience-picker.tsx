import { useQuery } from "@tanstack/react-query";

import { Checkbox } from "@medihub/ui/components/checkbox";

import { api } from "#src/lib/api.ts";
import { roleLabel } from "#src/lib/format.ts";

interface AudiencePickerProps {
  organizationId: string | null;
  organizationName: string | null;
  onOrganizationChange: (ids: string[]) => void;
  onUserChange: (ids: string[]) => void;
  organizationValues: string[];
  role: string | undefined;
  userValues: string[];
}

const toggleId = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

const ScrollList = ({ children }: { children: React.ReactNode }) => (
  <ul className="max-h-44 divide-y overflow-y-auto rounded-lg border">
    {children}
  </ul>
);

const EmptyHint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
    {children}
  </p>
);

/** 「指定对象」：root 可选任意科室与用户，科室管理员只能指定本科室。 */
export const AudiencePicker = ({
  organizationId,
  organizationName,
  onOrganizationChange,
  onUserChange,
  organizationValues,
  role,
  userValues,
}: AudiencePickerProps) => {
  const isRoot = role === "root";

  const organizationsQuery = useQuery({
    ...api.orgs.list.queryOptions({ input: { page: 1, pageSize: 100 } }),
    enabled: isRoot,
  });

  const usersQuery = useQuery({
    ...api.users.list.queryOptions({
      input: {
        organizationId: isRoot ? undefined : (organizationId ?? undefined),
        page: 1,
        pageSize: 100,
      },
    }),
    enabled: role === "root" || role === "dept_admin",
  });

  const organizations = organizationsQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];

  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <div className="grid gap-2">
        <p className="text-sm font-medium">指定科室</p>
        {isRoot ? (
          organizations.length === 0 ? (
            <EmptyHint>没有可指定的科室</EmptyHint>
          ) : (
            <ScrollList>
              {organizations.map((organization) => (
                <li key={organization.id}>
                  <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                    <Checkbox
                      checked={organizationValues.includes(organization.id)}
                      onCheckedChange={() => {
                        onOrganizationChange(
                          toggleId(organizationValues, organization.id)
                        );
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {organization.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {organization.code}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ScrollList>
          )
        ) : (
          <label className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm">
            <Checkbox checked disabled />
            <span className="min-w-0 flex-1 truncate">
              {organizationName ?? "本科室"}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              管理员只能指定本科室
            </span>
          </label>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">指定用户</p>
        {users.length === 0 ? (
          <EmptyHint>没有可指定的用户</EmptyHint>
        ) : (
          <ScrollList>
            {users.map((member) => (
              <li key={member.id}>
                <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                  <Checkbox
                    checked={userValues.includes(member.id)}
                    onCheckedChange={() => {
                      onUserChange(toggleId(userValues, member.id));
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{member.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {member.email} · {roleLabel(member.role)}
                      {member.organizationName
                        ? ` · ${member.organizationName}`
                        : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ScrollList>
        )}
      </div>
    </div>
  );
};
