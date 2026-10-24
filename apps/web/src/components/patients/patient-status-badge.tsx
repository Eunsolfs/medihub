import { Badge } from "@medihub/ui/components/badge";

import type { PatientStatus } from "#src/components/patients/types.ts";
import { patientStatusLabel } from "#src/lib/format.ts";

const STATUS_VARIANTS = {
  active: "default",
  archived: "outline",
  follow_up: "secondary",
} as const;

interface PatientStatusBadgeProps {
  status: PatientStatus;
  className?: string;
}

/** 患者状态：在诊 / 随访中 / 已归档。 */
export const PatientStatusBadge = ({
  status,
  className,
}: PatientStatusBadgeProps) => (
  <Badge className={className} variant={STATUS_VARIANTS[status]}>
    {patientStatusLabel(status)}
  </Badge>
);
