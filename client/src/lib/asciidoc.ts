/**
 * AsciiDoc → markdown, for NKBIP-01 publication sections (kind 30041). The
 * reader speaks markdown, so a section's body is translated first rather
 * than shipping an AsciiDoc engine. A port of Amethyst's converter
 * (quartz `AsciiDocToMarkdown`), which was measured against the sections on
 * the public relays, extended where its output misread as markdown.
 *
 * It handles what prose actually uses: headings, lists, emphasis, links,
 * images, source and literal blocks, quotes, admonitions (inline, and as a
 * `[NOTE]` over a block or a paragraph), example, sidebar and open blocks,
 * comments, anchors, thematic and page breaks, and hard breaks (` +`,
 * `[%hardbreaks]`, `:hardbreaks:`). Tables, includes, conditionals and
 * attribute substitution are not handled, and anything not recognized passes
 * through as the plain text it already was. A `*` or `~` that is not AsciiDoc
 * markup is escaped, so markdown does not read it as its own.
 *
 * Literal blocks are copied verbatim: a code sample's `*stars*` and
 * `[[brackets]]` survive.
 *
 * Every pattern that scans for a closing bracket is bounded: a section is
 * anyone's text, and an unbounded scan on a long line of `link:` or `[` is
 * quadratic — seconds of a frozen tab for a few hundred KB.
 *
 * wiki.ts keeps its own lighter translation for NIP-54 pages, which are
 * sniffed for AsciiDoc first; a section is AsciiDoc by its kind.
 */

const QUOTE_DELIMITER = "____";
const COMMENT_DELIMITER = "////";

