"use client";

import { Component, memo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = { children: string };

class MarkdownErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Swallow render errors — fall back to plain text below.
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ⚡ Bolt: Using React.memo for MarkdownContent bypasses expensive ReactMarkdown
// parses on re-renders when the source markdown string hasn't changed.
export const MarkdownContent = memo(function MarkdownContent({ children }: MarkdownContentProps) {
  const fallback = (
    <p className="whitespace-pre-wrap text-sm text-foreground">{children}</p>
  );

  return (
    <MarkdownErrorBoundary fallback={fallback}>
      <div className="markdown-body text-sm text-foreground leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            p: ({ children }) => (
              <p className="mb-3 last:mb-0 whitespace-pre-wrap">{children}</p>
            ),
            h1: ({ children }) => (
              <h1 className="mt-4 mb-2 text-lg font-semibold">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-4 mb-2 text-base font-semibold">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-3 mb-2 text-sm font-semibold">{children}</h3>
            ),
            ul: ({ children }) => (
              <ul className="mb-3 list-disc pl-5 space-y-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 list-decimal pl-5 space-y-1">{children}</ol>
            ),
            li: ({ children }) => <li className="pl-0.5">{children}</li>,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline break-all"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="mb-3 border-l-2 border-border pl-3 text-muted-foreground italic">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-4 border-border" />,
            table: ({ children }) => (
              <div className="mb-3 overflow-x-auto">
                <table className="min-w-full border border-border text-xs">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-border bg-muted/40 px-2 py-1 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border px-2 py-1 align-top">
                {children}
              </td>
            ),
            code: ({ className, children, ...props }) => {
              const isBlock = /language-/.test(className ?? "");
              if (isBlock) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="mb-3 overflow-x-auto rounded-md bg-background border border-border p-3 text-xs text-foreground">
                {children}
              </pre>
            ),
          }}
        >
          {children}
        </ReactMarkdown>
      </div>
    </MarkdownErrorBoundary>
  );
});
