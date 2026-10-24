import DOMPurify from "dompurify";
import {
  BoldIcon,
  CodeIcon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  QuoteIcon,
  TableIcon,
} from "lucide-react";
import { marked } from "marked";
import { useMemo, useRef } from "react";
import type { ReactNode } from "react";

import { Button } from "@medihub/ui/components/button";
import { cn } from "@medihub/ui/lib/utils";

const renderMarkdown = (content: string) => {
  const html = marked.parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  });

  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "script"],
    FORBID_ATTR: ["style", "onerror", "onload"],
    USE_PROFILES: { html: true },
  });
};

const markdownStyles =
  "text-sm leading-relaxed break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

export interface MarkdownProps {
  content: string;
  className?: string;
}

/** 只读 Markdown：marked 渲染 + DOMPurify 消毒，帖子正文、素材文本预览共用。 */
export const Markdown = ({ content, className }: MarkdownProps) => {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div
      className={cn(markdownStyles, className)}
      // 已经在 renderMarkdown 里经 DOMPurify 消毒。
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number | string;
  className?: string;
}

interface ToolbarAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/**
 * 轻量 Markdown 编辑器：工具栏插入语法 + 分屏预览（移动端上下单栏）。
 * 不引入重型编辑器，保持依赖只有 marked / dompurify。
 */
export const MarkdownEditor = ({
  value,
  onChange,
  placeholder = "支持 Markdown 语法…",
  minHeight = 320,
  className,
}: MarkdownEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(() => renderMarkdown(value), [value]);

  const focusSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(start, end);
      }
    });
  };

  const insertAtCursor = (snippet: string, selectFrom = snippet.length) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;

    onChange(next);
    focusSelection(start + selectFrom, start + selectFrom);
  };

  const surround = (before: string, after: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || "文字";
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;

    onChange(next);
    focusSelection(
      start + before.length,
      start + before.length + selected.length
    );
  };

  const prefixLine = (prefix: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;

    onChange(next);
    focusSelection(start + prefix.length, start + prefix.length);
  };

  const actions: ToolbarAction[] = [
    {
      icon: <BoldIcon />,
      label: "加粗",
      onClick: () => {
        surround("**", "**");
      },
    },
    {
      icon: <ItalicIcon />,
      label: "斜体",
      onClick: () => {
        surround("*", "*");
      },
    },
    {
      icon: <Heading2Icon />,
      label: "标题",
      onClick: () => {
        prefixLine("## ");
      },
    },
    {
      icon: <ListIcon />,
      label: "列表",
      onClick: () => {
        prefixLine("- ");
      },
    },
    {
      icon: <QuoteIcon />,
      label: "引用",
      onClick: () => {
        prefixLine("> ");
      },
    },
    {
      icon: <CodeIcon />,
      label: "代码块",
      onClick: () => {
        insertAtCursor("\n```\n\n```\n", 6);
      },
    },
    {
      icon: <LinkIcon />,
      label: "链接",
      onClick: () => {
        insertAtCursor("[链接文字](https://)", 0);
      },
    },
    {
      icon: <TableIcon />,
      label: "表格",
      onClick: () => {
        insertAtCursor(
          "\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n",
          0
        );
      },
    },
    {
      icon: <ImageIcon />,
      label: "图片",
      onClick: () => {
        insertAtCursor("![图片说明](https://)", 0);
      },
    },
  ];

  return (
    <div
      className={cn(
        "border-border bg-background flex flex-col overflow-hidden rounded-lg border",
        className
      )}
    >
      <div className="border-border bg-muted/40 flex flex-wrap items-center gap-0.5 border-b p-1">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={action.label}
            aria-label={action.label}
            onClick={action.onClick}
          >
            {action.icon}
          </Button>
        ))}
        <span className="text-muted-foreground ml-auto hidden pr-1 text-xs sm:block">
          支持 Markdown
        </span>
      </div>

      <div className="divide-border grid min-h-0 grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder={placeholder}
          spellCheck={false}
          className="placeholder:text-muted-foreground w-full resize-y bg-transparent p-3 font-mono text-sm leading-relaxed outline-none lg:min-h-full"
          style={{ minHeight }}
        />
        <div className="min-w-0 overflow-auto p-3">
          {value.trim() ? (
            <div
              className={markdownStyles}
              // 已经在 renderMarkdown 里经 DOMPurify 消毒。
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">预览区</p>
          )}
        </div>
      </div>
    </div>
  );
};
