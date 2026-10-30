/**
 * AsciiDoc → markdown, for NKBIP-01 publication sections (kind 30041). The
 * reader speaks markdown, so a section's body is translated first rather
 * than shipping an AsciiDoc engine. A port of Amethyst's converter
 * (quartz `AsciiDocToMarkdown`), which was measured against the sections on
 * the public relays.
 *
 * It handles what prose actually uses: headings, lists, emphasis, links,
 * images, source and literal blocks, quotes, admonitions, hard breaks.
 * Tables, includes, conditionals and attribute substitution are not handled,
 * and anything not recognized passes through as the plain text it already
 * was — never mangled.
 *
 * Literal blocks are copied verbatim: a code sample's `*stars*` and
 * `[[brackets]]` survive.
 *
 * wiki.ts keeps its own lighter translation for NIP-54 pages, which are
 * sniffed for AsciiDoc first; a section is AsciiDoc by its kind.
 */

const QUOTE_DELIMITER = "____";

const HEADING = /^(={1,6})\s+(\S.*)$/;
const UNORDERED_ITEM = /^(\*{1,5})\s+(\S.*)$/;
const ORDERED_ITEM = /^(\.{1,5})\s+(\S.*)$/;
const ADMONITION = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s+(\S.*)$/;
const BLOCK_ATTRIBUTE = /^\s*\[[^\]]*]\s*$/;
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

/** Maps a `[[target]]` to a link, or null to leave its label as plain text. */
export type WikilinkResolver = (target: string) => string | null;

const noLinks: WikilinkResolver = () => null;

function verbatimDelimiterOf(line: string): string | null {
  const t = line.trim();
  return t === "----" || t === "...." || t === "++++" ? t : null;
}

/** Inline markup. Order matters: link macros before emphasis, so labels survive. */
function inline(text: string, resolve: WikilinkResolver): string {
  return (
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
      })
      // AsciiDoc bold is *x* and italic _x_; markdown's are **x** and *x*. Bold
      // first, and the italic pass never matches `*`, so bold isn't re-read.
      .replace(BOLD, (_m, s: string) => `**${s}**`)
      .replace(ITALIC, (_m, s: string) => `*${s}*`)
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
  if (m) return `${"  ".repeat(m[1].length - 1)}- ${inline(m[2], resolve)}`;
  m = ORDERED_ITEM.exec(body);
  if (m) return `${"  ".repeat(m[1].length - 1)}1. ${inline(m[2], resolve)}`;
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Inside a verbatim block: copy until its delimiter, rewriting nothing.
    if (openFence !== null) {
      if (trimmed.trim() === openFence) {
        out.push("```");
        openFence = null;
      } else out.push(line);
      continue;
    }

    const delimiter = verbatimDelimiterOf(trimmed);
    if (delimiter) {
      out.push("```" + (pendingLanguage ?? ""));
      pendingLanguage = null;
      openFence = delimiter;
      continue;
    }

    // `[source,kotlin]`, `[quote]`, `[NOTE]`: attribute lines carry no text.
    if (BLOCK_ATTRIBUTE.test(trimmed)) {
      pendingLanguage = SOURCE_ATTRIBUTE.exec(trimmed.trim())?.[1].trim() || pendingLanguage;
      if (HARDBREAKS_OPTION.test(trimmed)) blockHardBreaks = true;
      continue;
    }

    // Document attributes (`:toc:`, `:author: X`) and line comments are metadata.
    if (DOC_ATTRIBUTE.test(trimmed) || trimmed.startsWith("//")) {
      if (HARDBREAKS_ATTRIBUTE.test(trimmed)) docHardBreaks = true;
      continue;
    }

    // A quote block's `____` fences become a blockquote over its lines.
    if (trimmed.trim() === QUOTE_DELIMITER) {
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== QUOTE_DELIMITER) end++;
      for (let q = i + 1; q < end; q++) out.push(`> ${inline(lines[q], resolve)}`);
      out.push("");
      i = end;
      continue;
    }

    // A language describes the block right below it, not one further on.
    if (trimmed.trim()) pendingLanguage = null;
    // A block option lapses at the blank line that ends its block.
    else blockHardBreaks = false;

    const converted = block(line, resolve);
    // Two trailing spaces: markdown's hard break, only where a line follows.
    const breakAfter = (docHardBreaks || blockHardBreaks) && converted.trim() && lines[i + 1]?.trim();
    out.push(breakAfter ? `${converted}  ` : converted);
  }

  // An unterminated verbatim block still closes, or the whole tail is code.
  if (openFence !== null) out.push("```");

  return out.join("\n").replace(/\n+$/, "");
}
