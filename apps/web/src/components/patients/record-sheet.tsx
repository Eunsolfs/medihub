import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@medihub/ui/components/sheet";
import { cn } from "@medihub/ui/lib/utils";

import { useMediaQuery } from "#src/components/patients/use-media-query.ts";

interface RecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * 「全量查看」抽屉：桌面右侧 512px，移动端底部全高。
 * 内容由调用方分组排布，底部固定操作区。
 */
export const RecordSheet = ({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: RecordSheetProps) => {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="data-[side=bottom]:h-svh data-[side=bottom]:max-h-svh data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        side={isDesktop ? "right" : "bottom"}
        variant="flush"
      >
        <div className="flex items-start gap-3 border-b p-4 pr-12">
          <div className="min-w-0 flex-1 space-y-1">
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="bg-muted/40 flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

interface RecordGroupProps {
  title: string;
  children: ReactNode;
}

export const RecordGroup = ({ title, children }: RecordGroupProps) => (
  <section className="grid gap-2">
    <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
      {children}
    </div>
  </section>
);

interface RecordFieldProps {
  label: string;
  value: ReactNode;
  /** 长文本按原样换行显示。 */
  multiline?: boolean;
  mono?: boolean;
  /** 占满整行（长文本、标签等）。 */
  wide?: boolean;
}

const isBlank = (value: ReactNode) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");

export const RecordField = ({
  label,
  value,
  multiline = false,
  mono = false,
  wide = false,
}: RecordFieldProps) => (
  <div className={cn("grid gap-0.5", wide && "sm:col-span-2")}>
    <p className="text-muted-foreground text-xs">{label}</p>
    <div
      className={cn(
        "text-sm break-words",
        multiline && "text-pretty whitespace-pre-wrap",
        mono && "font-mono"
      )}
    >
      {isBlank(value) ? "—" : value}
    </div>
  </div>
);
