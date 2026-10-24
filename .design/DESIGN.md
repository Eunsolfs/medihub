# 医档通 MediHub · 设计规范

> 版本 v1 · 2026-10-24 · 负责人：ui-lead（设计体系与应用外壳）
> 令牌唯一来源：`packages/ui/src/styles/globals.css`；本文件是用法与规则说明，不复制实现。

---

## 1. 设计方向：临床专业感（Clinical Precision）

三个关键词：**冷静、可信、信息优先**。这是一线医生每天高频使用的资料后台，不是营销页面：
视觉安静、层级稳定、看数快、可长时间阅读。

**配色逻辑**

- **冷品牌 + 暖底色**：主色用临床青蓝（oklch hue 219），传达医疗的可靠与克制；表面用暖中性灰
  （hue 85 的极低彩度），长时间看照片与表格不刺眼。避免紫色 SaaS 渐变——它读起来像通用工具，
  而不是临床系统。
- **语义色只用于状态**：成功绿、警示琥珀、信息蓝、危险红只出现在徽章、进度与提示上，
  不用于装饰、不用于大面积填充。
- **层级靠线，不靠影**：卡片一律 `ring-1 ring-foreground/10` + 1px 分隔线表达层级；全站不使用
  投影堆叠（弹层由组件库自带的轻投影负责）。

**动效纪律**：只服务于状态变化（Sheet/Dialog 的 fade + 短距位移，150–200ms），
不做循环动画、视差或装饰性粒子；所有过渡走 `motion-safe` 语义（`prefers-reduced-motion` 时退化）。

**中文排版**：字号层级少而稳定（标题 / 分区标题 / 正文 / 元信息 / 标签），数字统一等宽
（`tabular-nums`），避免翻页时列宽跳动。

---

## 2. 设计令牌

浅色为默认，深色为完整对等实现（不是滤镜反转）。页面里**禁止硬编码 hex / oklch**，只用语义令牌。

### 2.1 表面与文字

| 令牌                 | 浅色                     | 深色                     | 用途                 |
| -------------------- | ------------------------ | ------------------------ | -------------------- |
| `--background`       | `oklch(0.985 0.003 85)`  | `oklch(0.178 0.011 252)` | 页面底色（暖白）     |
| `--foreground`       | `oklch(0.235 0.016 250)` | `oklch(0.955 0.004 85)`  | 正文墨色（冷调）     |
| `--card`             | `oklch(1 0 0)`           | `oklch(0.213 0.012 252)` | 卡片、表格容器       |
| `--popover`          | `oklch(1 0 0)`           | `oklch(0.225 0.013 252)` | 弹层、下拉、Sheet    |
| `--muted`            | `oklch(0.965 0.005 85)`  | `oklch(0.26 0.012 252)`  | 表头底、静默底       |
| `--muted-foreground` | `oklch(0.5 0.014 250)`   | `oklch(0.72 0.012 252)`  | 次要说明、表头、占位 |
| `--border`           | `oklch(0.912 0.006 85)`  | `oklch(1 0 0 / 10%)`     | 1px 分隔线           |
| `--input`            | `oklch(0.878 0.008 85)`  | `oklch(1 0 0 / 16%)`     | 输入框描边           |

### 2.2 品牌与语义色

| 令牌                               | 浅色                                               | 深色                                           | 用途                           |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------------- | ------------------------------ |
| `--primary`                        | `oklch(0.49 0.104 219)`                            | `oklch(0.735 0.092 214)`                       | 主操作、选中态、链接、关键数字 |
| `--primary-foreground`             | `oklch(0.988 0.006 219)`                           | `oklch(0.19 0.03 222)`                         | 主色上的文字                   |
| `--accent` / `--accent-foreground` | `oklch(0.955 0.019 219)` / `oklch(0.35 0.075 221)` | `oklch(0.3 0.038 218)` / `oklch(0.9 0.03 215)` | 侧栏选中底、图标容器           |
| `--destructive`                    | `oklch(0.525 0.18 27)`                             | `oklch(0.68 0.16 25)`                          | 删除、错误、病理阶段           |
| `--success`                        | `oklch(0.485 0.11 158)`                            | `oklch(0.76 0.115 158)`                        | 已发布、术后、成功提示         |
| `--warning`                        | `oklch(0.49 0.105 68)`                             | `oklch(0.8 0.115 80)`                          | 待处理、术前、配额接近上限     |
| `--info`                           | `oklch(0.485 0.09 245)`                            | `oklch(0.76 0.085 235)`                        | 术中、科室可见、说明性提示     |

