import { InfoIcon } from "lucide-react";

/**
 * 无科室账号的只读提示：出现在教学、会议、资料库等发布入口所在页面。
 * 解释「为什么看不到发布按钮」，并给出下一步（联系管理员分配科室）。
 */
export const OrglessNotice = () => (
  <div className="bg-warning/10 text-warning-foreground border-warning/30 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
    <InfoIcon className="mt-0.5 size-4 shrink-0" />
    <p>
      当前账号还没有归属科室，只能浏览与下载公开内容，不能发布文章、创建会议或上传科室资料。
      请联系科室管理员在「系统管理 → 待分配用户」里把账号分配到科室。
    </p>
  </div>
);
