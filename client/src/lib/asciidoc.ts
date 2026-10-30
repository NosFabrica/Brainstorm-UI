/**
 * AsciiDoc → markdown, for NKBIP-01 publication sections (kind 30041). The
 * reader speaks markdown, so a section's body is translated first rather
 * than shipping an AsciiDoc engine. A port of Amethyst's converter
 * (quartz `AsciiDocToMarkdown`), which was measured against the sections on
 * the public relays, extended where its output misread as markdown.
 *
 * It handles what prose actually uses: headings, lists, emphasis, links,
 * images, source and literal blocks, quotes, admonitions (inline, and as a
 * `[NOTE]` over a `====` block), example, sidebar and open blocks, comments,
 * and hard breaks (` +`, `[%hardbreaks]`, `:hardbreaks:`). Tables, includes,
 * conditionals and attribute substitution are not handled, and anything not
 * recognized passes through as the plain text it already was.
 *
 * Literal blocks are copied verbatim: a code sample's `*stars*` and
 * `[[brackets]]` survive.
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
/** Example (`====`), sidebar (`****`) and open (`--`) blocks: their fences carry no text. */
const CONTAINER_DELIMITER = /^(?:={4,}|\*{4,}|--)$/;
/** ` +` at a line's end: AsciiDoc's hard line break. */
const LINE_BREAK = / \+$/;
const SOURCE_ATTRIBUTE = /^\[source\s*,\s*([^\],]*)(?:,[^\]]*)?]$/;
const DOC_ATTRIBUTE = /^:[A-Za-z][A-Za-z0-9_-]*!?:.*$/;
const HARDBREAKS_ATTRIBUTE = /^:hardbreaks(-option)?:\s*$/;
const HARDBREAKS_OPTION = /(^|[[,])%hardbreaks([\],])/;
const BLOCK_IMAGE = /^image::(\S+?)\[(.*)]$/;
const INLINE_IMAGE = /image:(\S+?)\[([^\]]*)]/g;
const LINK_MACRO = /link:(\S+?)\[([^\]]*)]/g;
const BARE_URL_WITH_LABEL = /(?<!\()\b(https?:\/\/[^\s[\]]+)\[([^\]]*)]/g;
const WIKILINK = /\[\[([^[\]]+)]]/g;
const BOLD = /(?<![\w*])\*([^\s*][^*]*?)\*(?![\w*])/g;
const ITALIC = /(?<![\w_])_([^\s_][^_]*?)_(?![\w_])/g;
/** What emphasis must not reach into: code spans, markdown link targets, bare URLs. */
const PROTECTED = /`[^`\n]+`|\]\([^)\s]*\)|https?:\/\/[^\s)\]]+/g;
/** Stands in for a protected span while emphasis runs: neither a word character nor a mark. */
const HOLD = /(\d+)/g;
/** Markdown nests a list item four columns in, enough under `- ` and `1. ` alike. */
const LIST_INDENT = "    ";

/** Maps a `[[target]]` to a link, or null to leave its label as plain text. */
export type WikilinkResolver = (target: string) => string | null;

const noLinks: WikilinkResolver = () => null;

function verbatimDelimiterOf(line: string): string | null {
  const t = line.trim();
  return t === "----" || t === "...." || t === "++++" ? t : null;
}

/**
 * AsciiDoc bold is *x* and italic _x_; markdown's are **x** and *x*. Bold
 * first, and the italic pass never matches `*`, so bold isn't re-read. Code,
 * link targets and URLs are held aside meanwhile: `/_draft_/` is a path.
 */
function emphasis(text: string): string {
  const held: string[] = [];
  return text
    .replace(PROTECTED, (span) => `${held.push(span) - 1}`)
    .replace(BOLD, (_m, s: string) => `**${s}**`)
    .replace(ITALIC, (_m, s: string) => `*${s}*`)
    .replace(HOLD, (_m, i: string) => held[+i]);
}

/** Inline markup. Order matters: link macros before emphasis, so labels survive. */
function inline(text: string, resolve: WikilinkResolver): string {
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

/** One line's block markup, then its inline markup. */
function block(line: string, resolve: WikilinkResolver): string {
  const indent = /^[ \t]*/.exec(line)![0];
  // Trailing whitespace must not defeat the whole-line matches below.
  const body = line.slice(indent.length).trimEnd();

  let m = HEADING.exec(body);
  // `= Title` is level 1, `== Section` level 2: markdown's `#` count.
  if (m) return `${"#".repeat(m[1].length)} ${inline(m[2], resolve)}`;
  // AsciiDoc nests with repeated markers (`**`), markdown with indentation.
  m = UNORDERED_ITEM.exec(body);
  if (m) return `${LIST_INDENT.repeat(m[1].length - 1)}- ${inline(m[2], resolve)}`;
  m = ORDERED_ITEM.exec(body);
  if (m) return `${LIST_INDENT.repeat(m[1].length - 1)}1. ${inline(m[2], resolve)}`;
  m = ADMONITION.exec(body);
  if (m) return `> **${m[1]}:** ${inline(m[2], resolve)}`;
  m = BLOCK_IMAGE.exec(body);
  if (m) return `![${m[2].split(",")[0].trim()}](${m[1]})`;
  return indent + inline(body, resolve);
}

export function asciiDocToMarkdown(content: string, resolve: WikilinkResolver = noLinks): string {
  if (!content.trim()) return content;

  const out: string[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let openFence: string | null = null;
  // `:hardbreaks:` (document) and `[%hardbreaks]` (block): every newline in the
  // prose is a line break, where markdown would join them into one paragraph.
  let docHardBreaks = false;
  let blockHardBreaks = false;
  // `[source,kotlin]` names the language of the `----` on the next line.
  let pendingLanguage: string | null = null;
  // `[NOTE]` over a `====` block makes the block an admonition.
  let pendingAdmonition: string | null = null;
  // Open containers, innermost last; a quoted one prefixes its lines with `> `.
  const containers: { fence: string; quoted: boolean }[] = [];
  // A fresh admonition's first line carries its label.
  let pendingLabel: string | null = null;

  const emit = (text: string) => {
    const depth = containers.filter((c) => c.quoted).length;
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
    if (BLOCK_ATTRIBUTE.test(trimmed)) {
      pendingLanguage = SOURCE_ATTRIBUTE.exec(bare)?.[1].trim() || pendingLanguage;
      pendingAdmonition = ADMONITION_ATTRIBUTE.exec(bare)?.[1] ?? pendingAdmonition;
      if (HARDBREAKS_OPTION.test(trimmed)) blockHardBreaks = true;
      continue;
    }

    // Document attributes (`:toc:`, `:author: X`) and line comments are metadata.
    if (DOC_ATTRIBUTE.test(trimmed) || trimmed.startsWith("//")) {
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

    // An attribute describes the block right below it, not one further on.
    if (bare) {
      pendingLanguage = null;
      pendingAdmonition = null;
    }
    // A block option lapses at the blank line that ends its block.
    else blockHardBreaks = false;

    // ` +` ends the line here, whatever follows.
    const lineBreak = LINE_BREAK.test(trimmed);
    const converted = block(lineBreak ? trimmed.replace(LINE_BREAK, "") : line, resolve);
    // Two trailing spaces: markdown's hard break, only where a line follows.
    const breakAfter = (lineBreak || docHardBreaks || blockHardBreaks) && converted.trim() && lines[i + 1]?.trim();
    emit(breakAfter ? `${converted}  ` : converted);
  }

  // An unterminated verbatim block still closes, or the whole tail is code.
  if (openFence !== null) emit("```");

  return out.join("\n").replace(/\n+$/, "");
}