const HEADING = /^(={1,6})\s+(\S.*)$/;
const UNORDERED_ITEM = /^(\*{1,5})\s+(\S.*)$/;
const ORDERED_ITEM = /^(\.{1,5})\s+(\S.*)$/;
const ADMONITION = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s+(\S.*)$/;
const BLOCK_ATTRIBUTE = /^\s*\[[^\]]*]\s*$/;
const ADMONITION_ATTRIBUTE = /^\[(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]$/;
/** `[[anchor]]` or `[[anchor,reftext]]` alone on a line: a target for cross-references, not text. */
const BLOCK_ANCHOR = /^\[\[[^[\]|]{1,256}]]$/;
/** Example (`====`), sidebar (`****`) and open (`--`) blocks: their fences carry no text. */
const CONTAINER_DELIMITER = /^(?:={4,}|\*{4,}|--)$/;
/** `'''` and the markdown-style rules Asciidoctor accepts; `<<<`, a page break, reads as one too. */
const THEMATIC_BREAK = /^(?:'''|\*\*\*|\* \* \*|- - -|<<<)$/;
/** ` +` at a line's end: AsciiDoc's hard line break. Alone on a line, it attaches a block to a list item. */
const LINE_BREAK = / \+$/;
const SOURCE_ATTRIBUTE = /^\[source\s*,\s*([^\],]*)(?:,[^\]]*)?]$/;
const DOC_ATTRIBUTE = /^:[A-Za-z][A-Za-z0-9_-]*!?:.*$/;
const HARDBREAKS_ATTRIBUTE = /^:hardbreaks(-option)?:\s*$/;
const HARDBREAKS_OPTION = /(^|[[,])%hardbreaks([\],])/;
const BLOCK_IMAGE = /^image::([^\s[]{1,2048})\[([^\]]{0,1024})]$/;
const INLINE_IMAGE = /image:([^\s[]{1,2048})\[([^\]\n]{0,1024})]/g;
const LINK_MACRO = /link:([^\s[]{1,2048})\[([^\]\n]{0,1024})]/g;
const BARE_URL_WITH_LABEL = /(?<!\()\b(https?:\/\/[^\s[\]]{1,2048})\[([^\]\n]{0,1024})]/g;
const WIKILINK = /\[\[([^[\]]{1,512})]]/g;
/** `**x**` and `__x__`: AsciiDoc's unconstrained forms, which may sit inside a word. */
const STRONG_UNCONSTRAINED = /\*\*([^*\n]{1,1024}?)\*\*/g;
const EM_UNCONSTRAINED = /__([^_\n]{1,1024}?)__/g;
const BOLD = /(?<![\w*])\*([^\s*][^*]*?)\*(?![\w*])/g;
const ITALIC = /(?<![\w_])_([^\s_][^_]*?)_(?![\w_])/g;
/** What emphasis must not reach into: code spans, markdown link targets, bare URLs. */
const PROTECTED = /`[^`\n]{1,2048}`|\]\([^)\s]{0,2048}\)|https?:\/\/[^\s)\]]{1,2048}/g;
/** Markdown nests a list item four columns in, enough under `- ` and `1. ` alike. */
const LIST_INDENT = "    ";
/** Past this, a line is not prose worth reading inline markup in: it passes through as text. */
const MAX_INLINE_LINE = 20_000;

/**
 * Private-use characters standing in for what emphasis must not touch while it
 * runs: a held span, and the markup it writes. Neither a word character nor a
 * mark, and stripped from the content first, so text can never forge one.
 * Built here rather than written out: an invisible character in a source file
 * is one nobody can see to review.
 */
const HOLD_OPEN = String.fromCharCode(0xe000);
const HOLD_CLOSE = String.fromCharCode(0xe001);
const STRONG = String.fromCharCode(0xe002);
const EM = String.fromCharCode(0xe003);
const SENTINELS = new RegExp(`[${HOLD_OPEN}${HOLD_CLOSE}${STRONG}${EM}]`, "g");
const HELD = new RegExp(`${HOLD_OPEN}(\\d+)${HOLD_CLOSE}`, "g");

/** Maps a `[[target]]` to a link, or null to leave its label as plain text. */
export type WikilinkResolver = (target: string) => string | null;

const noLinks: WikilinkResolver = () => null;

function verbatimDelimiterOf(line: string): string | null {
  const t = line.trim();
  return t === "----" || t === "...." || t === "++++" ? t : null;
}

/**
 * AsciiDoc bold is *x* and italic _x_; markdown's are **x** and *x*. Code,
 * link targets and URLs are held aside meanwhile (`/_draft_/` is a path), and
 * the markup is written as placeholders, so the `*` and `~` left over — in
 * `2*3*4`, in `H~2~O` — are text, escaped before markdown can read them.
 */
function emphasis(text: string): string {
  const held: string[] = [];
  return text
    .replace(PROTECTED, (span) => `${HOLD_OPEN}${held.push(span) - 1}${HOLD_CLOSE}`)
    .replace(STRONG_UNCONSTRAINED, (_m, s: string) => `${STRONG}${s}${STRONG}`)
    .replace(EM_UNCONSTRAINED, (_m, s: string) => `${EM}${s}${EM}`)
    .replace(BOLD, (_m, s: string) => `${STRONG}${s}${STRONG}`)
    .replace(ITALIC, (_m, s: string) => `${EM}${s}${EM}`)
    .replace(/[*~]/g, (c) => `\\${c}`)
    .replaceAll(STRONG, "**")
    .replaceAll(EM, "*")
    .replace(HELD, (_m, i: string) => held[+i] ?? "");
}

/** Inline markup. Order matters: link macros before emphasis, so labels survive. */
function inline(text: string, resolve: WikilinkResolver): string {
  if (text.length > MAX_INLINE_LINE) return text;
  return emphasis(
    text
      .replace(INLINE_IMAGE, (_m, url: string, alt: string) => `![${alt.split(",")[0].trim()}](${url})`)
      .replace(LINK_MACRO, (_m, url: string, label: string) => `[${label.trim() ? label : url}](${url})`)
      .replace(BARE_URL_WITH_LABEL, (_m, url: string, label: string) => `[${label}](${url})`)
      .replace(WIKILINK, (_m, raw: string) => {
        const [targetPart, ...rest] = raw.split("|");
        const target = targetPart.trim();
        const label = rest.length ? rest.join("|").trim() || target : target;
        const href = resolve(target);
        return href ? `[${label}](${href})` : label;
      }),
  );
}

type ListItem = { ordered: boolean; level: number; text: string };

function listItemOf(body: string): ListItem | null {
  const m = UNORDERED_ITEM.exec(body) ?? ORDERED_ITEM.exec(body);
  return m ? { ordered: m[1][0] === ".", level: m[1].length - 1, text: m[2] } : null;
}

/** One line's block markup, then its inline markup. A list item is placed by the caller. */
function block(line: string, resolve: WikilinkResolver): string {
  const indent = /^[ \t]*/.exec(line)![0];
  // Trailing whitespace must not defeat the whole-line matches below.
  const body = line.slice(indent.length).trimEnd();

  let m = HEADING.exec(body);
  // `= Title` is level 1, `== Section` level 2: markdown's `#` count.
  if (m) return `${"#".repeat(m[1].length)} ${inline(m[2], resolve)}`;
  m = ADMONITION.exec(body);
  if (m) return `> **${m[1]}:** ${inline(m[2], resolve)}`;
  m = BLOCK_IMAGE.exec(body);
  if (m) return `![${m[2].split(",")[0].trim()}](${m[1]})`;
  return indent + inline(body, resolve);
}

export function asciiDocToMarkdown(content: string, resolve: WikilinkResolver = noLinks): string {
  if (!content.trim()) return content;

  const out: string[] = [];
  const lines = content.replace(SENTINELS, "").replace(/\r\n?/g, "\n").split("\n");
  let openFence: string | null = null;
  // `:hardbreaks:` (document) and `[%hardbreaks]` (block): every newline in the
  // prose is a line break, where markdown would join them into one paragraph.
  let docHardBreaks = false;
  let blockHardBreaks = false;
  // `[source,kotlin]` names the language of the `----` on the next line.
  let pendingLanguage: string | null = null;
  // `[NOTE]` over a block or a paragraph makes it an admonition.
  let pendingAdmonition: string | null = null;
  // Open containers, innermost last; a quoted one prefixes its lines with `> `.
  const containers: { fence: string; quoted: boolean }[] = [];
  // A `[NOTE]` paragraph: quoted until the blank line that ends it.
  let quotedParagraph = false;
  // A fresh admonition's first line carries its label.
  let pendingLabel: string | null = null;
  // The depth of the list item last written, or -1 outside a list. Markdown
  // nests by indentation under an item that exists; AsciiDoc's `**` alone,
  // with no `*` above it, would otherwise be an indented code block.
  let listDepth = -1;
  let afterBlank = true;

  const emit = (text: string) => {
    const depth = containers.filter((c) => c.quoted).length + (quotedParagraph ? 1 : 0);
    if (pendingLabel && text.trim()) {
      text = `**${pendingLabel}:** ${text.trimStart()}`;
      pendingLabel = null;
    }
    out.push(depth ? `${">".repeat(depth)}${text ? ` ${text}` : ""}` : text);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    const bare = trimmed.trim();

    // Inside a verbatim block: copy until its delimiter, rewriting nothing.
    if (openFence !== null) {
      if (bare === openFence) {
        emit("```");
        openFence = null;
      } else emit(line);
      continue;
    }

    const delimiter = verbatimDelimiterOf(trimmed);
    if (delimiter) {
      emit("```" + (pendingLanguage ?? ""));
      pendingLanguage = null;
      openFence = delimiter;
      continue;
    }

    // A block comment hides everything up to its closing fence.
    if (bare === COMMENT_DELIMITER) {
      while (i + 1 < lines.length && lines[i + 1].trim() !== COMMENT_DELIMITER) i++;
      i++;
      continue;
    }

    // An example, sidebar or open block: its fences are dropped, its lines kept —
    // left as they were, `====` and `--` read as markdown heading underlines.
    // A blank line stands in for each fence, so the block is a block of its own.
    if (CONTAINER_DELIMITER.test(bare)) {
      const closing = containers.length > 0 && containers[containers.length - 1].fence === bare;
      if (closing) {
        containers.pop();
        pendingLabel = null;
      }
      const last = out[out.length - 1];
      if (last?.trim() && !/^>+$/.test(last) && lines[i + 1]?.trim()) emit("");
      if (!closing) {
        containers.push({ fence: bare, quoted: !!pendingAdmonition });
        pendingLabel = pendingAdmonition;
        pendingAdmonition = null;
      }
      continue;
    }

    // `[source,kotlin]`, `[quote]`, `[NOTE]`: attribute lines carry no text.
    if (BLOCK_ATTRIBUTE.test(trimmed) && !BLOCK_ANCHOR.test(bare)) {
      pendingLanguage = SOURCE_ATTRIBUTE.exec(bare)?.[1].trim() || pendingLanguage;
      pendingAdmonition = ADMONITION_ATTRIBUTE.exec(bare)?.[1] ?? pendingAdmonition;
      if (HARDBREAKS_OPTION.test(trimmed)) blockHardBreaks = true;
      continue;
    }

    // Document attributes (`:toc:`, `:author: X`), line comments, block anchors
    // and a list item's lone `+` are structure, not text.
    if (DOC_ATTRIBUTE.test(trimmed) || trimmed.startsWith("//") || BLOCK_ANCHOR.test(bare) || bare === "+") {
      if (HARDBREAKS_ATTRIBUTE.test(trimmed)) docHardBreaks = true;
      continue;
    }

    // A quote block's `____` fences become a blockquote over its lines.
    if (bare === QUOTE_DELIMITER) {
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== QUOTE_DELIMITER) end++;
      for (let q = i + 1; q < end; q++) emit(`> ${inline(lines[q], resolve)}`);
      emit("");
      i = end;
      continue;
    }

    // A rule, or a page break, which on a screen is one. A blank line before it,
    // so a line of text above does not read it as a heading's underline.
    if (THEMATIC_BREAK.test(bare)) {
      if (out[out.length - 1]?.trim()) emit("");
      emit("***");
      listDepth = -1;
      afterBlank = false;
      continue;
    }

    if (!bare) {
      // A block option, a `[NOTE]` paragraph, lapse at the blank line that ends their block.
      blockHardBreaks = false;
      quotedParagraph = false;
      afterBlank = true;
      emit("");
      continue;
    }

    // An attribute describes the block right below it, not one further on; a
    // `[NOTE]` over a paragraph quotes that paragraph.
    pendingLanguage = null;
    if (pendingAdmonition) {
      quotedParagraph = true;
      pendingLabel = pendingAdmonition;
      pendingAdmonition = null;
    }

    // ` +` ends the line here, whatever follows.
    const lineBreak = LINE_BREAK.test(trimmed);
    const source = lineBreak ? trimmed.replace(LINE_BREAK, "") : line;
    const item = listItemOf(source.trim());
    let converted: string;
    if (item) {
      // Nested no deeper than one level under the item above it.
      const depth = Math.min(item.level, listDepth + 1);
      listDepth = depth;
      converted = `${LIST_INDENT.repeat(depth)}${item.ordered ? "1." : "-"} ${inline(item.text, resolve)}`;
    } else {
      // A new paragraph ends the list; a line right under an item continues it.
      if (afterBlank) listDepth = -1;
      converted = block(source, resolve);
    }
    afterBlank = false;
    // Two trailing spaces: markdown's hard break, only where a line follows.
    const breakAfter = (lineBreak || docHardBreaks || blockHardBreaks) && converted.trim() && lines[i + 1]?.trim();
    emit(breakAfter ? `${converted}  ` : converted);
  }

  // An unterminated verbatim block still closes, or the whole tail is code.
  if (openFence !== null) emit("```");

  return out.join("\n").replace(/\n+$/, "");
}
