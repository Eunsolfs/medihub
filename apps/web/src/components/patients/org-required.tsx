import { Link } from "@tanstack/react-router";
import { Building2Icon } from "lucide-react";

import { buttonVariants } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

/**
 * 没有归属科室的账号访问患者档案时的拦截页。
 * 路由在 loader 阶段就跳过所有请求，这里只负责说明与出口。
 */
export const PatientsOrgRequired = () => (
  <div className="grid min-h-96 place-items-center px-4 py-10">
    <div className="w-full max-w-md text-center">
      <span
        aria-hidden="true"
        className="bg-muted text-muted-foreground mx-auto mb-4 grid size-12 place-items-center rounded-full"
      >
        <Building2Icon className="size-5" />
      </span>
      <h1 className="text-lg font-semibold">无法使用患者档案</h1>
      <p className="text-muted-foreground mt-2 text-sm text-pretty">
        当前账号没有归属科室，患者档案与影像上传需要科室归属；请联系管理员在系统管理
        → 待分配用户里分配科室。
      </p>
      <Link className={cn(buttonVariants(), "mt-5")} to="/dashboard">
        返回工作台
      </Link>
    </div>
  </div>
);
