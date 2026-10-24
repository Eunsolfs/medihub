import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@medihub/ui/components/badge";
import { Button } from "@medihub/ui/components/button";
import { Input } from "@medihub/ui/components/input";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { api } from "#src/lib/api.ts";
import { formatDateTime } from "#src/lib/format.ts";
import { useOrgScope } from "#src/lib/org-scope.ts";

/**
 * 待分配用户：注册时自动落在个人空间里的自然人。
 * 科室管理员把他们认领进本科室；root 认领进顶部当前选中的科室。
 */
export const CandidatesPanel = () => {
  const queryClient = useQueryClient();
  const { currentOrganization, isRoot } = useOrgScope();
  const [expanded, setExpanded] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keyword, setKeyword] = useState("");

  const candidatesQuery = useQuery(
    api.users.candidates.queryOptions({
      input: { page: 1, pageSize: 50, q: keyword || undefined },
    })
  );

  const claimMutation = useMutation(
    api.users.claim.mutationOptions({
      onSuccess: async (member) => {
        const joinedName =
          member?.organizationName ??
          (isRoot ? currentOrganization?.name : null) ??
          "科室";

        toast.success(`已加入 ${joinedName}`);
        await queryClient.invalidateQueries({
          queryKey: api.users.candidates.key(),
        });
        await queryClient.invalidateQueries({ queryKey: api.users.key() });
        await queryClient.invalidateQueries({ queryKey: api.orgs.key() });
      },
    })
  );

  const targetOrganizationId = isRoot ? currentOrganization?.id : undefined;
  const targetOrganizationName = isRoot ? currentOrganization?.name : null;
  const claimDisabled = isRoot && !targetOrganizationId;

  const handleSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setKeyword(keywordDraft.trim());
  };

  const candidates = candidatesQuery.data?.items ?? [];
  const total = candidatesQuery.data?.total ?? 0;
  const filtered = keyword !== "";

  return (
    <section className="bg-card ring-primary/20 overflow-hidden rounded-xl text-sm ring-1">
      <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
        <button
          aria-controls="admin-candidates-list"
          aria-expanded={expanded}
          className="flex min-w-0 items-center gap-2.5 text-left"
          onClick={() => {
            setExpanded((current) => !current);
          }}
          type="button"
        >
          <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-lg">
            <UserPlusIcon className="size-4" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">待分配用户</span>
              <Badge variant="secondary">{total}</Badge>
              {candidatesQuery.isFetching && !candidatesQuery.isPending ? (
                <span className="text-muted-foreground text-xs">刷新中…</span>
              ) : null}
            </span>
            <span className="text-muted-foreground text-xs text-pretty">
              注册后落在个人空间的账号；分配后成为科室成员
            </span>
          </span>
          {expanded ? (
            <ChevronUpIcon className="text-muted-foreground ml-1 size-4 shrink-0" />
          ) : (
            <ChevronDownIcon className="text-muted-foreground ml-1 size-4 shrink-0" />
          )}
        </button>

        <form
          className="flex w-full items-center gap-2 lg:w-auto"
          onSubmit={handleSearch}
        >
          <Input
            aria-label="搜索待分配用户"
            maxLength={80}
            onChange={(event) => {
              setKeywordDraft(event.target.value);
            }}
            placeholder="搜索姓名或邮箱…"
            type="search"
            value={keywordDraft}
          />
          <Button size="sm" type="submit" variant="outline">
            搜索
          </Button>
        </form>
      </div>

      {expanded ? (
        <div id="admin-candidates-list">
          {candidatesQuery.isPending ? (
            <div className="grid gap-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : null}

          {!candidatesQuery.isPending && candidates.length === 0 ? (
            <div className="p-4">
              <EmptyState
                compact
                description={
                  filtered
                    ? "调整搜索关键词试试。"
                    : "新注册的同事会自动出现在这里。"
                }
                icon={UserPlusIcon}
                title="暂无待分配用户"
              />
            </div>
          ) : null}

          {candidates.length > 0 ? (
            <ul className="divide-border divide-y">
              {candidates.map((candidate) => {
                const pending =
                  claimMutation.isPending &&
                  claimMutation.variables?.userId === candidate.id;

                return (
                  <li
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    key={candidate.id}
                  >
                    <div className="grid min-w-0 gap-1">
                      <span className="truncate font-medium">
                        {candidate.name}
                      </span>
                      <span className="text-muted-foreground text-xs break-all">
                        {candidate.email}
                      </span>
                      <span className="text-muted-foreground text-xs text-pretty">
                        注册于 {formatDateTime(candidate.createdAt)} ·
                        个人空间：
                        {candidate.organizationName ?? "—"}
                      </span>
                    </div>
                    <Button
                      className="min-h-11 w-full sm:min-h-8 sm:w-auto"
                      disabled={claimDisabled || pending}
                      onClick={() => {
                        claimMutation.mutate({
                          userId: candidate.id,
                          ...(isRoot && targetOrganizationId
                            ? { organizationId: targetOrganizationId }
                            : {}),
                        });
                      }}
                      size="sm"
                    >
                      {pending
                        ? "正在分配…"
                        : isRoot && targetOrganizationName
                          ? `分配到 ${targetOrganizationName}`
                          : "分配到本科室"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {total > candidates.length ? (
            <p className="text-muted-foreground border-t px-4 py-2.5 text-xs">
              共 {total} 位待分配用户，当前显示 {candidates.length}{" "}
              位，可用搜索查找。
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
