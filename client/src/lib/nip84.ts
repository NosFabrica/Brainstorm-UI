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
  const rs = ev.tags.filter((t) => t[0] === "r" && isHttp(t[1]) && t[2] !== "mention");
  const r = rs.find((t) => t[2] === "source") ?? rs[0];
  const i = ev.tags.find((t) => t[0] === "i" && isHttp(t[1]));
  const url = r?.[1] ?? i?.[1] ?? null;
  return {
    ref,
    url,
    host: url ? hostOf(url).replace(/^www\./, "") : null,
    // A web page's `title` tag is often its first words, not its name: the page names itself.
    title: url || ref ? null : tagValue(ev, "title"),
    author: url || ref ? null : tagValue(ev, "author"),
  };
}

export function parseHighlight(ev: HighlightEvent): Highlight | null {
  if (ev.kind !== 9802) return null;
  const passage = ev.content.trim();
  if (!passage) return null;
  const raw = ev.tags.find((t) => t[0] === "context")?.[1] ?? "";
  const at = raw ? locate(raw, passage) : null;
  const before = at ? raw.slice(0, at.start).trim() : "";
  const after = at ? raw.slice(at.end).trim() : "";
  const authors = [
    ...new Set(
      ev.tags
        .filter((t) => t[0] === "p" && HEX64.test(t[1] ?? "") && (!t[3] || t[3] === "author"))
        .map((t) => t[1].toLowerCase()),
    ),
  ];
  return {
    passage,
    comment: tagValue(ev, "comment"),
    // A context that is only the passage again adds nothing.
    context: before || after ? { before, after } : null,
    source: sourceOf(ev),
    authors,
  };
}

/** The end of `text` cut to about `n` characters at a word, said to be cut. */
export function tailOf(text: string, n: number): string {
  if (text.length <= n) return text;
  const cut = text.slice(text.length - n);
  const space = cut.indexOf(" ");
  return `…${(space >= 0 && space < n * 0.4 ? cut.slice(space + 1) : cut).trimStart()}`;
}
