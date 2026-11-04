/**
 * NKBIP-01 curated publications (GitCitadel's "Alexandria" books): a kind-30040
 * index holds a work's metadata and its table of contents, and each entry
 * names a kind-30041 section (the prose, usually AsciiDoc) or another index
 * (a part holding chapters). Not a merged NIP. Read the way Amethyst reads
 * them (quartz `PublicationIndexEvent`, `PublicationSectionRef`,
 * `PublicationContentEvent`), which was built against what publishers emit
 * rather than only what the spec documents.
 */
import { nip19 } from "nostr-tools";
import { asciiDocToMarkdown } from "@/lib/asciidoc";
import { eventPath, neventFor } from "@/lib/shareId";

export const PUBLICATION_INDEX_KIND = 30040;
export const PUBLICATION_SECTION_KIND = 30041;
/**
 * A bookshelf (Alexandria, Bookshelf): an addressable list whose `a` tags
 * name publications and other shelves, in the same grammar as an index's
 * contents. Alexandria keeps one called `root` that lists a reader's shelves.
 */
export const BOOKSHELF_KIND = 30045;
/** The kinds of the publishing family, as one: a book, its sections, a shelf of books. */
export const PUBLICATION_KINDS: ReadonlySet<number> = new Set([
  PUBLICATION_INDEX_KIND,
  PUBLICATION_SECTION_KIND,
  BOOKSHELF_KIND,
]);

type EventLike = { kind: number; pubkey: string; tags: string[][] };

/** One empty relay list, so a memoized row sees the same one every render. */
export const NO_RELAYS: string[] = [];

/** The deepest nesting a contents entry may claim. */
const MAX_LEVEL = 6;

const tagValue = (ev: { tags: string[][] }, name: string): string | undefined => {
  const v = ev.tags.find((t) => t[0] === name)?.[1]?.trim();
  return v ? v : undefined;
};

const HEX64 = /^[0-9a-f]{64}$/i;

/** A Roman numeral as slugs spell it (`iv`, `xviii`) — "mix" is one too, and a word. */
const ROMAN = /^(?=[mdclxvi])m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i;
const NOT_ROMAN = new Set(["mix", "mid", "dim", "lid", "mild", "civil", "vivid", "di", "mi"]);

/**
 * `wuthering-heights` → `Wuthering Heights`, `article-iv` → `Article IV`.
 * Anything that is not a slug stays as it is.
 */
