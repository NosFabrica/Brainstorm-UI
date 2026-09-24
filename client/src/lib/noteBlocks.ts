/**
 * Reading-mode structure for a kind-1 note: the flat token stream from
 * `parseNoteContent` regrouped into paragraphs, headings, lists, quotes and
 * code blocks, so a long note on its own page reads like prose instead of one
 * pre-wrapped wall. Only the light markdown crossposters actually put in notes
 * — `#`/`##`/`###` headings, `-`/`*`/`1.` lists, `>` quotes, ``` fences and
 * `---` rules — nothing that would misfire on ordinary chat text.
 *
 * Then a prose pass for text that never used markdown at all — RSS bridges
 * posting whole news articles are the common case: one paragraph per line,
 * the headline on top, a photo with its caption and credit, and short
 * unpunctuated lines as section heads. See `refineProse`.
 *
 * Inline emphasis (`**bold**`, `*italic*`, `` `code` ``) is a separate pass
 * over text runs: see `parseInlineMarkdown`.
 */
import type { NoteToken } from "@/lib/noteContent";

export type NoteBlock =
  | { type: "p"; tokens: NoteToken[] }
  | { type: "h"; level: 1 | 2 | 3; tokens: NoteToken[] }
  | { type: "ul" | "ol"; items: NoteToken[][]; start?: number }
  | { type: "quote"; tokens: NoteToken[] }
  | { type: "code"; text: string }
  | { type: "caption"; tokens: NoteToken[] }
  | { type: "hr" };

type Line = NoteToken[];

const HEADING = /^(#{1,3})[ \t]+/;
const BULLET = /^[ \t]*[-*•][ \t]+/;
const ORDERED = /^[ \t]*(\d{1,3})[.)][ \t]+/;
const QUOTE = /^>(?:[ \t]+|$)/;
const RULE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const FENCE = /^[ \t]*```/;
/** A line this long is prose, not a verse or a list someone typed by hand. */
const PROSE_LINE = 100;
/** Ends like a sentence (or a clause), closing quotes/brackets allowed. */
const ENDS_SENTENCE = /[.!?…:;,]["”'’»)\]]*\s*$/;

/** The token stream cut at every newline inside text runs. */
function splitLines(tokens: NoteToken[]): Line[] {
  const lines: Line[] = [[]];
  for (const t of tokens) {
    if (t.type !== "text") {
      lines[lines.length - 1].push(t);
      continue;
    }
    const parts = t.value.replace(/\r\n?/g, "\n").split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: "text", value: part });
    });
  }
  return lines;
}

/** The line's source text — only for code fences, where nothing renders rich. */
function rawText(line: Line): string {
  return line
    .map((t) => (t.type === "mention" ? `nostr:${t.bech32}` : t.value))
    .join("");
}

function lineText(line: Line): string | null {
  return line.every((t) => t.type === "text") ? line.map((t) => (t as { value: string }).value).join("") : null;
}

function isBlank(line: Line): boolean {
  return line.every((t) => t.type === "text" && !t.value.trim());
}

/** The line's leading text, if it starts with text. */
function leadText(line: Line): string {
  const first = line[0];
  return first && first.type === "text" ? first.value : "";
}

/** The line with `n` characters removed from its leading text run. */
function stripLead(line: Line, n: number): Line {
  if (!n) return line;
  const first = line[0] as { type: "text"; value: string };
  const rest = first.value.slice(n);
  return rest ? [{ type: "text", value: rest }, ...line.slice(1)] : line.slice(1);
}

/** Lines joined back into one inline run, single breaks kept as `\n`. */
function joinLines(lines: Line[]): NoteToken[] {
  const out: NoteToken[] = [];
  lines.forEach((l, i) => {
    if (i > 0) out.push({ type: "text", value: "\n" });
    out.push(...l);
  });
  return out;
}

export function toNoteBlocks(tokens: NoteToken[]): NoteBlock[] {
  const lines = splitLines(tokens);
  const blocks: NoteBlock[] = [];
  let para: Line[] = [];
  let quote: Line[] = [];
  let list: { type: "ul" | "ol"; items: Line[]; start?: number } | null = null;

  const flush = () => {
    // Lines of prose each end a paragraph: a bridge that writes one
    // paragraph per line never leaves the blank line between them.
    if (para.length > 1 && para.some((l) => textLength(l) >= PROSE_LINE)) {
      for (const l of para) blocks.push({ type: "p", tokens: tidy(l) });
    } else if (para.length) blocks.push({ type: "p", tokens: joinLines(para) });
    if (quote.length) blocks.push({ type: "quote", tokens: joinLines(quote) });
    if (list) blocks.push(list.type === "ol" && list.start !== undefined && list.start !== 1 ? list : { type: list.type, items: list.items });
    para = [];
    quote = [];
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lead = leadText(line);

    if (isBlank(line)) {
      flush();
      continue;
    }

    // ``` fence — everything up to the closing fence (or the end) verbatim.
    const text = lineText(line);
    if (text !== null && FENCE.test(text)) {
      flush();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !FENCE.test(lineText(lines[j]) ?? "")) body.push(rawText(lines[j++]));
      blocks.push({ type: "code", text: body.join("\n") });
      i = j;
      continue;
    }
    if (text !== null && RULE.test(text)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }

    const h = HEADING.exec(lead);
    if (h && line.length > 0 && (lead.length > h[0].length || line.length > 1)) {
      flush();
      blocks.push({ type: "h", level: h[1].length as 1 | 2 | 3, tokens: stripLead(line, h[0].length) });
      continue;
    }

    const q = QUOTE.exec(lead);
    if (q) {
      if (!quote.length) flush();
      quote.push(stripLead(line, q[0].length));
      continue;
    }

    const b = BULLET.exec(lead);
    const o = b ? null : ORDERED.exec(lead);
    if (b || o) {
      const kind = b ? "ul" : "ol";
      if (!list || list.type !== kind) {
        flush();
        list = { type: kind, items: [], start: o ? Number(o[1]) : undefined };
      }
      list.items.push(stripLead(line, (b ?? o)![0].length));
      continue;
    }

    // A plain line right under a list item continues that item (soft wrap).
    if (list) {
      const last = list.items[list.items.length - 1];
      last.push({ type: "text", value: "\n" }, ...line);
      continue;
    }
    if (quote.length) flush();
    para.push(line);
  }
  flush();
  return refineProse(blocks, textLength(tokens));
}