> 语义色在浅色下压到 L≈0.485–0.49，是为了让 `bg-*/10 + text-*` 的 **12px 徽章文字**
> 也满足 WCAG AA 4.5:1（截图审查中绿/琥珀曾只有 4.30/4.42:1，已修正）。不要为了"鲜亮"抬高亮度。

### 2.3 图表色

`--chart-1..5`：青 → 蓝 → 靛 → 琥珀 → 临床绿。色相分离度足够，灰度打印或色弱场景下也能靠明暗区分；
不要用同色系深浅五档（条形图会糊成一片）。

### 2.4 侧栏

`--sidebar` / `--sidebar-foreground` / `--sidebar-accent` / `--sidebar-border`：侧栏比页面底色略深
（浅色）或略亮（深色）一档，选中项用 `sidebar-accent` + 主色图标，不加左侧装饰条以外的额外装饰。

---

## 3. 字号、间距、圆角

### 3.1 字号刻度（Tailwind class → 用途）

| 刻度                      | 用途                                     |
| ------------------------- | ---------------------------------------- |
| `text-[1.7rem]` / 600     | 页面标题（PageHeader 的 h1）             |
| `text-xl` / 600           | 分区大标题、移动端页面标题               |
| `text-base` / 600         | 卡片标题、弹窗标题                       |
| `text-sm` (14px) / 400    | 正文、表格主信息、按钮                   |
| `text-[0.8125rem]` (13px) | 表格单元格、移动端卡片元信息             |
| `text-xs` (12px)          | 表格表头、徽章、标签、辅助计数           |
| `text-[0.7rem]` (11px)    | 侧栏分组标题、文档级微标签（不用于正文） |

规则：

- 正文永远 14px；表格 13px；中文正文行高 1.6，标题 1.2–1.3。
- 12px 留给**短标签与表头**（≤6 字、不换行），不要用它写整句说明。
- 数字列、时间、编号、统计值加 `tabular-nums`。
- 不使用 `tracking-tight` 之外的负字距；中文不做 `uppercase`。

### 3.2 间距节奏（4/8/12/16/24/32）

| 场景            | 值                                     |
| --------------- | -------------------------------------- |
| 图标与文字      | 8px（`gap-2`）                         |
| 徽章/Tag 内间隙 | 4–6px                                  |
| 卡片内边距      | 16px（`p-4`）                          |
| 表格单元格      | 横向 16px、纵向 12px（`px-4 py-3`）    |
| 卡片内元素      | 8–12px                                 |
| 页面区块之间    | 24px（`gap-6`）                        |
| 页面大分节      | 32px                                   |
| 页面左右留白    | **由外壳统一**：`px-4 md:px-6 lg:px-8` |

> **禁止页面自己加左右 padding**。外壳 `<main>` 已经是
> `mx-auto w-full max-w-[1400px] px-4 py-6 pb-24 md:px-6 md:pb-6 lg:px-8 lg:py-8`，
> 页面只写纵向节奏（`grid gap-6`），否则会出现双重留白。
> 移动端额外 `pb-24` 是给底部 tab bar（56px + 安全区）让位。

### 3.3 圆角

| 令牌          | 值   | 用途                 |
| ------------- | ---- | -------------------- |
| `rounded-sm`  | 6px  | Tag、缩略图小容器    |
| `rounded-md`  | 8px  | 小图标容器、进度条   |
| `rounded-lg`  | 10px | 按钮、输入框、导航项 |
| `rounded-xl`  | 14px | 卡片、表格容器、弹窗 |
| `rounded-2xl` | 18px | 移动端底部 Sheet     |
| `rounded-4xl` | pill | 徽章                 |

### 3.4 阴影

不新增自定义阴影。卡片用 `ring-1 ring-foreground/10`，分隔用 `border`；弹层由组件库投影承担。
深色模式靠背景提亮（background → card → popover）表达层级，不靠阴影。

---

## 4. 响应式与应用外壳

