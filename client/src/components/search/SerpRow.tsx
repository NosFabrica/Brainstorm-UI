/**
 * The compact Google-density result row: author line, a 2–3 line snippet
 * with the query terms bolded, small thumbnail when the event carries
 * media. Whole row opens the full in-app view — richness lives there.
 */
import { Link } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { highlightTerms } from "@/lib/highlight";
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

export function Snippet({ text, query, lines = 3 }: { text: string; query: string; lines?: 2 | 3 }) {
  return (
    <p className={`text-[13px] leading-snug text-slate-700 dark:text-slate-200 break-words ${lines === 2 ? "line-clamp-2" : "line-clamp-3"}`}>
      {highlightTerms(text, query).map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="bg-transparent font-semibold text-slate-900 dark:text-white">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
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
  const tierRing = useTierRing();
  const title = tagVal(event, "title") ?? tagVal(event, "name");
  const body = event.content || tagVal(event, "summary") || tagVal(event, "description") || "";
  const url = mediaUrlOf(event);
  const thumb = url && IMAGE_RE.test(url) ? url : (tagVal(event, "image") ?? null);
  return (
    <Link
      href={eventPath(event)}
      className="group flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid={`serp-row-${event.id}`}
    >
      <div className="min-w-0 flex-1">
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
          <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">· {ago(event.created_at)}</span>
        </div>
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
        <img src={thumb} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover bg-slate-100 dark:bg-slate-800" />
      )}
    </Link>
  );
}