export function humanizeIdentifier(d: string): string {
  const words = d.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return d;
  return words
    .map((w) =>
      ROMAN.test(w) && !NOT_ROMAN.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** An event's `d`, or "". */
export const identifierOf = (ev: { tags: string[][] }): string => ev.tags.find((t) => t[0] === "d")?.[1] ?? "";

/**
 * A section's `d` names it under its book: `<book>-<part>-article-four-section-3`.
 * Shown before the section itself arrives, the parent's prefix is noise; what is
 * left ("Section 3") is the part that names this entry.
 */
export function entryFallbackTitle(identifier: string, parentIdentifier?: string): string {
  let d = identifier;
  if (parentIdentifier && d.length > parentIdentifier.length + 1 && d.startsWith(`${parentIdentifier}-`))
    d = d.slice(parentIdentifier.length + 1);
  return humanizeIdentifier(d);
}

/**
 * A display name: the `title` tag (required, and missing in the wild), else
 * the `d` humanized. A shelf's `root` is the reader's whole bookshelf.
 */
export function publicationTitle(ev: { kind?: number; tags: string[][] }): string {
  const title = tagValue(ev, "title");
  if (title) return title;
  const d = tagValue(ev, "d") ?? "";
  return ev.kind === BOOKSHELF_KIND && d === "root" ? "Bookshelf" : humanizeIdentifier(d);
}

/**
 * A long-form event's title, or "" without one. A publication, section or
 * shelf often has none, and its slug reads well enough to name it.
 */
export function articleTitle(event: { kind: number; tags: string[][] }): string {
  const title = event.tags.find((t) => t[0] === "title")?.[1]?.trim();
  if (title) return title;
  return PUBLICATION_KINDS.has(event.kind) ? publicationTitle(event) : "";
}

/**
 * A book's own index, not one of its parts. Both are kind 30040; a part
 * (Alexandria's "Article 1") carries only a title and its contents, where
 * the book says what the work is — its author, summary, cover, date or
 * topics. Where a list of someone's writing should show their books, this
 * keeps a book of 30 parts from filling it with 30 entries.
 */
export function isBookIndex(ev: { kind: number; tags: string[][] }): boolean {
  if (ev.kind !== PUBLICATION_INDEX_KIND) return false;
  return ev.tags.some(
    (t) => ["author", "summary", "image", "published_on", "published_by", "t"].includes(t[0]) && !!t[1]?.trim(),
  );
}

/** "1 book", "3 shelves": a count and its noun, or "" for none. */
export const countOf = (count: number, one: string, many: string): string =>
  count ? `${count} ${count === 1 ? one : many}` : "";

/** What a shelf holds, by kind: its books, and the shelves on it. */
export function shelfCounts(ev: { tags: string[][] }): { books: number; shelves: number; other: number } {
  let books = 0;
  let shelves = 0;
  let other = 0;
  for (const ref of publicationSections(ev)) {
    if (ref.address?.kind === PUBLICATION_INDEX_KIND) books++;
    else if (ref.address?.kind === BOOKSHELF_KIND) shelves++;
    else other++;
  }
  return { books, shelves, other };
}

/** "12 books · 2 shelves", or "" for an empty shelf. */
export function shelfLine(ev: { tags: string[][] }): string {
  const { books, shelves, other } = shelfCounts(ev);
  return [countOf(books, "book", "books"), countOf(shelves, "shelf", "shelves"), countOf(other, "item", "items")]
    .filter(Boolean)
    .join(" · ");
}

export interface PublicationMeta {
  title: string;
  /** The work's author as a name ("Aesop"), not a pubkey. */
  author?: string;
  summary?: string;
  image?: string;
  /** How it wants to be displayed: book, illustrated, magazine, document… `book` when unsaid. */
  type: string;
  /** An edition label, "3rd edition". */
  version?: string;
  /** When and by whom the work itself was published, as written ("15.12.1791"). */
  publishedOn?: string;
  publishedBy?: string;
  topics: string[];
}

export function publicationMeta(ev: { tags: string[][] }): PublicationMeta {
  return {
    title: publicationTitle(ev),
    author: tagValue(ev, "author"),
    summary: tagValue(ev, "summary"),
    image: tagValue(ev, "image"),
    type: tagValue(ev, "type") ?? "book",
    version: tagValue(ev, "version"),
    publishedOn: tagValue(ev, "published_on"),
    publishedBy: tagValue(ev, "published_by"),
    topics: Array.from(new Set(ev.tags.filter((t) => t[0] === "t" && t[1]?.trim()).map((t) => t[1].trim()))),
  };
}

export interface SectionAddress {
  kind: number;
  pubkey: string;
  identifier: string;
  relays?: string[];
}

/** One entry in an index's table of contents. */
export interface SectionRef {
  /** The coordinate it was listed by, if by address. */
  address?: SectionAddress;
  /** The event it was listed by, if by id (or the revision an address pins). */
  eventId?: string;
  /** Where the index says an entry listed by id lives. */
  relay?: string;
  /** A title the index itself carries, readable before the section is fetched. */
  title?: string;
  /** Nesting depth, 1 at the top. */
  level: number;
  /** `kind:pubkey:d`, or the id: unique within one index. */
  key: string;
}

/** A dotted host with no spaces: a relay, never a chapter title. */
const SCHEMELESS_HOST = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?(\/\S*)?$/;
const looksLikeRelay = (v: string) => /^(wss?|https?):\/\//i.test(v) || SCHEMELESS_HOST.test(v);
const isRelayUrl = (v: string) => /^wss?:\/\/\S+$/i.test(v);
const plausibleLevel = (v: string) => /^\d+$/.test(v) && +v >= 1 && +v <= MAX_LEVEL;
const levelOf = (v: string) => (/^\d+$/.test(v) ? Math.min(MAX_LEVEL, Math.max(1, +v)) : 1);

function parseCoordinate(value: string): SectionAddress | null {
  const [kind, pubkey, ...rest] = value.trim().split(":");
  if (!/^\d+$/.test(kind ?? "") || !HEX64.test(pubkey ?? "")) return null;
  return { kind: +kind, pubkey: pubkey.toLowerCase(), identifier: rest.join(":") };
}

/**
 * The table of contents, in tag order — the order the spec says to show.
 *
 * NKBIP-01 documents `["a", "<kind:pubkey:d>", "<relay>", "<event id>"]`;
 * publishers also list sections by `e`, put a title in slot 2 and a nesting
 * level in slot 3. All of those are read. `A`/`E` are not sections: on a
 * derivative work they name the original, so matching is case-sensitive.
 */
export function publicationSections(ev: { tags: string[][] }): SectionRef[] {
  const seen = new Set<string>();
  const refs: SectionRef[] = [];
  for (const tag of ev.tags) {
    const slot2 = tag[2]?.trim() ?? "";
    const slot3 = tag[3]?.trim() ?? "";
    let ref: SectionRef | null = null;
    if (tag[0] === "a" && tag[1]) {
      const address = parseCoordinate(tag[1]);
      if (!address) continue;
      if (isRelayUrl(slot2)) address.relays = [slot2];
      ref = {
        address,
        eventId: HEX64.test(slot3) ? slot3.toLowerCase() : undefined,
        // A small integer in slot 2 is a level, not a title, though a chapter can be called "1984".
        title: slot2 && !looksLikeRelay(slot2) && !plausibleLevel(slot2) ? slot2 : undefined,
        level: levelOf(slot3),
        key: `${address.kind}:${address.pubkey}:${address.identifier}`,
      };
    } else if (tag[0] === "e" && HEX64.test(tag[1]?.trim() ?? "")) {
      const id = tag[1].trim().toLowerCase();
      ref = {
        eventId: id,
        relay: isRelayUrl(slot2) ? slot2 : undefined,
        title: slot2 && !looksLikeRelay(slot2) ? slot2 : undefined,
        level: levelOf(slot3),
        key: id,
      };
    }
    if (ref && !seen.has(ref.key)) {
      seen.add(ref.key);
      refs.push(ref);
    }
  }
  return refs;
}

/**
 * The index a section names as its book: `T` (or `c`) holds the index's bare
 * `d`, with no pubkey — an index and its sections share an author, so the
 * section's own is used. Most sections carry neither; their book is found by
 * asking who lists them (hooks/usePublication).
 */
export function sectionBookAddress(ev: EventLike): SectionAddress | null {
  if (ev.kind !== PUBLICATION_SECTION_KIND) return null;
  const d = tagValue(ev, "T") ?? tagValue(ev, "c");
  return d ? { kind: PUBLICATION_INDEX_KIND, pubkey: ev.pubkey, identifier: d } : null;
}

/** An event's `kind:pubkey:d`, for an addressable kind. */
export function coordinateOf(ev: { kind: number; pubkey: string; tags: string[][] }): string {
  return `${ev.kind}:${ev.pubkey}:${ev.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
}

/**
 * A contents entry's name: its event's title, then the one the index gives
 * it, then its `d` with the parent's prefix taken off ("Section 3"). The same
 * everywhere it is named — the contents, the text, a shelf, a comment's label.
 */
export function entryTitle(
  ref: SectionRef,
  event: { kind: number; tags: string[][] } | undefined,
  parentD: string,
): string {
  const title = event && tagValue(event, "title");
  if (title) return title;
  if (ref.title) return ref.title;
  if (ref.address?.kind === BOOKSHELF_KIND && ref.address.identifier === "root") return "Bookshelf";
  if (ref.address) return entryFallbackTitle(ref.address.identifier, parentD);
  return event ? publicationTitle(event) : "Untitled section";
}

/** An entry's own page: by its address when it has one, else by id; undefined when neither encodes. */
export function entryHref(
  ref: SectionRef,
  event?: { id: string; kind: number; pubkey: string; tags: string[][] },
): string | undefined {
  if (event) return eventPath(event, ref.address?.relays ?? []);
  try {
    if (ref.address) return `/e/${nip19.naddrEncode(ref.address)}`;
  } catch {
    /* an address that won't encode falls through to its id */
  }
  return ref.eventId ? `/e/${neventFor(ref.eventId, ref.relay ? [ref.relay] : [])}` : undefined;
}

/** Whether a contents entry names this event: by its address, or by its id. */
export function refMatches(ref: SectionRef, ev: { id: string; kind: number; pubkey: string; tags: string[][] }) {
  return ref.eventId === ev.id || (!!ref.address && ref.key === coordinateOf(ev));
}

/** Case- and separator-insensitive: the body writes "the Farmer", the tag "the-farmer". */
const normalizeWikilink = (target: string) => target.trim().toLowerCase().replace(/[ _]/g, "-");

/**
 * Where a section's `[[wikilink]]` goes. Its `wikilink` tag —
 * `["wikilink", target, pubkey, relay, event id]` — names the wiki page: by id
 * when it pins one, else that author's page on the topic. With no tag, a
 * search for the topic's articles here, as a wiki page's own wikilinks are.
 */
function wikilinkResolver(ev: { tags: string[][] }) {
  return (target: string): string => {
    const tag = ev.tags.find(
      (t) => t[0] === "wikilink" && t[1] && normalizeWikilink(t[1]) === normalizeWikilink(target),
    );
    const pubkey = tag?.[2] && HEX64.test(tag[2]) ? tag[2] : undefined;
    const relays = tag?.[3] && isRelayUrl(tag[3]) ? [tag[3]] : [];
    try {
      if (tag?.[4] && HEX64.test(tag[4])) return `/e/${nip19.neventEncode({ id: tag[4], author: pubkey, relays })}`;
      if (pubkey)
        return `/e/${nip19.naddrEncode({ kind: 30818, pubkey, identifier: normalizeWikilink(tag![1]), relays })}`;
    } catch {
      /* fall through to the search */
    }
    return `/?q=${encodeURIComponent(target)}&t=articles`;
  };
}

type SectionLike = { tags: string[][]; content: string };

/**
 * Per event, the conversions below: an event never changes, and a card or a
 * row asks again on every render — a chapter is tens of KB of AsciiDoc.
 */
const MARKDOWN = new WeakMap<SectionLike, string>();
const PLAIN = new WeakMap<SectionLike, string>();

/** A section's body as markdown. NKBIP-01 sections are AsciiDoc by their kind; no sniffing. */
export function sectionMarkdown(ev: SectionLike): string {
  let md = MARKDOWN.get(ev);
  if (md === undefined) MARKDOWN.set(ev, (md = asciiDocToMarkdown(ev.content || "", wikilinkResolver(ev))));
  return md;
}

/** How much of a section a one-line excerpt reads: a card shows two lines of it. */
const PLAIN_TEXT_SOURCE = 8_000;

/**
 * A section's words on one line, for a card or a search row: markup taken off
 * as tokens — a link reads as its label, emphasis as its words, an image not
 * at all — and every other character, `snake_case` or `5 > 3`, left alone.
 */
export function sectionPlainText(ev: SectionLike): string {
  const cached = PLAIN.get(ev);
  if (cached !== undefined) return cached;
  const text = asciiDocToMarkdown((ev.content || "").slice(0, PLAIN_TEXT_SOURCE))
    .split("\n")
    .filter((line) => !/^\s*(?:#{1,6} |```|\*\*\*$)/.test(line))
    .map((line) => line.replace(/^\s*(?:>\s?)*(?:(?:-|\d+\.) )?/, ""))
    .join(" ")
    .replace(/!\[[^\]\n]{0,1024}\]\([^)\s]{0,2048}\)/g, "")
    .replace(/\[([^\]\n]{1,1024})\]\([^)\s]{0,2048}\)/g, "$1")
    .replace(/\*\*([^*\n]{1,1024}?)\*\*/g, "$1")
    .replace(/(?<![\w*\\])\*([^*\s][^*\n]{0,1024}?)\*(?![\w*])/g, "$1")
    .replace(/`([^`\n]{1,1024})`/g, "$1")
    .replace(/\\([*~])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  PLAIN.set(ev, text);
  return text;
}