| 断点              | 行为                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `≥1024px` 桌面    | 左侧固定侧栏 256px（品牌 + 分组导航 + 存储入口 + 用户卡片）；主区顶栏 56px（面包屑、搜索入口、主题、用户菜单）；内容 `max-w-[1400px]`                                  |
| `768–1023px` 平板 | 左侧 68px 图标窄栏（Tooltip 显示名称）+「展开完整导航」按钮打开抽屉；顶栏保留面包屑                                                                                    |
| `<768px` 移动     | 顶栏 56px（品牌、搜索、账号）+ 底部 tab bar 56px（工作台/患者/资料库/分享/更多）；「更多」打开 Sheet（全量导航 + 主题 + 账号）；安全区用 `env(safe-area-inset-bottom)` |

**外壳归属**：外壳只挂在 `routes/_authenticated.tsx`（`<AppShell><Outlet/></AppShell>`）。
`__root.tsx` 只保留 `ThemeProvider / HeadContent / Outlet / Toaster / devtools`。
因此：

- `/login` 登录页 **不套外壳**（公开、居中、无导航）；
- `/p/$slug` 公开文章页 **不套外壳**（院外/手机阅读版式）；
- 任何挂在 `_authenticated` 下的页面自动获得外壳与登录保护。

**导航数据**：`apps/web/src/components/app-shell/nav.ts` 是唯一来源（href、名称、图标、分组、权限）。
新增入口改这里，不要在页面里各自写导航。系统管理（`/admin`）仅 `root` 与 `dept_admin` 可见，
判断函数 `isAdminRole()`（`app-shell/roles.ts`）。

**移动端触控目标**：`globals.css` 中一条媒体查询把 `[data-slot=button|input|select-trigger|toggle]`
在 `<768px` 下强制 ≥44×44px；自定义链接（导航项、tab）用 `min-h-11` / `min-h-14`。
桌面保持紧凑密度（28–36px）。

**长列表**：超过约 50 行时后续接虚拟滚动；当前表格先按分页（20–50/页）设计，
不要在窄屏用横向滚动承载表格——`DataTableShell` 已内置 <768px 卡片降级。

---

## 5. 组件用法

组件位置：`apps/web/src/components/app-shell/ui/`（外壳与业务展示的公共件）。
导入用 `#src/...` 别名：

```tsx
import { ConfirmDialog } from "#src/components/app-shell/ui/confirm-dialog.tsx";
import { DataTableShell } from "#src/components/app-shell/ui/data-table-shell.tsx";
import { EmptyState } from "#src/components/app-shell/ui/empty-state.tsx";
import { PageHeader } from "#src/components/app-shell/ui/page-header.tsx";
import { PaginationBar } from "#src/components/app-shell/ui/pagination-bar.tsx";
import { SectionCard } from "#src/components/app-shell/ui/section-card.tsx";
import {
  SkeletonTable,
  LoadingRows,
} from "#src/components/app-shell/ui/skeletons.tsx";
import { StatCard } from "#src/components/app-shell/ui/stat-card.tsx";
import {
  RoleBadge,
  StageBadge,
  VisibilityBadge,
} from "#src/components/app-shell/ui/status-badges.tsx";
import { TagList } from "#src/components/app-shell/ui/tag-list.tsx";
```

### 5.1 页面骨架（推荐模板）

```tsx
const PatientsPage = () => (
  <div className="grid gap-6">
    <PageHeader
      title="患者档案"
      description="按入院时间管理伤口与术中影像，支持按阶段与标签筛选。"
      meta={<span>共 248 位患者 · 最近同步 3 分钟前</span>}
      actions={<Button>新建档案</Button>}
    />
    <DataTableShell {...tableProps} />
  </div>
);
```

### 5.2 列表页（DataTableShell）

```tsx
<DataTableShell
  isLoading={isPending}
  columns={[
    {
      key: "patient",
      header: "患者",
      cell: (row) => (
        <div className="grid">
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {row.code}
          </span>
        </div>
      ),
    },
    {
      key: "stage",
      header: "阶段",
      cell: (row) => <StageBadge stage={row.stage} />,
    },
    {
      key: "photos",
      header: "影像",
      align: "right",
      cell: (row) => `${row.photoCount} 张`,
    },
    {
      key: "actions",
      header: "操作",
      align: "right",
      mobileHidden: true,
      cell: () => <Button variant="ghost">查看</Button>,
    },
  ]}
  rows={patients}
  rowKey={(row) => row.id}
  toolbar={<Input placeholder="搜索患者姓名或住院号" />}
  actions={<Button>新建档案</Button>}
  emptyState={
    <EmptyState
      title="暂无患者档案"
      description="调整筛选条件，或新建一位患者。"
    />
  }
  footer={
    <PaginationBar
      page={page}
      pageSize={20}
      total={total}
      onPageChange={setPage}
    />
  }
/>
```

