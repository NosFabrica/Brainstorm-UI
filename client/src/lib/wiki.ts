/**
 * NIP-54 wiki articles (kind 30818) are written in AsciiDoc, mostly — the
 * NIP's own default, and what GitCitadel's Wikipedia mirrors use (census of
 * 120 pages, 2026-09-07: "==" headings on 40, *bold* on 44, "* " lists on 27,
 * `https://url[label]` links on 34, `image::` on 19). A fifth are markdown
 * with "#" headings. The reader speaks markdown, so an AsciiDoc page is
 * translated first; a markdown page passes through, wikilinks aside.
 *
 * Wikilinks — `[[topic]]` or `[[topic|label]]` — link one wiki page to
 * another. Read on Brainstorm, a wikilink is a search for that topic's
 * articles here: people stay, and any author's page on the topic can answer,
 * not only the one that happened to be linked.
 */

const ASCIIDOC_SIGNS = /^={1,5} \S|^image::|^\[NOTE\]|link:https?:\/\/|footnote:\[/m;
const MARKDOWN_HEADING = /^#{1,6} \S/m;

/** A page written in AsciiDoc rather than markdown. */
export function looksAsciiDoc(content: string): boolean {
  return ASCIIDOC_SIGNS.test(content) && !MARKDOWN_HEADING.test(content);
}

function wikilinksToMarkdown(content: string): string {
  return content.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_m, target: string, label?: string) => {
    const topic = target.trim();
    const text = (label ?? topic).trim();
    return `[${text}](/?q=${encodeURIComponent(topic)}&t=articles)`;
  });
}

function asciiDocToMarkdown(content: string): string {
  return content
    // footnote:[…] (one level of nested brackets) — a reader's aside, dropped.
    .replace(/footnote:\[(?:[^[\]]|\[[^[\]]*\])*\]/g, "")
    // [NOTE] ==== … ==== — the mirror's source and licence — reads as a quote.
    .replace(/^\[(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n====\n([\s\S]*?)\n====/gm, (_m, body: string) =>
      body.split("\n").map((line) => `> ${line}`).join("\n"))
    // "== Heading" → "## Heading" (one "=" is the document title → "#").
    .replace(/^(={1,5}) (\S)/gm, (_m, eq: string, first: string) => `${"#".repeat(eq.length)} ${first}`)
    // *bold* → **bold**; a "* " at the start of a line is a list bullet, not bold.
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, (_m, before: string, text: string) => `${before}**${text}**`)
    // image::url[alt] → ![alt](url)
    .replace(/^image::(\S+?)\[([^\]]*)\]/gm, (_m, url: string, alt: string) => `![${alt}](${url})`)
    // link:url[label] and url[label] → [label](url); a bare URL is left alone.
    .replace(/(?:link:)?(https?:\/\/[^\s\[\]]+)\[([^\]]+)\]/g, (_m, url: string, label: string) => `[${label}](${url})`);
}

export function wikiToMarkdown(content: string): string {
  return wikilinksToMarkdown(looksAsciiDoc(content) ? asciiDocToMarkdown(content) : content);
}

/**
 * A page's words, for a search row or a card's brief: links read as their
 * labels, headings, images, list bullets and the source note are gone, and
 * the paragraphs run on as one line. Works from the markdown form, so an
 * AsciiDoc page and a markdown page come out the same.
 */
export function wikiPlainText(content: string): string {
  return wikiToMarkdown(content)
    .split("\n")
    .filter((line) => !/^\s*(?:#{1,6} |> |!\[)/.test(line))
    .map((line) => line.replace(/^\s*(?:[*\-+]|\d+\.) /, ""))
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w*])\*([^*]+)\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w_])_([^_]+)_(?![\w_])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The line under an article's title on a card. A long-form article says it
 * in its summary tag; a wiki page has none, so its opening words stand in.
 */
export function articleBrief(event: { kind: number; content: string; tags: string[][] }, max = 220): string {
  const summary = event.tags.find((t) => t[0] === "summary")?.[1];
  if (summary) return summary;
  if (event.kind !== 30818) return "";
  const words = wikiPlainText(event.content);
  return words.length > max ? `${words.slice(0, max).replace(/\s+\S*$/, "")}…` : words;
}
