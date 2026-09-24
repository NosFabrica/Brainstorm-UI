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
  /** `art`: laid out by hand with spaces (ASCII art, a table) — the reader
   *  scales it to fit rather than scroll. */
  | { type: "code"; text: string; art?: boolean }
  | { type: "caption"; tokens: NoteToken[] }
  | { type: "hr" };

type Line = NoteToken[];

const HEADING = /^ {0,3}(#{1,6})[ \t]+/;
const BULLET = /^[ \t]*[-*+•][ \t]+/;
const ORDERED = /^[ \t]*(\d{1,3})[.)][ \t]+/;
const QUOTE = /^>(?:[ \t]+|$)/;
const RULE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
// A fence opens on ``` plus at most a language word, and closes on a bare
// ``` — "```npm install```" on one line is inline code, not a fence.
const FENCE = /^[ \t]*```[\w+#.-]*[ \t]*$/;
const FENCE_CLOSE = /^[ \t]*```[ \t]*$/;
/** A line this long is prose, not a verse or a list someone typed by hand. */
const PROSE_LINE = 100;
/** Ends like a sentence (or a clause), closing quotes/brackets allowed. */
// Latin, Arabic/Persian (؟ ، ؛ ۔), CJK (。！？，；：) and Devanagari (।) stops.
/** A sentence ends inside the line and more follows — an attributed quote
 *  («…است.» (Rumi)), two sentences: prose, never a title. */