- 窄屏自动把每一行渲染成卡片：第 1 列作为卡片标题，其余列以「标签：值」呈现；
  `mobileHidden` 的列（如操作列）不进入卡片。
- 不支持给整行/整卡加点击：行内跳转请把 `<a>` 放在第一列（首列即移动端卡片标题），
  这样键盘与读屏都能操作，也不会触发 a11y 的「非交互元素带点击」告警。
- 加载态用内置 `SkeletonTable`，与最终布局同形，避免加载完成时跳动。

### 5.3 分区与统计

```tsx
<SectionCard
  title="最近入库"
  description="按上传时间倒序"
  action={<Button size="sm" variant="ghost">查看全部</Button>}
>
  <LoadingRows rows={3} />
</SectionCard>

<StatCard label="在诊患者" value={128} hint="较上周 +6" icon={UsersIcon} href="/patients" />
```

### 5.4 状态徽章

```tsx
<RoleBadge role={user.role} />
<VisibilityBadge visibility={post.visibility} />
<StageBadge stage={photo.stage} />
<TagList tags={patient.tags} max={3} />
```

中文映射与 key 一律来自 `#src/lib/format.ts`（`roleLabel` / `visibilityLabel` / `stageLabel`），
组件只负责颜色与形态。**新增状态不要自己写 label 映射**，在 `format.ts` 里加，告诉 lead。

### 5.5 破坏性操作确认

```tsx
<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  tone="destructive"
  title="删除这份资料？"
  description="删除后该影像将从所有入院记录中移除，且无法恢复。"
  confirmLabel="删除"
  isPending={isPending}
  onConfirm={() => remove.mutate(id)}
/>
```

### 5.6 登录页（`routes/login.tsx` + `components/auth-form.tsx`）

- 桌面 ≥1024px：左右分栏。左侧品牌区（品牌标识、一句定位、3 条能力点）用
  `bg-sidebar` + `bg-grid` 网格纹理 + 主色/强调色柔光，**不放任何患者照片**（隐私与版权）；
  右侧表单列宽 420px、垂直居中。
- 移动 <1024px：单栏，顶部 56px 品牌条，表单从顶部开始（不强行垂直居中以免大屏留白），
  底部小字「内部系统 · 请勿共享账号」。
- 文案固定：标题「登录医档通」、副标题「使用科室分配的邮箱登录」、按钮「登录 / 注册」、
  切换「还没有账号？注册 / 已有账号？登录」。
- 错误映射在 `auth-form.tsx` 的 `authErrorMessage()`：Better Auth 的英文错误统一转成
  「邮箱或密码不正确」「该邮箱已注册，请直接登录」「密码至少 8 位」等可操作中文，
  未知错误按模式回退为「登录失败…」/「注册失败…」。
- 保留 `redirect` 查询参数的校验逻辑（仅允许同源路径），成功后回到原目标页。

### 5.7 外壳与弹层组件的扩展点

`packages/ui/src/components/sheet.tsx` 与 `dialog.tsx` 各加了一个 `variant`：

| 组件            | variant | 用途                                                                                  |
| --------------- | ------- | ------------------------------------------------------------------------------------- |
| `SheetContent`  | `flush` | 全出血面板（`gap-0`），头部/底部由使用方用普通 div 排布：侧栏抽屉、移动端「更多」面板 |
| `DialogContent` | `flush` | 全出血弹层（`gap-0 p-0 overflow-hidden`）：搜索跳转面板                               |

加这两个变体是为了遵守 `@shadcn/lint` 的 "组件拥有自己的间距/形状" 约束——业务侧不再用
`className` 覆盖 Sheet/Dialog 的 padding/gap/border/圆角，而是声明式选 variant。

---

## 6. 反模式（评审时直接判不通过）

