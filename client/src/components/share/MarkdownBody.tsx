import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

const IMAGE_URL = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;

/**
 * Markdown as the author meant it — headings, emphasis, lists, code, links
 * — sanitised, with links opening in a new tab. For bodies written in
 * markdown (issues, pull requests); the article reader has its own richer
 * renderer with media embeds. Set on ReadingText's `body` scale, so an
 * issue reads like any other description on an event page.
 */
export function MarkdownBody({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div
      className={`max-w-[68ch] text-[15px] sm:text-base leading-[1.65] text-slate-700 dark:text-slate-200 break-words [&_h1]:mt-5 [&_h1]:text-[1.15em] [&_h1]:font-bold [&_h1]:text-slate-900 dark:[&_h1]:text-white [&_h2]:mt-5 [&_h2]:text-[1.07em] [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-white [&_h3]:mt-4 [&_h3]:font-semibold [&_p]:my-[0.85em] [&_ul]:my-[0.85em] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-[0.85em] [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] dark:[&_code]:bg-slate-800 [&_pre]:my-[0.85em] [&_pre]:overflow-x-auto [&_pre]:text-[0.85em] [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100 [&_blockquote]:my-[0.85em] [&_blockquote]:border-l-[3px] [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_a]:font-medium [&_a]:text-brand-link [&_a]:underline [&_a]:decoration-brand-link/40 [&_a]:underline-offset-2 [&_table]:my-2 [&_table]:text-xs [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) => {
            const url = typeof href === "string" ? href : "";
            const text = Array.isArray(children) ? children.map((c) => (typeof c === "string" ? c : "")).join("") : String(children ?? "");
            // A bare picture URL (autolinked, text equal to the address) is the
            // picture — bug reports lead with screenshots this way.
            if (url && text.trim() === url.trim() && IMAGE_URL.test(url)) {
              return <img src={url} alt="" loading="lazy" className="my-2 block max-h-[34rem] max-w-full rounded-lg border border-slate-200 dark:border-slate-800 object-contain" />;
            }
            return (
              <a href={url || undefined} target="_blank" rel="noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
