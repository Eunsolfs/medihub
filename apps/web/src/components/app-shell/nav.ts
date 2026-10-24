import {
  CalendarDays,
  Download,
  FolderHeart,
  GraduationCap,
  LayoutDashboard,
  Library,
  Settings,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { isAdminRole, isOrglessRole } from "#src/components/app-shell/roles.ts";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 仅 root / dept_admin 可见 */
  adminOnly?: boolean;
  /** 没有归属科室的账号（individual）看不到这个入口 */
  orglessHidden?: boolean;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * 主导航。href 是团队约定好的固定路径，页面由各业务模块在
 * apps/web/src/routes 下实现，外壳只负责入口与选中态。
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "临床工作",
    items: [
      {
        href: "/dashboard",
        label: "工作台",
        description: "待办、最近患者与资料动态",
        icon: LayoutDashboard,
      },
      {
        href: "/patients",
        label: "患者档案",
        description: "多次入院记录与影像时间线",
        icon: FolderHeart,
        // 没有归属科室的账号不能使用患者档案，入口一并隐藏。
        orglessHidden: true,
      },
    ],
  },
  {
    label: "知识中心",
    items: [
      {
        href: "/library",
        label: "资料库",
        description: "科室培训课件、文档与图片",
        icon: Library,
      },
      {
        href: "/posts",
        label: "教学与分享",
        description: "教学文章与手术视频",
        icon: GraduationCap,
      },
      {
        href: "/sessions",
        label: "学习会议",
        description: "科室学习会与会议资料",
        icon: CalendarDays,
      },
    ],
  },
  {
    label: "管理与个人",
    items: [
      {
        href: "/exports",
        label: "导出中心",
        description: "资料导出任务与下载记录",
        icon: Download,
      },
      {
        href: "/admin",
        label: "系统管理",
        description: "用户权限、角色与存储配置",
        icon: Settings,
        adminOnly: true,
      },
      {
        href: "/me",
        label: "我的",
        description: "账号资料与使用偏好",
        icon: UserRound,
      },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const isVisibleItem = (item: NavItem, role: string | undefined) => {
  if (item.adminOnly === true && !isAdminRole(role)) {
    return false;
  }

  return !(item.orglessHidden === true && isOrglessRole(role));
};

/** 移动端底部标签栏：工作台 / 患者 / 资料库 / 分享，第五项「更多」由外壳提供。 */
export const MOBILE_TABS: readonly NavItem[] = ALL_NAV_ITEMS.filter((item) =>
  ["/dashboard", "/patients", "/library", "/posts"].includes(item.href)
);

/** 按角色过滤后的底部标签：没有归属科室时去掉患者档案。 */
export const visibleMobileTabs = (
  role: string | undefined
): readonly NavItem[] => MOBILE_TABS.filter((tab) => isVisibleItem(tab, role));

export const visibleNavGroups = (
  role: string | undefined
): readonly NavGroup[] => {
  const groups: NavGroup[] = [];

  for (const group of NAV_GROUPS) {
    const items = group.items.filter((item) => isVisibleItem(item, role));

    if (items.length > 0) {
      groups.push({ label: group.label, items });
    }
  }

  return groups;
};

export const isNavActive = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

export interface ActiveNavMatch {
  group: NavGroup;
  item: NavItem;
}

export const findActiveNav = (
  pathname: string,
  role?: string
): ActiveNavMatch | undefined => {
  for (const group of NAV_GROUPS) {
    const item = group.items.find(
      (navItem) =>
        isVisibleItem(navItem, role) && isNavActive(pathname, navItem.href)
    );

    if (item) {
      return { group, item };
    }
  }

  return undefined;
};
