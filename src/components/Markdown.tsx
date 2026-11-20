"use client";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/**
 * A one-line display equation like "$$a^2+b^2=c^2$$" inside a paragraph is parsed as inline maths.
 * Put $$ blocks on their own lines so they render as display equations.
 */
export function normaliseDisplayMath(text: string): string {
  return text.replace(/\$\$([^$]+?)\$\$/g, (_m, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`);
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-chat break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>
        {normaliseDisplayMath(text)}
      </ReactMarkdown>
    </div>
  );
});
