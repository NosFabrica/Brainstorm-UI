import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/**
 * Markdown as the author meant it — headings, emphasis, lists, code, links
 * — sanitised, with links opening in a new tab. For bodies written in
 * markdown (issues, pull requests); the article reader has its own richer
 * renderer with media embeds.
 */
export function MarkdownBody({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div
      className={`text-sm leading-relaxed text-slate-700 dark:text-slate-200 break-words [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] dark:[&_code]:bg-slate-800 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_a]:font-medium [&_a]:text-brand-link [&_a]:underline [&_a]:decoration-brand-link/40 [&_a]:underline-offset-2 [&_table]:my-2 [&_table]:text-xs [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => (
            <a href={typeof href === "string" ? href : undefined} target="_blank" rel="noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
