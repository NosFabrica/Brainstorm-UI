/**
 * A NIP-84 highlight drawn as what it is: a passage someone marked in a text,
 * in a highlighter's colour, with where it is from. The rows (the Top page's,
 * the All tab's) show the passage and its source in a line; the event's own
 * page shows it in its paragraph, with the source as a card.
 *
 * The marker colour is amber because it says one thing here — "this is the
 * part they marked" — the way a highlighter pen does on paper.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { BookOpen, ExternalLink } from "lucide-react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useLiveProfile } from "@/hooks/useLiveProfile";
import { eventStore } from "@/lib/eventStore";
import { fetchAddressableEvents, fetchEventsByIds } from "@/services/nostr";
import { HEX64, clip, type ResultRef } from "@/lib/resultReaders";
import { parseHighlight, tailOf, type HighlightSource } from "@/lib/nip84";
import { READER_KINDS, eventPath } from "@/lib/shareId";
import { Favicon, LinkPreviewCard } from "@/components/share/LinkPreview";
import { MentionChip } from "@/components/share/MentionChip";
import { EmbeddedArticleCard } from "@/components/share/EmbeddedArticleCard";
import { EmbeddedNoteCard } from "@/components/share/EmbeddedNoteCard";
import { NoteContent } from "@/components/share/NoteContent";

/** The marked words, in the highlighter's colour — wrapped lines keep their ends. */
export function HighlightMark({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <mark
      className={`rounded-[3px] bg-amber-200/70 px-0.5 text-slate-900 [-webkit-box-decoration-break:clone] [box-decoration-break:clone] dark:bg-amber-400/25 dark:text-slate-100 ${className}`}
    >
      {children}
    </mark>
  );
}

/** A row's passage: quoted, marked, a few lines at most. */
export function HighlightQuote({
  children,
  lines = 3,
  testId,
}: {
  children: ReactNode;
  lines?: 2 | 3 | 4;
  testId?: string;
}) {
  const clamp = lines === 2 ? "line-clamp-2" : lines === 4 ? "line-clamp-4" : "line-clamp-3";
  return (
    <blockquote
      className={`border-l-[3px] border-amber-400/80 pl-3 text-sm leading-[1.58] text-slate-700 dark:border-amber-400/50 dark:text-slate-200 ${clamp} break-words`}
      data-testid={testId}
    >
      <HighlightMark>{children}</HighlightMark>
    </blockquote>
  );
}

const coordOf = (addr: string) => {
  const [kind, pubkey, ...rest] = addr.split(":");
  const k = Number(kind);
  return Number.isInteger(k) && HEX64.test(pubkey ?? "")
    ? { kind: k, pubkey: pubkey.toLowerCase(), identifier: rest.join(":") }
    : null;
};

/** The Nostr event a highlight is from — store-first, one relay ask for what it lacks. */
export function useHighlightSourceEvent(ref: ResultRef | null): NostrEvent | null {
  const coord = ref?.addr ? coordOf(ref.addr) : null;
  const id = !coord && ref?.id && HEX64.test(ref.id) ? ref.id.toLowerCase() : null;
  const relays = ref?.relay && /^wss?:\/\//i.test(ref.relay) ? [ref.relay] : undefined;
  const filters = useMemo(
    () =>
      coord
        ? [{ kinds: [coord.kind], authors: [coord.pubkey], "#d": [coord.identifier] }]
        : id
          ? [{ ids: [id] }]
          : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the ref's own text
    [ref?.addr, id],
  );
  const held = coord
    ? !!eventStore.getReplaceable(coord.kind, coord.pubkey, coord.identifier)
    : !!(id && eventStore.getEvent(id));
  const key = held ? null : coord ? `highlight-source:${ref!.addr}` : id ? `highlight-source:${id}` : null;
  const found = useStoreEvents(key, filters, () =>
    coord ? fetchAddressableEvents([{ ...coord, relays }], relays) : fetchEventsByIds([id!], relays),
  );
  const events = found.events as NostrEvent[];
  // An address can answer with several versions: the newest is the article.
  return events.length ? events.reduce((a, b) => (b.created_at > a.created_at ? b : a)) : null;
}

const titleOf = (ev: NostrEvent) =>
  ev.tags.find((t) => t[0] === "title" && t[1]?.trim())?.[1].trim() ??
  (clip(ev.content.replace(/\s+/g, " ").trim(), 80) || null);

/**
 * Where a row's passage is from, in one quiet line: the article's title and
 * whose it is, the page's name and site, or the book and its author. Its
 * links are its own — a click on them is not a click on the row.
 */
