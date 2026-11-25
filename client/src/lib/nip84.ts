/**
 * A NIP-84 highlight (kind 9802) read for showing: the passage someone marked,
 * what they said about it, the paragraph it sits in, and where it is from.
 *
 * Surveyed on the production relay (2026-10-08, 500 highlights): the source is
 * a Nostr article (`a` 30023, often with its version's `e` beside it) or a web
 * page (`r`, marked `source` or not marked at all; Boris-style extensions also
 * put the URL in an `i`); books carry `title` and `author` and no link. Most
 * carry a `context` that holds the passage word for word — some re-wrapped,
 * so the passage is found in it with whitespace taken loosely. `comment` is a
 * quote highlight's own words (Amethyst, Highlighter).
 */
import { HEX64, hostOf, tagValue, type ResultRef } from "@/lib/resultReaders";
import { externalRef, identifierName, type ExternalRef } from "@/lib/nip73";

type HighlightEvent = { kind: number; tags: string[][]; content: string };

export interface HighlightSource {
  /** The Nostr event the passage is from: an article by address, a note by id. */
  ref: ResultRef | null;
  /** The web page it is from. */
  url: string | null;
  /** That page's host, said in place of a page title until one is known. */
  host: string | null;
  /** A work with no link — a book — by its own name and author. */
  title: string | null;
  author: string | null;
  /** A NIP-73 id the source is (an `i` that is not a web address): a book's ISBN, a podcast episode. */
  identifier: ExternalRef | null;
}

/** Someone a highlight tags as the material's own: an author or an editor (NIP-84 "Attribution"). */
export interface Attribution {
  pubkey: string;
  /** The tag's last value when it is a role ("author", "editor"); null when it names none. */
  role: string | null;
}

export interface Highlight {
  passage: string;
  /** The highlighter's own words about it (a quote highlight). */
  comment: string | null;
  /** The paragraph around the passage, when the context holds it. */
  context: { before: string; after: string } | null;
  source: HighlightSource;
  /** Who wrote the passage (`p` tags as author, or with no role). */
  authors: string[];
  /** Everyone the highlight attributes the material to, with their role — never a comment's `mention`. */
  attributions: Attribution[];
}

const isHttp = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where the passage sits in the context: exactly, or with its whitespace re-wrapped. */
function locate(context: string, passage: string): { start: number; end: number } | null {
  const exact = context.indexOf(passage);
  if (exact >= 0) return { start: exact, end: exact + passage.length };
  const words = passage.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 400) return null;
  const m = new RegExp(words.map(escape).join("\\s+"), "i").exec(context);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

function sourceOf(ev: HighlightEvent): HighlightSource {
  const a = ev.tags.find((t) => t[0] === "a" && /^\d+:[0-9a-f]{64}:/i.test(t[1] ?? ""));
  const e = ev.tags.find((t) => t[0] === "e" && HEX64.test(t[1] ?? "") && t[3] !== "mention");
  const ref: ResultRef | null = a
    ? { addr: a[1], relay: a[2] || undefined }
    : e
      ? { id: e[1].toLowerCase(), relay: e[2] || undefined }
      : null;
  // NIP-84: `r` is "anything else (may contain a URL or text)"; one marked `mention` is a
  // link in the comment, and the source, when several are given, is the one marked `source`.
  const rAll = ev.tags.filter((t) => t[0] === "r" && !!t[1]?.trim() && t[2] !== "mention");
  const rs = rAll.filter((t) => isHttp(t[1]));
  const r = rs.find((t) => t[2] === "source") ?? rs[0];
  // A source that is a text, not a link: a book named in words.
  const rText = rAll.find((t) => !isHttp(t[1]) && !/^wss?:\/\//i.test(t[1]))?.[1].trim() ?? null;
  // `i` (NIP-73): a web page is its link; any other id (an ISBN, an episode) is said as what it is.
  const iTag = ev.tags.find((t) => t[0] === "i" && !!t[1]?.trim());
  const i = iTag && isHttp(iTag[1]) ? iTag : undefined;
  const identifier = iTag && !i ? externalRef(iTag[1]) : null;
  const url = r?.[1] ?? i?.[1] ?? null;
  const offNostr = !url && !ref;
  return {
    ref,
    url,
    host: url ? hostOf(url).replace(/^www\./, "") : null,
    // A web page's `title` tag is often its first words, not its name: the page names itself.
    // `title`/`author` are no NIP-84 tags — books from Highlighter carry them — so they come
    // after what the spec defines: a text `r`, then the work's own NIP-73 id.
    title: offNostr ? (rText ?? tagValue(ev, "title") ?? identifierName(iTag?.[1]) ?? null) : null,
    author: offNostr ? tagValue(ev, "author") : null,
    identifier,
  };
}

/** A `p`'s role: its last value when that is a word, not a relay or nothing (`["p", pk, relay, role]`). */
function roleOf(t: string[]): string | null {
  if (t.length < 3) return null;
  const last = t[t.length - 1]?.trim().toLowerCase();
  return last && !/^wss?:\/\//.test(last) ? last : null;
}

/* One reading per event object: a quoted highlight's shape and its card both ask. */
const READINGS = new WeakMap<object, Highlight | null>();

export function parseHighlight(ev: HighlightEvent): Highlight | null {
  if (READINGS.has(ev)) return READINGS.get(ev)!;
  const read = readHighlight(ev);
  READINGS.set(ev, read);
  return read;
}

function readHighlight(ev: HighlightEvent): Highlight | null {
  if (ev.kind !== 9802) return null;
  const passage = ev.content.trim();
  if (!passage) return null;
  const raw = ev.tags.find((t) => t[0] === "context")?.[1] ?? "";
  const at = raw ? locate(raw, passage) : null;
  const before = at ? raw.slice(0, at.start).trim() : "";
  const after = at ? raw.slice(at.end).trim() : "";
  // NIP-84: "a role MAY be included as the last value of the tag"; `mention` is a comment's, not the material's.
  const attributions: Attribution[] = [];
  for (const t of ev.tags) {
    if (t[0] !== "p" || !HEX64.test(t[1] ?? "")) continue;
    const role = roleOf(t);
    const pubkey = t[1].toLowerCase();
    if (role === "mention" || attributions.some((a) => a.pubkey === pubkey && a.role === role)) continue;
    attributions.push({ pubkey, role });
  }
  const authors = [...new Set(attributions.filter((a) => !a.role || a.role === "author").map((a) => a.pubkey))];
  return {
    passage,
    comment: tagValue(ev, "comment"),
    // A context that is only the passage again adds nothing.
    context: before || after ? { before, after } : null,
    source: sourceOf(ev),
    authors,
    attributions,
  };
}

/** The end of `text` cut to about `n` characters at a word, said to be cut. */
export function tailOf(text: string, n: number): string {
  if (text.length <= n) return text;
  const cut = text.slice(text.length - n);
  const space = cut.indexOf(" ");
  return `…${(space >= 0 && space < n * 0.4 ? cut.slice(space + 1) : cut).trimStart()}`;
}
