import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Link2 } from "lucide-react";
import { KindPill } from "@/components/ui/kind-pill";
import { EmojiText } from "@/components/ui/custom-emoji";
import { usePublicationEntries, usePublicationParent, type PublicationEntry } from "@/hooks/usePublication";
import { coordKey, useHeldReplaceables } from "@/hooks/useHeldEvents";
import { eventPath, neventFor } from "@/lib/shareId";
import { wikiToMarkdown } from "@/lib/wiki";
import {
  coordinateOf,
  entryFallbackTitle,
  publicationMeta,
  publicationSections,
  publicationTitle,
  PUBLICATION_INDEX_KIND,
  PUBLICATION_SECTION_KIND,
  refMatches,
  sectionMarkdown,
  type SectionRef,
} from "@/lib/publication";

/**
 * NKBIP-01 publications on the article layout: a kind-30040 index read as a
 * book — cover, table of contents, then every chapter's text in order — and
 * a kind-30041 section read on its own, with the book it belongs to above it
 * and its neighbours below. Modelled on Amethyst's `Publication` and
 * `PublicationSection` (commonsUI), which only shows the contents; here the
 * page is where the book is read, so the chapters are drawn in place.
 */

type IndexLike = { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string };

/** Renders a markdown body as the article reader does (ArticleScreen's ArticleBody). */
export type RenderBody = (markdown: string, tags: string[][]) => ReactNode;

/** Top-level entries drawn at first; a book of 240 chapters keeps going on request. */
const TEXT_PAGE = 30;
/** How deep the table of contents goes; the text below goes all the way. */
const TOC_DEPTH = 2;
/** How many books up the trail above a section climbs. */
const TRAIL_DEPTH = 4;

/** The kinds an index may list that read as prose in place. */
const PROSE_KINDS = new Set([PUBLICATION_SECTION_KIND, 30023, 30817, 30818]);

const anchorId = (ref: SectionRef) =>
  `sec-${(ref.address?.identifier || ref.eventId || ref.key).replace(/[^A-Za-z0-9_-]+/g, "-")}`;

const identifierOf = (ev: { tags: string[][] }) => ev.tags.find((t) => t[0] === "d")?.[1] ?? "";

/** An entry's name: its event's title, the index's own for it, else its `d` humanized. */
function entryTitle(entry: PublicationEntry, parentIdentifier: string): string {
  const ev = entry.event;
  if (ev) {
    const title = ev.tags.find((t) => t[0] === "title")?.[1]?.trim();
    if (title) return title;
  }
  if (entry.ref.title) return entry.ref.title;
  if (entry.ref.address) return entryFallbackTitle(entry.ref.address.identifier, parentIdentifier);
  return ev ? publicationTitle(ev) : "Untitled section";
}

/** An entry's own page: by its address when it has one, else by id. */
function entryHref(ref: SectionRef, event?: NostrEvent): string {
  if (event) return eventPath(event, ref.address?.relays ?? []);
  if (ref.address) {
    try {
      return `/e/${nip19.naddrEncode(ref.address)}`;
    } catch {
      /* fall through */
    }
  }
  return `/e/${neventFor(ref.eventId ?? "")}`;
}

