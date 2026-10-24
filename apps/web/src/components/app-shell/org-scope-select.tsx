import { Building2, ChevronsUpDown } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@medihub/ui/components/select";
import { Skeleton } from "@medihub/ui/components/skeleton";

import { useOrgScope } from "#src/lib/org-scope.ts";

interface OrgScopeSelectProps {
  className?: string;
  /** 移动端用更紧凑的尺寸。 */
  compact?: boolean;
}

/**
 * root 专属的科室作用域切换器：所有列表、详情与上传都会跟随这里选择的科室。
 */
export const OrgScopeSelect = ({ className, compact }: OrgScopeSelectProps) => {
  const { changeScope, isRoot, organizationId, organizations } = useOrgScope();

  if (!isRoot) {
    return null;
  }

  if (organizations.length === 0) {
    return <Skeleton className={compact ? "h-9 w-28" : "h-9 w-40"} />;
  }

  return (
    <Select
      // Base UI 需要 items 才能把 value 显示成科室名，否则会显示原始 id。
      items={organizations.map((row) => ({
        label: row.name,
        value: row.id,
      }))}
      onValueChange={(value) => {
        void changeScope(String(value));
      }}
      value={organizationId ?? organizations[0]?.id ?? ""}
    >
      <SelectTrigger
        aria-label="切换科室"
        className={className ?? (compact ? "h-9 w-28" : "h-9 w-44")}
        size="sm"
      >
        <Building2 aria-hidden="true" className="text-muted-foreground" />
        <SelectValue />
        <ChevronsUpDown
          aria-hidden="true"
          className="text-muted-foreground ml-auto"
        />
      </SelectTrigger>
      <SelectContent>
        {organizations.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            {row.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