1. **紫色/霓虹渐变、发光按钮**：医疗系统的可信度来自克制与一致。
2. **硬编码颜色**：`#123456`、`rgb(...)`、`text-blue-500` 等绕过语义令牌的写法（图表系列色除外）。
3. **重阴影堆叠**：卡片套卡片再套阴影；层级请用 1px 描边与底色差。
4. **多套字号**：同页面出现 4 种以上正文字号，或把 12px 用于整句说明。
5. **表格硬塞窄屏**：375px 出现横向滚动；应使用卡片降级。
6. **emoji 当结构图标**：统一 `lucide-react`，描边粗细一致，尺寸 `size-3/4/5`。
7. **颜色当唯一信息**：阶段、可见范围、发布状态必须同时有中文标签。
8. **页面自带左右 padding**：与外壳重复留白。
9. **循环装饰动画、hover 才可见的操作**：移动端没有 hover。
10. **深色模式缺省**：只做浅色，或深色下分隔线不可见（`--border` 已用 `oklch(1 0 0 / 10%)`）。
11. **在页面里复制组件**：先找 `app-shell/ui/`，缺什么先扩展公共件。
12. **英文占位文案**：界面全中文；`TODO`、`Lorem`、`Coming soon` 一律不允许。

---

## 7. 检查清单（design_review 结论）

对「医疗后台管理系统：列表页 / 时间线 / 移动端 375px」跑了一次规范审查（11 条命中），逐条落地：

| 级别 | 规范                                           | 本项目的做法                                                                                                                              |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 严重 | Touch Target Size（原生 44pt / Web 24px 下限） | Web 端按更严格的 44×44 执行：`<768px` 时 `[data-slot=button/input/select-trigger/toggle]` 强制 44px，导航项 `min-h-11`，tab 项 `min-h-14` |
| 严重 | Parallel Fetching                              | 列表页用 TanStack Query 并行取数（`useSuspenseQuery` + route loader 预取），避免父组件串行 await；`defaultPreload: "intent"` 已开启       |
| 高   | Viewport Meta                                  | `apps/web/index.html` 已含 `width=device-width, initial-scale=1`；新增页面不要覆盖                                                        |
| 高   | Touch Friendly                                 | 同上 44px 规则；可点卡片整块热区，不依赖小图标                                                                                            |
| 高   | Dragging Alternatives                          | 本项目无原生拖拽排序；若后续做时间线排序，必须同时提供「上移/下移」按钮                                                                   |
| 高   | Virtualize Long Lists                          | 现阶段分页（20–50/页）；单页 >50 行时接虚拟滚动，不一次性渲染                                                                             |
| 中   | Mobile First                                   | 组件默认窄屏卡片列表，`md:` 起才有表格；类名按移动端优先书写                                                                              |
| 中   | Table Handling                                 | `DataTableShell` 在 `<768px` 直接换成卡片，不产生横向滚动                                                                                 |
| 中   | Viewport Units                                 | 外壳用 `min-h-svh`，Sheet 用 `max-h-[85svh]`，不用 `100vh`                                                                                |
| 中   | Activity Component                             | 无需要保留状态的频繁显隐组件；Sheet 关闭即卸载，符合预期                                                                                  |
| 低   | Event Listener Dedup                           | 全局只有一个 `Ctrl/⌘+K` keydown 监听，挂在 `AppShell`，卸载时移除                                                                         |

### 交付前通用检查（勾选状态）

