import oxfmt from "ultracite/oxfmt";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstack from "ultracite/oxlint/tanstack";
import { defineConfig, loadEnv } from "vite-plus";

const generatedFiles = ["**/routeTree.gen.ts", "packages/db/src/migrations/**"];

const vendoredFiles = ["packages/ui/src/components/**"];

export default defineConfig({
  fmt: {
    ...oxfmt,
    ignorePatterns: [...(oxfmt.ignorePatterns ?? []), ...generatedFiles],
    proseWrap: "preserve",
    sortImports: {
      customGroups: [
        {
          elementNamePattern: ["@medihub/**"],
          groupName: "workspace",
        },
      ],
      groups: [
        "builtin",
        "external",
        "workspace",
        ["internal", "subpath"],
        ["parent", "sibling", "index"],
        "style",
        "unknown",
      ],
      ignoreCase: true,
      newlinesBetween: true,
      order: "asc",
    },
  },
  lint: {
    // 测试文件的写法由团队约定（一个用例连续断言完整流程），
    // 不引入 vitest 的断言风格预设。
    extends: [core, react, tanstack, shadcn, antiSlop],
    ignorePatterns: [
      ...(core.ignorePatterns ?? []),
      ...generatedFiles,
      ...vendoredFiles,
      // 一次性截图 / 验收脚本，不是产品代码。
      "apps/web/scripts/**",
    ],
    jsPlugins: [
      // Knip reads this string. A spread of `shadcn.jsPlugins` is invisible to it.
      { name: "shadcn", specifier: "@shadcn/lint" },
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
    ],
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // 应用代码（路由 / 服务端 / 页面 / 组件）的风格取舍，逐条说明：
        // - anti-slop 的几条规则要求在每个 type assertion 前写 `SAFETY:` 注释、
        //   禁止 `...(cond ? {} : { x })` 这种按需赋值。后者是 Drizzle 部分更新的
        //   标准写法，前者会让 200+ 处断言都挂一段模板注释，噪声大于收益。
        // - react/no-danger：Markdown 渲染必须用 dangerouslySetInnerHTML，
        //   输入已经过 DOMPurify 消毒。
        // - react/refs、react(todo)：React Compiler 对「工具栏从 ref 读文本域」
        //   这类写法尚未支持，编译优化跳过即可，不影响正确性。
        // - no-misused-promises / strict-void-return / consistent-return：
        //   JSX 事件处理写成 `onClick={async () => ...}` 是通用惯例。
        // - shadcn/no-restyle：少数内嵌控件（标签输入框、Markdown 代码块）确实需要
        //   覆盖 padding 与字号；设计系统其余部分仍走 variants。
        // 类型安全仍由 `strict`、Zod 与 `typescript/no-unsafe-*` 系列守住。
        files: ["packages/*/src/**", "apps/*/src/**"],
        rules: {
          "anti-slop/no-chained-type-assertions": "off",
          "anti-slop/no-conditional-empty-object-spread": "off",
          "anti-slop/no-known-value-widening": "off",
          "anti-slop/no-runtime-typeof": "off",
          "anti-slop/no-unknown-parameters": "off",
          "anti-slop/no-unsafe-dictionary-type": "off",
          "anti-slop/require-safety-comment-for-type-assertion": "off",
          "eslint/complexity": "off",
          "eslint/no-await-in-loop": "off",
          "eslint/no-bitwise": "off",
          "eslint/no-empty-function": "off",
          "eslint/no-nested-ternary": "off",
          "eslint/prefer-named-capture-group": "off",
          "eslint/require-await": "off",
          "eslint/require-unicode-regexp": "off",
          "eslint/no-use-before-define": "off",
          "eslint/func-style": "off",
          // 自定义交互控件（拖拽时间线、可点缩略图网格、上传热区）用 div 承担
          // 点击与拖拽，键盘可达性由各自的 Enter/Space 处理与 focus 环保证；
          // B 站播放器与 PDF 预览的 iframe 由第三方页面控制，不能加 sandbox。
          "jsx-a11y/click-events-have-key-events": "off",
          "jsx-a11y/label-has-associated-control": "off",
          "jsx-a11y/media-has-caption": "off",
          "jsx-a11y/no-noninteractive-element-interactions": "off",
          "jsx-a11y/no-noninteractive-element-to-interactive-role": "off",
          "jsx-a11y/no-static-element-interactions": "off",
          "jsx-a11y/prefer-tag-over-role": "off",
          "promise/avoid-new": "off",
          "promise/prefer-await-to-callbacks": "off",
          "react/hook-use-state": "off",
          "react/iframe-missing-sandbox": "off",
          "react/jsx-handler-names": "off",
          "react/jsx-no-useless-fragment": "off",
          "react/no-danger": "off",
          "react/refs": "off",
          "react/todo": "off",
          "shadcn/no-arbitrary-values": "off",
          "shadcn/no-inline-styles": "off",
          "shadcn/no-restyle": "off",
          "typescript/consistent-return": "off",
          "typescript/no-confusing-void-expression": "off",
          "typescript/no-misused-promises": "off",
          "typescript/no-unnecessary-type-conversion": "off",
          "typescript/no-unnecessary-type-parameters": "off",
          "typescript/no-unsafe-type-assertion": "off",
          "typescript/strict-void-return": "off",
          "unicorn/consistent-function-scoping": "off",
          "unicorn/prefer-code-point": "off",
          "unicorn/prefer-export-from": "off",
        },
      },
      {
        files: [
          "**/*.test.ts",
          "**/*.e2e.ts",
          "**/*.spec.ts",
          "packages/api/tests/**",
          "apps/web/tests/**",
        ],
        rules: {
          "eslint/no-await-in-loop": "off",
          "eslint/no-empty-function": "off",
          "typescript/no-unnecessary-type-parameters": "off",
          "vitest/max-expects": "off",
          "vitest/prefer-strict-equal": "off",
          "vitest/prefer-to-be-falsy": "off",
          "vitest/prefer-to-be-truthy": "off",
          "vitest/require-to-throw-message": "off",
          "vitest/require-top-level-describe": "off",
        },
      },
      {
        files: ["apps/web/src/routes/**"],
        rules: {
          // A route module exports its `Route` beside the components it renders.
          "react/only-export-components": [
            "warn",
            {
              allowExportNames: ["Route"],
              customHOCs: ["createFileRoute", "createRootRouteWithContext"],
            },
          ],
          // `beforeLoad` guards throw `redirect()`, which is a `Redirect` object rather than an `Error`.
          "typescript/only-throw-error": [
            "error",
            {
              allow: [
                {
                  from: "package",
                  package: "@tanstack/router-core",
                  name: "Redirect",
                },
              ],
            },
          ],
        },
      },
      {
        // Hono middleware awaits `next()`, which is not a Node.js error-first callback.
        files: ["apps/server/src/**"],
        rules: { "node/callback-return": "off" },
      },
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // 本项目的领域模型用 null/undefined 表示「没有」，并且大量用真值判断
      // 守卫会话、可选关联与表单字段（例如 `if (!viewer) throw ORPCError`）。
      // 这两条规则会要求逐处写成 `x !== null && x !== undefined` 与 `??`，
      // 在 20+ 个路由文件里制造数百处噪声而不改变行为，因此全局关闭；
      // 类型层面由 `strict` + Zod 校验保证，不依赖这两条 lint。
      "typescript/strict-boolean-expressions": "off",
      "typescript/prefer-nullish-coalescing": "off",
      // 测试里一个用例往往要连续断言一条业务流程的多个字段，
      // `toBeTruthy` 之类的偏好与「多断言一个 describe」的强制拆分只是写法。
      "vitest/max-expects": "off",
      "vitest/prefer-strict-equal": "off",
      "vitest/prefer-to-be-falsy": "off",
      "vitest/prefer-to-be-truthy": "off",
      "vitest/require-to-throw-message": "off",
      "vitest/require-top-level-describe": "off",
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    projects: [
      {
        test: {
          env: loadEnv("test", `${import.meta.dirname}/apps/server`, ""),
          include: ["packages/api/tests/integration/**/*.test.ts"],
          name: "integration",
        },
      },
      {
        test: {
          include: [
            "apps/server/src/**/*.test.ts",
            "packages/*/src/**/*.test.ts",
          ],
          name: "unit",
        },
      },
    ],
  },
});
