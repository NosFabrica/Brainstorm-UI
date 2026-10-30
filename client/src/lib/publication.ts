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

export const PUBLICATION_INDEX_KIND = 30040;
export const PUBLICATION_SECTION_KIND = 30041;

type EventLike = { kind: number; pubkey: string; tags: string[][]; content: string };

/** The deepest nesting a contents entry may claim. */
const MAX_LEVEL = 6;

const tagValue = (ev: { tags: string[][] }, name: string): string | undefined => {
  const v = ev.tags.find((t) => t[0] === name)?.[1]?.trim();
  return v ? v : undefined;
};

const HEX64 = /^[0-9a-f]{64}$/i;

/** `wuthering-heights` → `Wuthering Heights`. Anything that is not a slug stays as it is. */
export function humanizeIdentifier(d: string): string {
  const words = d.replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return d;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

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

/** A display name: the `title` tag (required, and missing in the wild), else the `d` humanized. */
export function publicationTitle(ev: { tags: string[][] }): string {
  return tagValue(ev, "title") ?? humanizeIdentifier(tagValue(ev, "d") ?? "");
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

/** A section's body as markdown. NKBIP-01 sections are AsciiDoc by their kind; no sniffing. */
export function sectionMarkdown(ev: { tags: string[][]; content: string }): string {
  return asciiDocToMarkdown(ev.content || "", wikilinkResolver(ev));
}

/** A section's words on one line, for a card or a search row. */
export function sectionPlainText(ev: { tags: string[][]; content: string }): string {
  return asciiDocToMarkdown(ev.content || "")
    .split("\n")
    .filter((line) => !/^\s*(?:#{1,6} |```|!\[)/.test(line))
    .map((line) => line.replace(/^\s*(?:-|\d+\.) /, ""))
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
