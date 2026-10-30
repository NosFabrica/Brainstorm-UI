import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { nip19, type NostrEvent } from "nostr-tools";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronRight, Link2 } from "lucide-react";
import { KindPill } from "@/components/ui/kind-pill";
import { EmojiText } from "@/components/ui/custom-emoji";
import {
  usePrefetchedRefs,
  usePublicationEntries,
  usePublicationParent,
  type PublicationEntry,
} from "@/hooks/usePublication";
import { useNearViewport } from "@/hooks/useNearViewport";
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
 *
 * A book can run to hundreds of chapters, so a chapter's text is drawn — and
 * a part's chapters asked for — only as it nears the screen: every heading is
 * in place from the start, the markdown behind it waits.
 */

type IndexLike = { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string };

/** Renders a markdown body as the article reader does (ArticleScreen's ArticleBody). */
export type RenderBody = (markdown: string, tags: string[][]) => ReactNode;

/** How deep the table of contents goes; the text below goes all the way. */
const TOC_DEPTH = 2;
/** A book with more top-level entries than this lists its parts' contents on request: each one listed is an ask. */
const TOC_OPEN_UP_TO = 12;
/** How many books up the trail above a section climbs. */
const TRAIL_DEPTH = 4;
/** How far ahead of the screen a chapter is drawn: a few screens, so reading never waits on it. */
const DRAW_AHEAD = "1500px 0px";
/** How long a contents link keeps after its section, in frames: until it is drawn and the page around it settles. */
const SCROLL_FRAMES = 120;

/** One empty list, so a memoized row sees the same relays every render. */
const NO_RELAYS: string[] = [];

/** The kinds an index may list that read as prose in place. */
const PROSE_KINDS = new Set([PUBLICATION_SECTION_KIND, 30023, 30817, 30818]);

