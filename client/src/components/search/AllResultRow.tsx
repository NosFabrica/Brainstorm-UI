/**
 * The All tab's row — one shape for every kind, so a list that mixes them
 * stays readable: who and when on the left, what it is as a tinted pill on the
 * right, then a title, a few lines of words, the event it is about (a
 * reaction's note, a zap's post) as one quoted line, a few quiet facts and one
 * small square picture. The search relay's own web UI reads a mixed list this
 * way (NosFabrica/vespa-relay: a byline with the kind badge, tinted by family).
 *
 * Kept to a scannable height: a title is two lines at most, the words three
 * under a title and four without one, the quote and the facts one each.
 *
 * Nothing in it is a button: like a Google result, the row itself is the link,
 * and it opens the kind's own full page. No players, no embeds, no "Read
 * article" — an article's cover is the same small square as everything else's.
 */
import { useState } from "react";
import { Link } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { Braces, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Chip } from "@/components/ui/chip";
import { MediaImg } from "@/components/ui/media-img";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Headline } from "@/components/search/SerpRow";
import { ago } from "@/lib/ago";
import { kindTone } from "@/lib/kindFamily";
import { kindLabel } from "@/lib/kindLabel";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import { who } from "@/lib/resultReaders";
import { summaryOf, type ResultSummary } from "@/lib/resultSummary";

/** The event a row is about, as one line: whose, and what it says. */
function quoteOf(target: NostrEvent): string {
  const s = summaryOf(target);
  const words = s.title ?? s.body ?? kindLabel(target);
  return `${who(target.pubkey)}: ${words.replace(/\s+/g, " ").slice(0, 200)}`;
}

export function AllResultRow({
  event,
  author,
  score,
  query,
  summary = summaryOf(event),
  target = null,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  score?: number | null;
  query: string;
  summary?: ResultSummary;
  /** The event `summary.ref` names, once the list has resolved it. */
  target?: NostrEvent | null;
}) {
  const tierRing = useTierRing();
  const [thumbFailed, setThumbFailed] = useState(false);
  const words = summary.body?.slice(0, 600) ?? null;
  // "to @Bob" says nothing once the quote below opens with Bob's name.
  const facts = target ? summary.facts.filter((f) => f !== `to ${who(target.pubkey)}`) : summary.facts;
  return (
    <Link
      href={summary.href}
      className="group block rounded-xl border border-slate-100 bg-white/70 px-4 py-3 transition-all hover:border-slate-200 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:border-slate-800/60 dark:bg-slate-900/70 dark:hover:border-slate-700"
      data-testid={`all-row-${event.id}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Avatar
          className={`h-5 w-5 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}
        >
          {author?.picture ? <AvatarImage src={author.picture} alt="" className="object-cover" /> : null}
          <AvatarFallback className="overflow-hidden">
            <DefaultAvatarImg />
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
          {author ? getDisplayLabel(author) : "Unknown"}
        </span>
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">· {ago(event.created_at)}</span>
        <span className="flex-1" />
        <Chip
          tone={kindTone(event.kind)}
          size="sm"
          className="shrink-0"
          title={`kind ${event.kind}`}
          data-testid="all-row-kind"
        >
          {kindLabel(event)}
        </Chip>
      </div>
      <div className="mt-1.5 flex items-start gap-3.5">
        <div className="min-w-0 flex-1">
          {summary.title && (
            <p
              className="line-clamp-2 break-words text-base font-semibold leading-snug text-slate-900 transition-colors group-hover:text-brand-primary dark:text-slate-100"
              data-testid="all-row-title"
            >
              <Headline text={summary.title} query={query} />
            </p>
          )}
          {words && summary.code ? (
            <pre
              className="mt-1 line-clamp-4 whitespace-pre-wrap break-words rounded-md bg-slate-50 px-2 py-1 font-mono text-xs leading-[1.5] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
              data-testid="all-row-code"
            >
              {words}
            </pre>
          ) : words ? (
            <p
              className={`${summary.title ? "mt-0.5 line-clamp-3" : "line-clamp-4"} break-words text-sm leading-[1.5] text-slate-600 dark:text-slate-300`}
              data-testid="all-row-body"
            >
              <Headline text={words} query={query} />
            </p>
          ) : (
            summary.shape && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                {summary.shape === "encrypted" ? (
                  <>
                    <Lock className="h-3 w-3" /> Encrypted — only its owner can read it
                  </>
                ) : (
                  <>
                    <Braces className="h-3 w-3" /> Structured data
                  </>
                )}
              </p>
            )
          )}
          {target && (
            <p
              className="mt-1.5 line-clamp-1 break-all border-l-2 border-slate-200 pl-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
              data-testid="all-row-ref"
            >
              <Headline text={quoteOf(target)} query={query} />
            </p>
          )}
          {facts.length > 0 && (
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" data-testid="all-row-facts">
              <Headline text={facts.join(" · ")} query="" />
            </p>
          )}
        </div>
        {summary.image && !thumbFailed && (
          <MediaImg
            src={summary.image}
            preset="media_320"
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="h-16 w-16 shrink-0 rounded-lg bg-slate-100 object-cover dark:bg-slate-800"
            data-testid="all-row-thumb"
          />
        )}
      </div>
    </Link>
  );
}