/** The header of a publication: its cover beside its title, author and what the index says of the work. */
export function PublicationHeader({ ev, sections }: { ev: IndexLike; sections: number }) {
  const meta = useMemo(() => publicationMeta(ev), [ev]);
  const [coverBroken, setCoverBroken] = useState(false);
  const facts = [
    meta.type.charAt(0).toUpperCase() + meta.type.slice(1),
    meta.version,
    sections > 0 ? `${sections} ${sections === 1 ? "section" : "sections"}` : undefined,
    meta.publishedOn
      ? `Published ${meta.publishedOn}${meta.publishedBy && meta.publishedBy !== meta.author ? ` by ${meta.publishedBy}` : ""}`
      : meta.publishedBy && meta.publishedBy !== meta.author
        ? `Published by ${meta.publishedBy}`
        : undefined,
  ].filter(Boolean);
  // The summary's blank lines are its paragraphs; the article layout's one line would run them together.
  const paragraphs = (meta.summary ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <header data-testid="publication-header">
      <div className="flex gap-4 sm:gap-6">
        {/* A 2:3 jacket: a book's cover, which a 16:9 hero would crop to its middle. */}
        <div className="aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-800 sm:w-36">
          {meta.image && !coverBroken ? (
            <img
              src={meta.image}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setCoverBroken(true)}
              data-testid="publication-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
              <BookOpen className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <KindPill event={ev} mixed={false} className="mb-2" />
          <h1
            className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <EmojiText text={meta.title} tags={ev} />
          </h1>
          {meta.author && (
            <p className="mt-1.5 text-base text-slate-600 dark:text-slate-300" data-testid="publication-author">
              by {meta.author}
            </p>
          )}
          {facts.length > 0 && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="publication-facts">
              {facts.join(" · ")}
            </p>
          )}
        </div>
      </div>
      {paragraphs.length > 0 && (
        <div
          className="mt-5 space-y-2 text-base leading-relaxed text-slate-600 dark:text-slate-300"
          data-testid="article-summary"
        >
          {paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
      )}
      {meta.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="publication-topics">
          {meta.topics.map((t) => (
            <Link
              key={t}
              href={`/t/${encodeURIComponent(t)}`}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-brand-link hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              #{t}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

/**
 * A whole publication: its table of contents, then its text. Each part (an
 * index listed by an index) fetches its own entries when it is drawn, so a
 * book loads level by level, one ask per part.
 */
export function PublicationContents({
  index,
  relays = [],
  renderBody,
}: {
  index: IndexLike;
  relays?: string[];
  renderBody: RenderBody;
}) {
  const [shown, setShown] = useState(TEXT_PAGE);
  const ancestors = useMemo(() => new Set([coordinateOf(index)]), [index]);
  // A contents entry past what is drawn is drawn first, then scrolled to.
  const goTo = useCallback((top: number, id: string) => {
    setShown((n) => Math.max(n, top + 1));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })),
    );
  }, []);
  if (!publicationSections(index).length) return null;

  return (
    <div className="mt-6">
      <nav
        className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:p-5"
        aria-label="Contents"
        data-testid="publication-toc"
      >
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Contents
        </p>
        <TocList index={index} relays={relays} depth={0} ancestors={ancestors} goTo={goTo} />
      </nav>
      <div className="mt-8" data-testid="publication-text">
        <PublicationPart
          index={index}
          relays={relays}
          depth={0}
          ancestors={ancestors}
          renderBody={renderBody}
          limit={shown}
          onMore={() => setShown((n) => n + TEXT_PAGE)}
        />
      </div>
    </div>
  );
}

function TocList({
  index,
  relays,
  depth,
  ancestors,
  goTo,
  top,
}: {
  index: IndexLike;
  relays: string[];
  depth: number;
  ancestors: ReadonlySet<string>;
  goTo: (top: number, id: string) => void;
  /** The top-level entry this list sits under: the one that must be drawn for its anchors to exist. */
  top?: number;
}) {
  const { entries } = usePublicationEntries(index, relays);
  const parentD = identifierOf(index);
  return (
    <ol className={depth ? "mt-1 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-800" : "space-y-0.5"}>
      {entries.map((entry, i) => {
        const id = anchorId(entry.ref);
        const child = entry.event;
        const nested =
          child?.kind === PUBLICATION_INDEX_KIND && depth + 1 < TOC_DEPTH && !ancestors.has(coordinateOf(child));
        return (
          <li key={entry.ref.key} data-testid="publication-toc-entry">
            <a
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                goTo(top ?? i, id);
              }}
              className="flex gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-100 hover:text-brand-deep dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-brand-link"
            >
              <span className="w-6 shrink-0 text-right tabular-nums text-slate-400 dark:text-slate-500">{i + 1}</span>
              <span className={`min-w-0 ${depth === 0 ? "font-semibold" : ""}`}>{entryTitle(entry, parentD)}</span>
            </a>
            {nested && (
              <TocList
                index={child}
                relays={relays}
                depth={depth + 1}
                ancestors={new Set([...ancestors, coordinateOf(child)])}
                goTo={goTo}
                top={top ?? i}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const HEADING_CLS = [
  "text-2xl font-extrabold tracking-tight sm:text-3xl",
  "text-xl font-bold sm:text-2xl",
  "text-lg font-bold",
  "text-base font-bold",
];

function EntryHeading({ depth, title, href }: { depth: number; title: string; href: string }) {
  const Tag = (["h2", "h3", "h4", "h5"] as const)[Math.min(depth, 3)];
  return (
    <Tag
      className={`group flex items-baseline gap-2 text-slate-900 dark:text-slate-100 ${HEADING_CLS[Math.min(depth, 3)]}`}
      style={depth === 0 ? { fontFamily: "var(--font-display)" } : undefined}
    >
      <span className="min-w-0">{title}</span>
      <Link
        href={href}
        title="Open this section on its own"
        aria-label={`Open ${title} on its own`}
        className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-brand-link focus:opacity-100 group-hover:opacity-100 dark:text-slate-600"
      >
        <Link2 className="h-4 w-4" />
      </Link>
    </Tag>
  );
}

function PublicationPart({
  index,
  relays,
  depth,
  ancestors,
  renderBody,
  limit,
  onMore,
}: {
  index: IndexLike;
  relays: string[];
  depth: number;
  ancestors: ReadonlySet<string>;
  renderBody: RenderBody;
  limit?: number;
  onMore?: () => void;
}) {
  const { entries, settled } = usePublicationEntries(index, relays);
  const parentD = identifierOf(index);
  const drawn = limit === undefined ? entries : entries.slice(0, limit);
  const rest = entries.length - drawn.length;
  return (
    <div className={depth === 0 ? "space-y-10" : "mt-4 space-y-6"}>
      {drawn.map((entry) => (
        <PublicationEntryView
          key={entry.ref.key}
          entry={entry}
          title={entryTitle(entry, parentD)}
          settled={settled}
          relays={relays}
          depth={depth}
          ancestors={ancestors}
          renderBody={renderBody}
        />
      ))}
      {rest > 0 && onMore && (
        <button
          type="button"
          onClick={onMore}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-brand-deep transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-brand-link"
          data-testid="publication-more"
        >
          Continue reading — {rest} more {rest === 1 ? "section" : "sections"}
        </button>
      )}
    </div>
  );
}

const PublicationEntryView = memo(function PublicationEntryView({
  entry,
  title,
  settled,
  relays,
  depth,
  ancestors,
  renderBody,
}: {
  entry: PublicationEntry;
  title: string;
  settled: boolean;
  relays: string[];
  depth: number;
  ancestors: ReadonlySet<string>;
  renderBody: RenderBody;
}) {
  const { ref, event } = entry;
  const href = entryHref(ref, event);
  const markdown = useMemo(() => {
    if (!event || !PROSE_KINDS.has(event.kind)) return "";
    if (event.kind === PUBLICATION_SECTION_KIND) return sectionMarkdown(event);
    if (event.kind === 30818) return wikiToMarkdown(event.content || "");
    return event.content || "";
  }, [event]);
  const coordinate = event && event.kind === PUBLICATION_INDEX_KIND ? coordinateOf(event) : "";
  const childAncestors = useMemo(
    () => (coordinate ? new Set([...ancestors, coordinate]) : ancestors),
    [ancestors, coordinate],
  );

  let body: ReactNode;
  if (!event) {
    body = settled ? (
      <p className="mt-2 text-sm italic text-slate-400 dark:text-slate-500" data-testid="publication-missing">
        This section isn’t on the relays we asked.
      </p>
    ) : (
      <div className="mt-3 space-y-2" aria-hidden data-testid="publication-loading">
        <div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  } else if (event.kind === PUBLICATION_INDEX_KIND) {
    // An index that lists one of its own ancestors would draw forever.
    body = ancestors.has(coordinate) ? null : (
      <PublicationPart
        index={event}
        relays={relays}
        depth={depth + 1}
        ancestors={childAncestors}
        renderBody={renderBody}
      />
    );
  } else if (markdown.trim()) {
    body = (
      <div className="article-prose prose prose-slate mt-3 max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-brand-link prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-img:rounded-xl">
        {renderBody(markdown, event.tags)}
      </div>
    );
  } else if (!PROSE_KINDS.has(event.kind)) {
    body = (
      <Link href={href} className="mt-2 inline-block text-sm font-semibold text-brand-link hover:underline">
        Open →
      </Link>
    );
  }

  return (
    <section id={anchorId(ref)} className="scroll-mt-20" data-testid="publication-section">
      <EntryHeading depth={depth} title={title} href={href} />
      {body}
    </section>
  );
});

/**
 * The books a section or part belongs to, outermost first: a section opened
 * from a search or a link has nothing else to say what it is a chapter of.
 */
export function PublicationTrail({ ev, relays = [] }: { ev: IndexLike; relays?: string[] }) {
  const parent = usePublicationParent(ev, relays);
  if (!parent) return null;
  return (
    <nav
      aria-label="Part of"
      className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400"
      data-testid="publication-trail"
    >
      <BookOpen className="mr-0.5 h-3.5 w-3.5 shrink-0" />
      <Ancestors ev={parent} relays={relays} seen={new Set([coordinateOf(ev)])} depth={1} />
    </nav>
  );
}

function Ancestors({
  ev,
  relays,
  seen,
  depth,
}: {
  ev: NostrEvent;
  relays: string[];
  seen: ReadonlySet<string>;
  depth: number;
}) {
  const coordinate = coordinateOf(ev);
  const looped = seen.has(coordinate);
  const parent = usePublicationParent(looped || depth >= TRAIL_DEPTH ? null : ev, relays);
  if (looped) return null;
  return (
    <>
      {parent && !seen.has(coordinateOf(parent)) && (
        <Ancestors ev={parent} relays={relays} seen={new Set([...seen, coordinate])} depth={depth + 1} />
      )}
      <Link href={eventPath(ev)} className="max-w-[16rem] truncate font-medium hover:text-brand-link hover:underline">
        {publicationTitle(ev)}
      </Link>
      <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 last:hidden dark:text-slate-600" />
    </>
  );
}

/**
 * Previous and next in the book's own order — the order its index lists. A
 * section no index lists has no neighbours; the ends are left empty rather
 * than offering a control that goes nowhere.
 */
export function PublicationPager({ ev, relays = [] }: { ev: IndexLike; relays?: string[] }) {
  const parent = usePublicationParent(ev, relays);
  const refs = useMemo(() => (parent ? publicationSections(parent) : []), [parent]);
  const at = refs.findIndex((r) => refMatches(r, ev));
  const neighbours = useMemo(
    () => (at < 0 ? [] : [refs[at - 1], refs[at + 1]]).filter((r): r is SectionRef => !!r?.address),
    [refs, at],
  );
  const held = useHeldReplaceables(useMemo(() => neighbours.map((r) => r.address!), [neighbours]));
  if (!parent || at < 0) return null;
  const parentD = identifierOf(parent);
  const side = (ref: SectionRef | undefined, back: boolean) => {
    if (!ref) return <span className="flex-1" />;
    const event = ref.address ? held.get(coordKey(ref.address)) : undefined;
    const title = entryTitle({ ref, event }, parentD);
    return (
      <Link
        href={entryHref(ref, event)}
        className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 ${back ? "items-start" : "items-end text-right"}`}
        data-testid={back ? "publication-previous" : "publication-next"}
      >
        <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {back && <ArrowLeft className="h-3 w-3" />}
          {back ? "Previous" : "Next"}
          {!back && <ArrowRight className="h-3 w-3" />}
        </span>
        <span className="max-w-full truncate text-sm font-semibold text-brand-deep dark:text-brand-link">{title}</span>
      </Link>
    );
  };
  if (!refs[at - 1] && !refs[at + 1]) return null;
  return (
    <nav aria-label="Sections" className="mt-8 flex gap-3" data-testid="publication-pager">
      {side(refs[at - 1], true)}
      {side(refs[at + 1], false)}
    </nav>
  );
}
