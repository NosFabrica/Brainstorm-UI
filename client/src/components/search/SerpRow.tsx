/**
 * The compact Google-density result row — news-grade. A news-shaped note
 * (headline + article URL + summary, the shape the news bots publish)
 * renders as a real news card: outlet favicon + domain source line,
 * clickable headline out to the article, two-line summary, thumbnail.
 * Ordinary posts keep the author-line + snippet, with bare URLs upgraded
 * to clickable domain chips. The row body opens the in-app event page —
 * a div-with-navigate, so the external anchors inside stay legal HTML.
 */
import { useCallback } from "react";
import { useLocation } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Favicon, LinkChip } from "@/components/share/LinkPreview";
import { highlightTerms } from "@/lib/highlight";
import { parseNewsShape } from "@/lib/newsShape";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { mediaUrlOf, tagVal } from "@/components/search/cards";

function ago(created_at: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - created_at);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(created_at * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;
const URL_SPLIT_RE = /(https?:\/\/\S+)/g;

/** Bold the query terms in a run of plain text. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightTerms(text, query).map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="bg-transparent font-semibold text-slate-900 dark:text-white">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** Snippet where bare URLs become clickable domain chips. */
export function Snippet({ text, query, lines = 3 }: { text: string; query: string; lines?: 2 | 3 }) {
  const parts = text.split(URL_SPLIT_RE);
  return (
    <p className={`text-[13px] leading-snug text-slate-700 dark:text-slate-200 break-words ${lines === 2 ? "line-clamp-2" : "line-clamp-3"}`}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          // Chips are real external links — clicks belong to them, not the row.
          <span key={i} onClick={(e) => e.stopPropagation()}>
            <LinkChip url={part} />
          </span>
        ) : (
          <Marked key={i} text={part} query={query} />
        ),
      )}
    </p>
  );
}

function AuthorLine({
  author,
  score,
  created_at,
}: {
  author: SearchResult | null;
  score?: number | null;
  created_at: number;
}) {
  const tierRing = useTierRing();
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Avatar className={`h-5 w-5 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}>
        {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
        {author ? getDisplayLabel(author) : "Unknown"}
      </span>
      <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">· {ago(created_at)}</span>
    </div>
  );
}

export function SerpRow({
  event,
  author,
  score,
  query,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  query: string;
}) {
  const [, setLocation] = useLocation();
  const open = useCallback(() => setLocation(eventPath(event)), [event, setLocation]);

  const title = tagVal(event, "title") ?? tagVal(event, "name");
  const news = !title && event.content ? parseNewsShape(event.content) : null;

  const rowProps = {
    role: "link" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
    className:
      "group flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
    "data-testid": `serp-row-${event.id}`,
  };

  if (news) {
    const thumb = news.imageUrl ?? tagVal(event, "image") ?? null;
    return (
      <div {...rowProps}>
        <div className="min-w-0 flex-1">
          {/* Source line — the outlet, Google-News style. The poster's
              identity (and tier ring) still leads; the domain says where
              the story lives. */}
          <div className="flex items-center gap-1.5 min-w-0" data-testid="news-source">
            <AuthorLine author={author} score={score} created_at={event.created_at} />
            <span className="hidden sm:inline-flex items-center gap-1 min-w-0 text-[11px] text-slate-400 dark:text-slate-500">
              ·
              <Favicon host={news.domain} className="h-3 w-3 rounded-sm shrink-0 object-contain" />
              <span className="truncate">{news.domain}</span>
            </span>
          </div>
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 block text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100 hover:text-brand-primary hover:underline transition-colors break-words line-clamp-2"
            data-testid="news-headline"
          >
            <Marked text={news.headline} query={query} />
          </a>
          {news.description && (
            <p className="mt-1 text-[13px] leading-snug text-slate-600 dark:text-slate-300 break-words line-clamp-2">
              <Marked text={news.description} query={query} />
            </p>
          )}
        </div>
        {thumb && (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
            tabIndex={-1}
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="h-20 w-28 rounded-xl object-cover bg-slate-100 dark:bg-slate-800 shadow-sm"
              data-testid="news-thumb"
            />
          </a>
        )}
      </div>
    );
  }

  const body = event.content || tagVal(event, "summary") || tagVal(event, "description") || "";
  const url = mediaUrlOf(event);
  const thumb = url && IMAGE_RE.test(url) ? url : (tagVal(event, "image") ?? null);
  return (
    <div {...rowProps}>
      <div className="min-w-0 flex-1">
        <AuthorLine author={author} score={score} created_at={event.created_at} />
        {title && (
          <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-primary transition-colors [&>p]:font-semibold [&>p]:text-sm">
            <Snippet text={title} query={query} lines={2} />
          </div>
        )}
        {body && (
          <div className="mt-0.5">
            <Snippet text={body.slice(0, 300)} query={query} lines={title ? 2 : 3} />
          </div>
        )}
      </div>
      {thumb && (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-xl object-cover bg-slate-100 dark:bg-slate-800"
        />
      )}
    </div>
  );
}