const INNER_SENTENCE = /[.!?؟。！？]["”'’»«)\]」』]*\s+\S/;
const ENDS_SENTENCE = /[.!?…:;,؟،؛۔。！？，；：।]["”'’»«)\]」』]*\s*$/;

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

/** A line's text rebuilt from tokens — the fallback when the caller has no
 *  source text (the tokens lose `[label](url)` and wrapped-entity URLs). */
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

export type NoteBlockOptions = {
  /** Read a short first line of a long text as its headline. Off where the
   *  surface already has a title (a listing, a calendar event). */
  headline?: boolean;
  /** The text the tokens were parsed from. Code and preformatted blocks show
   *  it verbatim — tokens never span a newline, so its lines line up with
   *  the token lines one to one. */
  source?: string;
};

export function toNoteBlocks(tokens: NoteToken[], opts: NoteBlockOptions = {}): NoteBlock[] {
  const lines = splitLines(tokens);
  const src = opts.source?.split(/\r\n?|\n/);
  const raw = src && src.length === lines.length ? (i: number) => src[i] : (i: number) => rawText(lines[i]);
  const blocks: NoteBlock[] = [];
  let para: Line[] = [];
  let quote: Line[] = [];
  let list: { type: "ul" | "ol"; items: Line[]; start?: number } | null = null;

  const flush = () => {
    // Lines of prose each end a paragraph: a bridge that writes one
    // paragraph per line never leaves the blank line between them. Runs of
    // short lines between them (a timestamp list, a sign-off) stay together.
    if (para.length > 1 && para.some((l) => textLength(l) >= PROSE_LINE)) {
      let run: Line[] = [];
      const endRun = () => {
        if (run.length) blocks.push({ type: "p", tokens: run.length === 1 ? tidy(run[0]) : joinLines(run) });
        run = [];
      };
      for (const l of para) {
        if (textLength(l) >= PROSE_LINE) {
          endRun();
          blocks.push({ type: "p", tokens: tidy(l) });
        } else run.push(l);
      }
      endRun();
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
      while (j < lines.length && !FENCE_CLOSE.test(raw(j))) body.push(raw(j++));
      blocks.push({ type: "code", text: body.join("\n") });
      i = j;
      continue;
    }

    // A block laid out with spaces — ASCII art, a table, a pasted diff —
    // keeps its layout: monospaced, unwrapped, nothing read as markdown.
    if (i === 0 || isBlank(lines[i - 1])) {
      const group: string[] = [];
      for (let j = i; j < lines.length && !isBlank(lines[j]) && !FENCE.test(lineText(lines[j]) ?? ""); j++) group.push(raw(j));
      const pre = preformatted(group);
      if (pre) {
        flush();
        let end = i + group.length;
        // A diff runs on through its blank context lines, for as long as the
        // lines still look like a diff or a git log.
        if (pre === "diff") while (end < lines.length && (isBlank(lines[end]) || DIFF_LINE.test(raw(end)))) end++;
        const text = Array.from({ length: end - i }, (_, k) => raw(i + k)).join("\n").replace(/\s+$/, "");
        blocks.push(pre === "art" ? { type: "code", text, art: true } : { type: "code", text });
        i = end - 1;
        continue;
      }
    }

    if (text !== null && RULE.test(text)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }

    const h = HEADING.exec(lead);
    if (h && line.length > 0 && (lead.length > h[0].length || line.length > 1)) {
      flush();
      blocks.push({ type: "h", level: Math.min(h[1].length, 3) as 1 | 2 | 3, tokens: stripLead(line, h[0].length) });
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

    // An indented line under a list item continues it; anything else ends
    // the list — notes don't soft-wrap list items, they just stop listing.
    if (list && /^[ \t]+\S/.test(lead)) {
      const last = list.items[list.items.length - 1];
      last.push({ type: "text", value: "\n" }, ...stripLead(line, lead.length - lead.trimStart().length));
      continue;
    }
    if (list || quote.length) flush();
    para.push(line);
  }
  flush();
  return refineProse(blocks, textLength(tokens), opts.headline ?? true);
}

// Unmistakable starts only: a `diff --git` header, a hunk header, or a full
// `commit <sha>` line (a sentence that begins "commit 1a2b3c broke…" is prose).
const DIFF_START = /^(?:diff --git |@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@|commit [0-9a-f]{7,40}$)/;
/** Lines a diff or a git log is made of. */
const DIFF_LINE = /^(?:[ +\-@\\]|diff |index |commit |Author:|AuthorDate:|Commit:|CommitDate:|Date:|Merge:|new file|deleted file|similarity |rename |old mode|new mode|Binary files)/;
const GAP = /\S(?: {3,}|\t)\S/;

/** How a group of lines is laid out, if by hand: "diff" for a pasted diff or
 *  git log, "art" for spacing that carries meaning (art, tables). */
function preformatted(group: string[]): "diff" | "art" | null {
  if (group.some((l) => DIFF_START.test(l))) return "diff";
  const lines = group.filter((l) => l.trim());
  if (lines.length < 3) return null;
  const share = (test: (l: string) => boolean) => lines.filter(test).length / lines.length;
  if (share((l) => GAP.test(l.trim())) >= 0.3) return "art";
  // Mostly punctuation: box drawing, ASCII shapes.
  const symbolic = (l: string) => {
    // Emoji are words here, not drawing: a line of 🎉🔥 is a reaction.
    const t = l.replace(/[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u200d\ufe0f]/gu, "");
    return t.length > 4 && t.replace(/[\p{L}\p{N}]/gu, "").length / t.length > 0.5;
  };
  return share(symbolic) >= 0.4 ? "art" : null;
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

/** Up to two short unpunctuated lines — a caption and its credit. */
function captionLines(b: NoteBlock | undefined): boolean {
  if (!b || b.type !== "p" || !b.tokens.every((t) => t.type === "text")) return false;
  const lines = b.tokens.map((t) => (t as { value: string }).value).join("").trim().split("\n").map((l) => l.trim());
  return lines.length <= 2 && lines.every((l) => l && l.length <= 220 && !ENDS_SENTENCE.test(l));
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
export function refineProse(blocks: NoteBlock[], totalLength: number, headline = true): NoteBlock[] {
  const out: NoteBlock[] = [];
  const long = totalLength > 600;
  let captions = 0;
  blocks.forEach((b, i) => {
    const s = soleLine(b);
    const tokens = b.type === "p" ? b.tokens : [];
    const prev = out[out.length - 1];
    const afterPicture = isImageOnly(prev) || (prev?.type === "caption" && captions < 2);
    if (afterPicture && captionLines(b)) {
      captions++;
      const trimmed = tokens.map((t) => (t.type === "text" ? { ...t, value: t.value.replace(/^[ \t]+|[ \t]+$/gm, "").replace(/[ \t]{2,}/g, " ") } : t));
      out.push({ type: "caption", tokens: trimmed });
      return;
    }
    if (s !== null && !ENDS_SENTENCE.test(s) && !INNER_SENTENCE.test(s)) {
      if (headline && i === 0 && long && s.length <= 140 && blocks.length >= 3) {
        out.push({ type: "h", level: 1, tokens });
        return;
      }
      const next = blocks[i + 1];
      // A section head: short, title-like, between blocks of text — and only
      // in a long text.
      // Heads start like titles: a capital (or a caseless script), an opening
      // quote, or an emoji marker — "lol anyway" between paragraphs is chat.
      const starts = /^['"“‘]?[\p{Lu}\p{Lt}\p{Lo}]/u.test(s) || (s.length <= 50 && /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(s));
      if (
        long && s.length <= 70 && starts &&
        (prev?.type === "p" || prev?.type === "ul" || prev?.type === "ol" || prev?.type === "quote") && !isImageOnly(prev) &&
        ((next?.type === "p" && textLength(next.tokens) >= 60) || next?.type === "ul" || next?.type === "ol")
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
const INLINE_RE = new RegExp(
  [
    "(?<tick>`{1,3})(?<code>[^`\\n]+)\\k<tick>",
    // **strong** hugs its text; __strong__ only around a word, so ASCII
    // art's ____ runs and snake__case stay text.
    "\\*\\*(?=\\S)(?<strong>[^\\n]{1,300}?)(?<=\\S)\\*\\*(?![\\p{L}\\p{N}])",
    "(?<![\\p{L}\\p{N}_])__(?=[\\p{L}\\p{N}])(?<ustrong>[^\\n]{1,300}?)(?<=[\\p{L}\\p{N}])__(?![\\p{L}\\p{N}_])",
    "(?<![\\p{L}\\p{N}*])\\*(?=[^\\s*])(?<em>[^\\n*]{0,300}?[^\\s*])\\*(?![\\p{L}\\p{N}*])",
    "(?<![\\p{L}\\p{N}_])_(?=[\\p{L}\\p{N}])(?<uem>[^\\n_]{0,300}?[\\p{L}\\p{N}])_(?![\\p{L}\\p{N}_])",
  ].join("|"),
  "gu",
);

/** Inline emphasis in one text run. Unmatched markers stay literal. */
export function parseInlineMarkdown(text: string): InlineSpan[] {
  const out: InlineSpan[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    const g = m.groups!;
    const strong = g.strong ?? g.ustrong;
    const em = g.em ?? g.uem;
    if (g.code !== undefined) out.push({ type: "code", value: g.code });
    else if (strong !== undefined) out.push({ type: "strong", children: parseInlineMarkdown(strong) });
    else out.push({ type: "em", children: parseInlineMarkdown(em!) });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}