/** A section's anchor: from its whole coordinate, so `第一章` and `第二章`, or two authors' `intro`, never share one. */
function anchorId(ref: SectionRef): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ref.key.length; i++) h = Math.imul(h ^ ref.key.charCodeAt(i), 0x01000193);
  return `sec-${(h >>> 0).toString(36)}`;
}

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
  return `/e/${neventFor(ref.eventId ?? "", ref.relay ? [ref.relay] : [])}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The header of a publication: its cover beside its title, author and what the index says of the work. */
export function PublicationHeader({ ev }: { ev: IndexLike }) {
  const meta = useMemo(() => publicationMeta(ev), [ev]);
  // An entry's coordinate says its kind: an index listed by an index is a part.
  const { parts, sections } = useMemo(() => {
    const refs = publicationSections(ev);
    const parts = refs.filter((r) => r.address?.kind === PUBLICATION_INDEX_KIND).length;
    return { parts, sections: refs.length - parts };
  }, [ev]);
  const [coverBroken, setCoverBroken] = useState(false);
  const facts = [
    meta.type.charAt(0).toUpperCase() + meta.type.slice(1),
    meta.version,
    parts > 0 ? plural(parts, "part") : undefined,
    sections > 0 ? plural(sections, "section") : undefined,
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
 * Scrolls to a section that may not be drawn yet: to the deepest of its
 * enclosing parts that is, which brings its text near enough to draw, then to
 * the section itself once it exists. Sections drawing around it change the
 * page's height as it goes, so it keeps the target aligned until it holds
 * still, rather than leaving the reader wherever the first jump landed.
 */
function scrollToPath(path: string[]): void {
  let frames = 0;
  let still = 0;
  let lastTop: number | null = null;
  const step = () => {
    const target = document.getElementById(path[path.length - 1]);
    if (target) {
      const top = target.getBoundingClientRect().top;
      if (lastTop !== null && Math.abs(top - lastTop) < 1) still++;
      else {
        still = 0;
        target.scrollIntoView({ block: "start" });
      }
      lastTop = target.getBoundingClientRect().top;
    } else {
      [...path]
        .reverse()
        .map((id) => document.getElementById(id))
        .find(Boolean)
        ?.scrollIntoView({ block: "start" });
    }
    if (still < 10 && frames++ < SCROLL_FRAMES) requestAnimationFrame(step);
  };
  step();
}

/**
 * A whole publication: its table of contents, then its text. Each part (an
 * index listed by an index) asks for its own entries when it is drawn, in the
 * page's batch with any other part drawn at the same moment.
 */
export function PublicationContents({
  index,
  relays = NO_RELAYS,
  renderBody,
}: {
  index: IndexLike;
  relays?: string[];
  renderBody: RenderBody;
}) {
  const ancestors = useMemo(() => new Set([coordinateOf(index)]), [index]);
  const { entries, settled } = usePublicationEntries(index, relays);
  if (!entries.length) return null;
  const openParts = entries.length <= TOC_OPEN_UP_TO;

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
        <TocList
          parent={index}
          entries={entries}
          relays={relays}
          depth={0}
          ancestors={ancestors}
          path={[]}
          openParts={openParts}
        />
      </nav>
      <div className="mt-8" data-testid="publication-text">
        <PartText
          parent={index}
          entries={entries}
          settled={settled}
          relays={relays}
          depth={0}
          ancestors={ancestors}
          renderBody={renderBody}
        />
      </div>
    </div>
  );
}

/** A part's contents in the table, fetched when the part is listed. */
function NestedToc({
  index,
  ...rest
}: Omit<Parameters<typeof TocList>[0], "parent" | "entries"> & { index: NostrEvent }) {
  const { entries } = usePublicationEntries(index, rest.relays);
  return <TocList parent={index} entries={entries} {...rest} />;
}

function TocList({
  parent,
  entries,
  relays,
  depth,
  ancestors,
  path,
  openParts,
}: {
  parent: { tags: string[][] };
  entries: PublicationEntry[];
  relays: string[];
  depth: number;
  ancestors: ReadonlySet<string>;
  /** The anchors of the parts this list sits in, outermost first. */
  path: string[];
  openParts: boolean;
}) {
  const parentD = identifierOf(parent);
  return (
    <ol className={depth ? "mt-1 space-y-0.5 border-l border-slate-200 pl-3 dark:border-slate-800" : "space-y-0.5"}>
      {entries.map((entry, i) => (
        <TocEntry
          key={entry.ref.key}
          entry={entry}
          number={i + 1}
          title={entryTitle(entry, parentD)}
          relays={relays}
          depth={depth}
          ancestors={ancestors}
          path={path}
          openParts={openParts}
        />
      ))}
    </ol>
  );
}

function TocEntry({
  entry,
  number,
  title,
  relays,
  depth,
  ancestors,
  path,
  openParts,
}: {
  entry: PublicationEntry;
  number: number;
  title: string;
  relays: string[];
  depth: number;
  ancestors: ReadonlySet<string>;
  path: string[];
  openParts: boolean;
}) {
  const id = anchorId(entry.ref);
  const child = entry.event;
  const coordinate = child ? coordinateOf(child) : "";
  const nestable = child?.kind === PUBLICATION_INDEX_KIND && depth + 1 < TOC_DEPTH && !ancestors.has(coordinate);
  const [open, setOpen] = useState(openParts);
  const here = useMemo(() => [...path, id], [path, id]);
  const childAncestors = useMemo(() => new Set([...ancestors, coordinate]), [ancestors, coordinate]);
  return (
    <li data-testid="publication-toc-entry">
      <div className="flex items-start">
        <a
          href={`#${id}`}
          onClick={(e) => {
            e.preventDefault();
            scrollToPath(here);
          }}
          className="flex min-w-0 flex-1 gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-100 hover:text-brand-deep dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-brand-link"
        >
          <span className="w-6 shrink-0 text-right tabular-nums text-slate-400 dark:text-slate-500">{number}</span>
          <span className={`min-w-0 ${depth === 0 ? "font-semibold" : ""}`}>{title}</span>
        </a>
        {nestable && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Hide the contents of ${title}` : `Show the contents of ${title}`}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            data-testid="publication-toc-toggle"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>
      {nestable && open && (
        <NestedToc
          index={child}
          relays={relays}
          depth={depth + 1}
          ancestors={childAncestors}
          path={here}
          openParts={openParts}
        />
      )}
    </li>
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
      {/* Shown on touch screens, where there is no hover to reveal it. */}
      <Link
        href={href}
        title="Open this section on its own"
        aria-label={`Open ${title} on its own`}
        className="shrink-0 text-slate-300 transition-opacity hover:text-brand-link dark:text-slate-600 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
      >
        <Link2 className="h-4 w-4" />
      </Link>
    </Tag>
  );
}

/** A part's chapters, asked for once the part is drawn. */
function PartOf({
  index,
  ...rest
}: Omit<Parameters<typeof PartText>[0], "parent" | "entries" | "settled"> & { index: NostrEvent }) {
  const { entries, settled } = usePublicationEntries(index, rest.relays);
  return <PartText parent={index} entries={entries} settled={settled} {...rest} />;
}

function PartText({
  parent,
  entries,
  settled,
  relays,
  depth,
  ancestors,
  renderBody,
}: {
  parent: { tags: string[][] };
  entries: PublicationEntry[];
  settled: boolean;
  relays: string[];
  depth: number;
  ancestors: ReadonlySet<string>;
  renderBody: RenderBody;
}) {
  const parentD = identifierOf(parent);
  return (
    <div className={depth === 0 ? "space-y-10" : "mt-4 space-y-6"}>
      {entries.map((entry) => (
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
    </div>
  );
}

/**
 * What a section takes up before its text is drawn: about as tall as its text
 * will be, so drawing it does not move the page; a part, whose length is not
 * known yet, takes most of a screen.
 */
function NotYet({ chars }: { chars?: number }) {
  // About 80 characters to a 28px line of reading text, and a paragraph gap every few lines.
  const style = chars ? { minHeight: `${Math.ceil(chars / 80) * 32}px` } : undefined;
  return (
    <div className={chars ? "mt-3" : "min-h-[60vh]"} style={style} aria-hidden data-testid="publication-pending" />
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
  const sectionRef = useRef<HTMLElement>(null);
  const near = useNearViewport(sectionRef, DRAW_AHEAD);
  const href = useMemo(() => entryHref(ref, event), [ref, event]);
  const markdown = useMemo(() => {
    if (!near || !event || !PROSE_KINDS.has(event.kind)) return "";
    if (event.kind === PUBLICATION_SECTION_KIND) return sectionMarkdown(event);
    if (event.kind === 30818) return wikiToMarkdown(event.content || "");
    return event.content || "";
  }, [event, near]);
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
    body = ancestors.has(coordinate) ? null : near ? (
      <PartOf index={event} relays={relays} depth={depth + 1} ancestors={childAncestors} renderBody={renderBody} />
    ) : (
      <NotYet />
    );
  } else if (!near && PROSE_KINDS.has(event.kind) && event.content.trim()) {
    body = <NotYet chars={event.content.length} />;
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
    <section ref={sectionRef} id={anchorId(ref)} className="scroll-mt-20" data-testid="publication-section">
      <EntryHeading depth={depth} title={title} href={href} />
      {body}
    </section>
  );
});

/**
 * The books a section or part belongs to, outermost first: a section opened
 * from a search or a link has nothing else to say what it is a chapter of.
 */
export function PublicationTrail({ ev, relays = NO_RELAYS }: { ev: IndexLike; relays?: string[] }) {
  const parent = usePublicationParent(ev, relays);
  const seen = useMemo(() => new Set([coordinateOf(ev)]), [ev]);
  if (!parent) return null;
  return (
    <nav
      aria-label="Part of"
      className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400"
      data-testid="publication-trail"
    >
      <BookOpen className="mr-0.5 h-3.5 w-3.5 shrink-0" />
      <Ancestors ev={parent} relays={relays} seen={seen} depth={1} />
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
  const above = useMemo(() => new Set([...seen, coordinate]), [seen, coordinate]);
  if (looped) return null;
  return (
    <>
      {parent && !above.has(coordinateOf(parent)) && (
        <Ancestors ev={parent} relays={relays} seen={above} depth={depth + 1} />
      )}
      <Link href={eventPath(ev)} className="max-w-[16rem] truncate font-medium hover:text-brand-link hover:underline">
        {publicationTitle(ev)}
      </Link>
      <ChevronRight className="h-3 w-3 shrink-0 text-slate-300 last:hidden dark:text-slate-600" />
    </>
  );
}

const NO_NEIGHBOURS: SectionRef[] = [];

/**
 * Previous and next in the book's own order — the order its index lists. A
 * section no index lists has no neighbours; the ends are left empty rather
 * than offering a control that goes nowhere. Both neighbours are asked for
 * here, so their titles show and the next page opens from the store.
 */
export function PublicationPager({ ev, relays = NO_RELAYS }: { ev: IndexLike; relays?: string[] }) {
  const parent = usePublicationParent(ev, relays);
  const refs = useMemo(() => (parent ? publicationSections(parent) : NO_NEIGHBOURS), [parent]);
  const at = refs.findIndex((r) => refMatches(r, ev));
  const previous = at > 0 ? refs[at - 1] : undefined;
  const next = at >= 0 ? refs[at + 1] : undefined;
  const neighbours = useMemo(() => [previous, next].filter((r): r is SectionRef => !!r), [previous, next]);
  const found = usePrefetchedRefs(neighbours, relays);
  if (!parent || at < 0 || !neighbours.length) return null;
  const parentD = identifierOf(parent);
  const side = (ref: SectionRef | undefined, back: boolean) => {
    if (!ref) return <span className="flex-1" />;
    const event = found.get(ref.key);
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
  return (
    <nav aria-label="Sections" className="mt-8 flex gap-3" data-testid="publication-pager">
      {side(previous, true)}
      {side(next, false)}
    </nav>
  );
}