export function HighlightSourceLine({
  source,
  sourceEvent,
  pageTitle,
  testId,
}: {
  source: HighlightSource;
  sourceEvent: NostrEvent | null;
  /** The page's own title, once the caller has unfurled it. */
  pageTitle?: string | null;
  testId?: string;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  let body: ReactNode = null;
  if (sourceEvent) {
    const title = titleOf(sourceEvent);
    body = (
      <>
        <Link
          href={eventPath(sourceEvent)}
          onClick={stop}
          className="min-w-0 truncate font-medium text-slate-600 hover:text-brand-link hover:underline dark:text-slate-300"
        >
          {title ?? "a note"}
        </Link>{" "}
        <span className="shrink-0">by</span>{" "}
        <span className="min-w-0 shrink truncate" onClick={stop}>
          <MentionChip uri={`nostr:${nip19.npubEncode(sourceEvent.pubkey)}`} />
        </span>
      </>
    );
  } else if (source.url && source.host) {
    body = (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="inline-flex min-w-0 items-center gap-1 hover:text-brand-link hover:underline"
      >
        <Favicon host={source.host} className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain" />
        {pageTitle ? (
          <>
            <span className="min-w-0 truncate font-medium text-slate-600 dark:text-slate-300">{pageTitle}</span>{" "}
            <span className="shrink-0">· {source.host}</span>
          </>
        ) : (
          <span className="min-w-0 truncate">{source.host}</span>
        )}
      </a>
    );
  } else if (source.title) {
    body = (
      <>
        <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate font-medium text-slate-600 dark:text-slate-300">{source.title}</span>{" "}
        {source.author && <span className="min-w-0 truncate">· {source.author}</span>}
      </>
    );
  }
  if (!body) return null;
  return (
    <p
      className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
      data-testid={testId}
    >
      <span className="shrink-0">From</span> {body}
    </p>
  );
}

/** How much of the paragraph shows on each side of the passage before "Show more context". */
const AROUND = 280;

/** The source as the page shows it: the article's card, the note's, the web page's, or the book. */
function SourceCard({ source, sourceEvent }: { source: HighlightSource; sourceEvent: NostrEvent | null }) {
  const author = useLiveProfile(sourceEvent?.pubkey).profile;
  if (sourceEvent) {
    return READER_KINDS.has(sourceEvent.kind) ? (
      <EmbeddedArticleCard event={sourceEvent} author={author} />
    ) : (
      <EmbeddedNoteCard event={sourceEvent} author={author} href={eventPath(sourceEvent)} />
    );
  }
  // The card shows only when the page has something to say; the link is always there.
  if (source.url)
    return (
      <>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-brand-link hover:underline"
          data-testid="highlight-source-link"
        >
          {source.host && <Favicon host={source.host} className="h-4 w-4 shrink-0 rounded-sm object-contain" />}
          <span className="min-w-0 truncate">{source.host ?? source.url}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </a>
        <LinkPreviewCard url={source.url} />
      </>
    );
  if (source.title)
    return (
      <div
        className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-800"
        data-testid="highlight-work"
      >
        <BookOpen className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{source.title}</p>
          {source.author && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{source.author}</p>}
        </div>
      </div>
    );
  return null;
}

/**
 * A highlight's own page: what the highlighter said, then the passage marked
 * in its paragraph — a window of it, the whole paragraph a tap away — then
 * who wrote it and the text it is from.
 */
export function HighlightHero({ event }: { event: { kind: number; tags: string[][]; content: string } }) {
  const highlight = useMemo(() => parseHighlight(event), [event]);
  const sourceEvent = useHighlightSourceEvent(highlight?.source.ref ?? null);
  const [whole, setWhole] = useState(false);
  if (!highlight) return null;
  const { passage, comment, context, authors } = highlight;
  const before = context ? (whole ? context.before : tailOf(context.before, AROUND)) : "";
  const after = context ? (whole ? context.after : clip(context.after, AROUND)) : "";
  const trimmed = !!context && (before !== context.before || after !== context.after);
  // The article's card already says whose it is.
  const writers = authors.filter((pk) => pk !== sourceEvent?.pubkey);
  const { source } = highlight;
  const hasSource = !!(sourceEvent || source.url || source.title);
  return (
    <div data-testid="highlight-hero">
      {comment && (
        <div className="mb-4" data-testid="highlight-comment">
          <NoteContent content={comment} tags={event.tags} reading />
        </div>
      )}
      <figure>
        <blockquote
          className={`whitespace-pre-line break-words border-l-[3px] border-amber-400/80 pl-4 dark:border-amber-400/50 ${
            context
              ? "text-[15px] leading-[1.75] text-slate-500 dark:text-slate-400"
              : "text-lg leading-[1.7] text-slate-800 dark:text-slate-100"
          }`}
          data-testid="highlight-passage"
        >
          {before && <>{before} </>}
          <HighlightMark className={context ? "font-medium" : ""}>{passage}</HighlightMark>
          {after && <> {after}</>}
        </blockquote>
        {(trimmed || whole) && (
          <button
            type="button"
            onClick={() => setWhole((w) => !w)}
            className="ml-4 mt-2 rounded text-[13px] font-medium text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid="highlight-context-toggle"
          >
            {whole ? "Show less" : "Show more context"}
          </button>
        )}
        {writers.length > 0 && (
          <figcaption
            className="ml-4 mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
            data-testid="highlight-authors"
          >
            <span>Written by</span>
            {writers.map((pk) => (
              <MentionChip key={pk} uri={`nostr:${nip19.npubEncode(pk)}`} />
            ))}
          </figcaption>
        )}
      </figure>
      {hasSource && (
        <div className="mt-5" data-testid="highlight-source">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Highlighted from
          </p>
          <SourceCard source={source} sourceEvent={sourceEvent} />
        </div>
      )}
    </div>
  );
}