- [x] 结构图标统一 lucide-react，不使用 emoji
- [x] 按压态只改颜色/透明，不改变布局尺寸
- [x] 全部颜色走语义令牌，无逐屏硬编码
- [x] 可点元素有 `cursor: pointer`（Button/链接天然具备）与 `focus-visible` 环
- [x] 触摸目标 ≥44px（移动端），桌面 28–36px 紧凑
- [x] 浅色正文对比度 ≥4.5:1；语义色徽章文字 ≥4.5:1（已实测修正绿/琥珀）
- [x] 深色模式独立验证：正文/次要文字/分隔线/按压态均可辨
- [x] 卡片与背景有明确层级（`ring-1` + 底色差）
- [x] 固定顶栏/底栏不遮挡内容（`pb-24` 让位 + `env(safe-area-inset-bottom)`）
- [x] 375px / 768px / 1440px 三档验证，无横向滚动
- [x] 间距遵循 4/8/12/16/24/32 节奏
- [x] 图标有 `aria-hidden` 或可读标签；导航项 `aria-current="page"`；弹层有 `SheetTitle/DialogTitle`
- [x] 表单字段有 label；错误信息写在字段下方
- [x] 颜色不是唯一信息（阶段/可见范围/角色均带文字）
- [x] 尊重 `prefers-reduced-motion`（动效走 `motion-safe`）
- [x] 焦点顺序与视觉顺序一致；Esc 关闭弹层
- [x] 空态 / 加载态 / 错误态 均有设计（EmptyState / SkeletonTable / 表单内联错误）
- [x] 底部导航 5 项（工作台/患者/资料库/分享/更多），未超限
- [ ] 长列表虚拟化（数据量上来后补）
- [ ] 无障碍自动化测试（建议后续接 Playwright + axe）

### 审查里已知的"提示项"及处理

- **卡片里套卡片**：仅出现在 `.design/preview.html` 的文档展示容器中（示例区块本身带边框），
  业务页面不嵌套卡片；已确认外壳与 `SectionCard` 不产生二级边框。
- **12px 说明文字**：预览页里的 11px 标签已提升到 12–13px；业务页面正文 14px，
  12px 仅用于徽章/表头等短标签。

---

## 8. 后续复用规则（给页面开发者）

1. 新页面放在 `apps/web/src/routes/_authenticated/<name>.tsx`，页面根节点只写 `grid gap-6`，
   **不要再写左右 padding / max-width**。
2. 顶部统一 `PageHeader`；分区统一 `SectionCard`；列表统一 `DataTableShell`。
3. 状态、可见范围、诊疗阶段一律用 `app-shell/ui/status-badges.tsx` 的三个徽章，
   文案取自 `#src/lib/format.ts`；缺映射找 lead 加到 `format.ts`。
4. 时间/文件大小/时长用 `format.ts` 的 `formatDate / formatBytes / formatDuration`，
   不要各写 `new Intl.DateTimeFormat`。
5. 页面必须有四态：加载（Skeleton）、空（EmptyState）、错误（就近提示 + 重试）、正常。
6. 权限：`isAdminRole(role)` 判断管理员入口；数据权限仍以 procedure 为准（前端隐藏只是 UX）。
7. 破坏性操作走 `ConfirmDialog`（`tone="destructive"`），文案写清"影响范围 + 不可恢复"。
8. 新增导航项改 `app-shell/nav.ts`，不要在页面里另写导航。
9. 图标只用 `lucide-react`，尺寸 `size-3/3.5/4/5`；不要引入第二套图标库。
10. 提交前跑 `pnpm exec vp check`（格式化 + lint + 类型），`knip` 不允许多余文件/导出。

---

## 9. 交付物与截图

| 交付物                | 路径                                                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 设计令牌              | `packages/ui/src/styles/globals.css`                                                                                                                                                          |
| 应用外壳              | `apps/web/src/components/app-shell/**`（app-shell / app-sidebar / app-topbar / mobile-header / mobile-tab-bar / search-palette / user-menu / theme-menu / nav / roles）                       |
| 公共展示组件          | `apps/web/src/components/app-shell/ui/**`                                                                                                                                                     |
| 根布局 / 登录保护布局 | `apps/web/src/routes/__root.tsx`、`apps/web/src/routes/_authenticated.tsx`                                                                                                                    |
| 设计预览页            | `.design/preview.html`（自包含，可直接双击打开；右上角切换深色）                                                                                                                              |
| 截图                  | `.design/shots/preview-desktop.png`（1440×900）、`.design/shots/preview-mobile.png`（375×812）                                                                                                |
| 登录 / 注册页         | `apps/web/src/routes/login.tsx`、`apps/web/src/components/auth-form.tsx`                                                                                                                      |
| 截图（登录页）        | `.design/shots/login-desktop.png`（1440×900）、`.design/shots/login-mobile.png`（375×812）                                                                                                    |
| 增补的 shadcn 组件    | `packages/ui/src/components/`：table、dialog、alert-dialog、tabs、select、textarea、avatar、sheet、separator、skeleton、tooltip、progress、switch、popover、scroll-area、toggle、toggle-group |
