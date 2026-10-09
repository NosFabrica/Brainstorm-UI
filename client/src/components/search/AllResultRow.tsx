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
import { memo } from "react";
import { nip19 } from "nostr-tools";
import { Link } from "wouter";
import type { NostrEvent } from "nostr-tools";
import { Braces, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { MediaImg } from "@/components/ui/media-img";
import { useTierRing } from "@/components/score/VerificationCoin";
import { useConnectionSpeed } from "@/lib/connection";
import { VideoFirstFrame } from "@/components/share/VideoFirstFrame";
import { Headline } from "@/components/search/SerpRow";
import { ago } from "@/lib/ago";
import { kindTone } from "@/lib/kindFamily";
import { kindLabel } from "@/lib/kindLabel";
import type { SearchResult } from "@/lib/profileSearch";
import { clip, who } from "@/lib/resultReaders";
import { summaryOf, type ResultSummary } from "@/lib/resultSummary";
import { ProfileEmojiText } from "@/components/ui/custom-emoji";
import { HighlightQuote } from "@/components/share/HighlightQuote";

const THUMB = "h-16 w-16 shrink-0 rounded-lg bg-slate-100 object-cover dark:bg-slate-800";

/** The words that name an event: its title, or what it says with its links left out. */
function wordsOf(target: NostrEvent): string | undefined {
  const s = summaryOf(target);
  return [s.title, s.quote, s.body]
    .map((w) =>
      (w ?? "")
        .replace(/https?:\/\/\S+|nostr:n(?:event|ote|addr)1\S+/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find(Boolean);
}

/** The event a row is about, as one line: whose, and what it says — or what it is, when its words are only a link. */
function quoteOf(target: NostrEvent): string {
  return `${who(target.pubkey)}: ${clip(wordsOf(target) || kindLabel(target), 200)}`;
}

/** The text a highlight is from: "From The Article · @alice". */
function sourceLineOf(target: NostrEvent): string {
  return `From ${clip(wordsOf(target) || kindLabel(target), 120)} · ${who(target.pubkey)}`;
}

/** A key as people see one when there is no name: "npub1abc…xyz". */
function shortKey(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
  } catch {
    return "Unknown";
  }
}

export const AllResultRow = memo(function AllResultRow({
  event,
  author,
  pubkey = event.pubkey,
  name,
  picture,
  score,
  query,
  summary = summaryOf(event),
  target = null,
}: {
  event: NostrEvent;
  author: SearchResult | null;
  /** Whose row it is — the signer, or a zap receipt's payer. */
  pubkey?: string;
  /** The author's name and face from their profile, when the search could not name them. */
  name?: string;
  picture?: string;
  score?: number | null;
  query: string;
  summary?: ResultSummary;
  /** The event `summary.ref` names, once the list has resolved it. */
  target?: NostrEvent | null;
}) {
  const tierRing = useTierRing();
  const speed = useConnectionSpeed();
  const words = summary.body ? clip(summary.body, 600) : null;
  const authorName = author?.displayName || author?.name || name || shortKey(pubkey);
  const face = author?.picture || picture;
  // "to @Bob" says nothing once the quote below opens with Bob's name.
  // A highlight's "From site" says less than the article line its resolved source gets.
  const facts = target
    ? summary.facts.filter((f) => f !== `to ${who(target.pubkey)}` && !(summary.quote && f.startsWith("From ")))
    : summary.facts;
  // On a slow connection the frame would stay an empty square: no picture says more.
  const firstFrame =
    summary.video && speed === "normal" ? (
      <VideoFirstFrame src={summary.video} className={THUMB} testId="all-row-video-thumb" />
    ) : null;
  return (
    <Link
      href={summary.href}
      className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid={`all-row-${event.id}`}
    >
      <Card interactive className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Avatar
            className={`h-5 w-5 border border-slate-200/80 dark:border-slate-800/80 ${tierRing(score ?? null) ?? ""}`}
          >
            {face ? <AvatarImage src={face} alt="" className="object-cover" /> : null}
            <AvatarFallback className="overflow-hidden">
              <DefaultAvatarImg />
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300">
            <ProfileEmojiText pubkey={pubkey} text={authorName} />
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
                <Headline text={summary.title} query={query} tags={event.tags} />
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
                <Headline text={words} query={query} tags={event.tags} />
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
            {summary.quote && (
              <div className={summary.title || words ? "mt-1.5" : ""}>
                <HighlightQuote lines={words ? 2 : 3} testId="all-row-quote">
                  <Headline text={summary.quote} query={query} tags={event.tags} />
                </HighlightQuote>
              </div>
            )}
            {target && summary.quote ? (
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" data-testid="all-row-source">
                <Headline text={sourceLineOf(target)} query="" tags={target.tags} />
              </p>
            ) : target ? (
              <p
                className="mt-1.5 line-clamp-1 break-all border-l-2 border-slate-200 pl-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
                data-testid="all-row-ref"
              >
                <Headline text={quoteOf(target)} query={query} tags={target.tags} />
              </p>
            ) : null}
            {facts.length > 0 && (
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" data-testid="all-row-facts">
                <Headline text={facts.join(" · ")} query="" />
              </p>
            )}
          </div>
          {summary.image ? (
            <MediaImg
              src={summary.image}
              preset="media_320"
              alt=""
              loading="lazy"
              // A dead poster (flare's expired thumbnails) gives way to the clip's own first frame.
              fallback={firstFrame}
              className={THUMB}
              data-testid="all-row-thumb"
            />
          ) : (
            firstFrame
          )}
        </div>
      </Card>
    </Link>
  );
});