function textLength(ts: NoteToken[]): number {
  return ts.reduce((n, t) => n + (t.type === "text" ? t.value.trim().length : 0), 0);
}

/** A prose line's text runs with the typing noise out: edge space trimmed,
 *  doubled spaces single. */
function tidy(line: Line): Line {
  const out = line.map((t) => (t.type === "text" ? { ...t, value: t.value.replace(/[ \t]{2,}/g, " ") } : t));
  const first = out[0];
  if (first?.type === "text") out[0] = { ...first, value: first.value.trimStart() };
  const last = out[out.length - 1];
  if (last?.type === "text") out[out.length - 1] = { ...last, value: last.value.trimEnd() };
  return out.filter((t) => t.type !== "text" || t.value);
}

/** The block's text when it is one line of nothing but text. */
function soleLine(b: NoteBlock | undefined): string | null {
  if (!b || b.type !== "p" || !b.tokens.every((t) => t.type === "text")) return null;
  const s = b.tokens.map((t) => (t as { value: string }).value).join("").trim();
  return s && !s.includes("\n") ? s : null;
}

function isImageOnly(b: NoteBlock | undefined): boolean {
  return !!b && b.type === "p" && b.tokens.some((t) => t.type === "image") &&
    b.tokens.every((t) => t.type === "image" || (t.type === "text" && !t.value.trim()));
}

/**
 * Structure for unmarked prose, read from the shape of lines alone. Only
 * short, unpunctuated single lines are ever promoted, and only where the
 * surroundings agree — a headline needs a long note under it, a caption
 * needs a picture above it, a section head needs a paragraph after it — so
 * a chatty note never grows headings.
 */
export function refineProse(blocks: NoteBlock[], totalLength: number): NoteBlock[] {
  const out: NoteBlock[] = [];
  let captions = 0;
  blocks.forEach((b, i) => {
    const s = soleLine(b);
    const tokens = b.type === "p" ? b.tokens : [];
    const prev = out[out.length - 1];
    const afterPicture = isImageOnly(prev) || (prev?.type === "caption" && captions < 2);
    if (s !== null && !ENDS_SENTENCE.test(s)) {
      if (i === 0 && totalLength > 600 && s.length <= 140 && blocks.length >= 3) {
        out.push({ type: "h", level: 1, tokens });
        return;
      }
      if (afterPicture && s.length <= 220) {
        captions++;
        out.push({ type: "caption", tokens });
        return;
      }
      const next = blocks[i + 1];
      if (
        s.length <= 70 && /^[\p{L}'"“‘]/u.test(s) &&
        prev?.type === "p" && !isImageOnly(prev) &&
        next?.type === "p" && textLength(next.tokens) >= PROSE_LINE
      ) {
        out.push({ type: "h", level: 3, tokens });
        return;
      }
    }
    if (!afterPicture) captions = 0;
    out.push(b);
  });
  return out;
}

export type InlineSpan =
  | { type: "text"; value: string }
  | { type: "strong" | "em"; children: InlineSpan[] }
  | { type: "code"; value: string };

// `code`, **strong** / __strong__, *em* / _em_. Emphasis must hug its text
// and not sit inside a word, so `snake_case`, `2 * 3` and `**` alone stay text.
const INLINE_RE =
  /`([^`\n]+)`|(\*\*|__)(?=\S)([^\n]+?)(?<=\S)\2(?![\p{L}\p{N}])|(?<![\p{L}\p{N}*_])([*_])(?=[^\s*_])([^\n]*?[^\s*_])\4(?![\p{L}\p{N}*_])/gu;

/** Inline emphasis in one text run. Unmatched markers stay literal. */
export function parseInlineMarkdown(text: string): InlineSpan[] {
  const out: InlineSpan[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    const [whole, code, , strong, , em] = m;
    if (code !== undefined) out.push({ type: "code", value: code });
    else if (strong !== undefined) out.push({ type: "strong", children: parseInlineMarkdown(strong) });
    else out.push({ type: "em", children: parseInlineMarkdown(em) });
    last = idx + whole.length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
