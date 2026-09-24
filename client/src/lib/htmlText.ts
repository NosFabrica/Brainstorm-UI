/**
 * HTML descriptions as the light markdown the reading renderer understands.
 * Some marketplace and bridge clients publish `<p>…</p><pre><code>…` as an
 * event's text; shown raw it is tag soup, stripped it loses its paragraphs.
 *
 * The output is TEXT — it is parsed and rendered as text downstream, never
 * inserted as HTML — so a hostile description can't inject anything.
 */

const TAG = /<\/?(?:p|br|div|ul|ol|li|h[1-6]|pre|code|strong|em|b|i|a|blockquote|span|img)\b[^>]*>/gi;

const BLOCK_OPEN = /<(p|div|ul|ol|li|h[1-6]|pre|blockquote)\b[^>]*>/gi;

/**
 * Enough real markup that this is HTML, not prose or markdown that talks
 * about tags: tags inside `code` or fences don't count, and at least one
 * block element must be opened and closed.
 */
export function looksLikeHtml(text: string): boolean {
  if (typeof DOMParser === "undefined") return false;
  const bare = text.replace(/(```|~~~)[\s\S]*?\1/g, "").replace(/`[^`\n]*`/g, "");
  // What a <pre> holds is code, not the document's own structure.
  const outsidePre = withoutPre(bare);
  // Markdown with some HTML in it (a GitHub comment) is markdown: converting
  // it as HTML would fold its line structure away. stripStrayHtml takes it.
  const mdLines = outsidePre.replace(/<[^>]*>/g, "").split("\n").filter((l) => /^\s{0,3}(?:#{1,6} |[-*+] |\d+\. |> |\|)/.test(l)).length;
  if (mdLines >= 3) return false;
  // HTML the whole way through, not markdown with a few tags in it: most of
  // its lines carry markup (or it is one long line of it).
  const lines = outsidePre.split("\n").map((l) => l.trim()).filter(Boolean);
  const tagLines = lines.filter((l) => /<\/?[a-z][^>]*>/i.test(l)).length;
  // Opening with a block element (a marketplace's "<p>…") counts too:
  // escaped code inside a <pre> is lines of text that are still HTML.
  const opensWithBlock = /^\s*<(?:p|div|h[1-6]|ul|ol|pre|blockquote|table)\b/i.test(bare);
  if (lines.length > 1 && !opensWithBlock && tagLines / lines.length < 0.5) return false;
  const tags = bare.match(TAG);
  if (!tags || tags.length < 3) return false;
  // One pass for the closers, not a scan of the whole text per opener.
  const closed = new Set(Array.from(bare.matchAll(/<\/([a-z][a-z0-9]*)\s*>/gi), (m) => m[1].toLowerCase()));
  for (const m of bare.matchAll(BLOCK_OPEN)) {
    if (closed.has(m[1].toLowerCase())) return true;
  }
  return false;
}

/** The text with its <pre>…</pre> spans cut out, in one pass: an unclosed
 *  <pre> runs to the end, as in HTML. */
function withoutPre(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  let at = 0;
  const open = /<pre\b/gi;
  for (;;) {
    open.lastIndex = at;
    const m = open.exec(text);
    if (!m) return out + text.slice(at);
    out += text.slice(at, m.index);
    const close = lower.indexOf("</pre>", m.index);
    if (close < 0) return out;
    at = close + 6;
  }
}

/** A cell's words: footnote markers and citation fragments (a Wikipedia
 *  mirror's `<ref>{{cite web`) dropped, pipes escaped for the markdown row. */
function cellText(cell: Element): string {
  const c = cell.cloneNode(true) as Element;
  c.querySelectorAll("a.footnote-ref, sup, ref").forEach((n) => n.remove());
  c.querySelectorAll("br").forEach((n) => n.replaceWith(" "));
  return (c.textContent || "").replace(/\{\{[\s\S]*$/, "").replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

/** An HTML table as a GFM table (with its caption as a bold line above) —
 *  both readers draw GFM tables; neither draws raw HTML. */
function tableToMarkdown(table: Element): string {
  // The table's own rows: a table nested in a cell is that cell's text.
  const own = (table as HTMLTableElement).rows ?? table.querySelectorAll("tr");
  const rows = Array.from(own).map((tr) =>
    Array.from(tr.children).filter((c) => /^t[dh]$/i.test(c.tagName)).map(cellText),
  ).filter((r) => r.length);
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const row = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill("")].join(" | ")} |`;
  const caption = table.querySelector("caption")?.textContent?.replace(/\s+/g, " ").trim();
  const [head, ...body] = rows;
  return `\n\n${caption ? `**${caption}**\n\n` : ""}${row(head)}\n|${" --- |".repeat(width)}\n${body.map(row).join("\n")}\n\n`;
}

function walk(node: Node, inPre: boolean, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent || "";
    return inPre ? t : t.replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inner = (d = depth) => Array.from(el.childNodes).map((c) => walk(c, inPre || tag === "pre", d)).join("");
  switch (tag) {
    case "script":
    case "style":
      return "";
    case "table":
      return tableToMarkdown(el);
    case "br":
      return "\n";
    case "img": {
      // A picture keeps its place as its URL on a line of its own — the
      // readers show a bare image URL as the image.
      const src = el.getAttribute("src") || "";
      return /^https?:\/\//i.test(src) ? `\n\n${src}\n\n` : "";
    }
    case "summary":
      return `\n\n**${inner().trim()}**\n\n`;
    case "dt":
      return `\n\n**${inner().trim()}**`;
    case "dd":
      return `\n${inner().trim()}`;
    case "hr":
      return "\n\n---\n\n";
    case "p":
    case "div":
      return `\n\n${inner().trim()}\n\n`;
    case "blockquote":
      return `\n\n${inner().trim().split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `\n\n## ${inner().trim()}\n\n`;
    case "ul":
    case "ol": {
      // Items numbered for <ol>; a nested list indents under its item, which
      // the reader keeps as part of that item.
      const indent = "  ".repeat(depth);
      let n = Number(el.getAttribute("start")) || 1;
      const items = Array.from(el.children)
        .filter((c) => c.tagName.toLowerCase() === "li")
        .map((li) => {
          const body = Array.from(li.childNodes).map((c) => walk(c, inPre, depth + 1)).join("").trim();
          return `${indent}${tag === "ol" ? `${n++}.` : "-"} ${body}`;
        });
      return depth ? `\n${items.join("\n")}` : `\n\n${items.join("\n")}\n\n`;
    }
    case "li":
      return `\n- ${inner().trim()}`;
    case "pre":
      return `\n\n\`\`\`\n${(el.textContent || "").replace(/\n$/, "")}\n\`\`\`\n\n`;
    case "code":
      return inPre ? inner() : `\`${inner()}\``;
    case "strong":
    case "b":
      return `**${inner().trim()}**`;
    case "em":
    case "i":
      return `*${inner().trim()}*`;
    case "a": {
      const href = el.getAttribute("href") || "";
      const text = inner().trim();
      if (!/^https?:\/\//i.test(href)) return text;
      return !text || text === href ? href : `[${text}](${href})`;
    }
    default:
      return inner();
  }
}

/** Comments out, in one pass: an unclosed "<!--" runs to the end, as in HTML. */
function stripComments(text: string): string {
  let out = "";
  let at = 0;
  for (;;) {
    const open = text.indexOf("<!--", at);
    if (open < 0) return out + text.slice(at);
    out += text.slice(at, open);
    const close = text.indexOf("-->", open + 4);
    if (close < 0) return out;
    at = close + 3;
  }
}
// Wrappers whose content is the point: the tag goes, the text stays.
const UNWRAP = /<\/?(?:details|div|span|center|picture|source|font|small|big|u|ins|abbr|section|article|header|footer|main|figure|figcaption|sub|sup|del|s|strike|mark|dl|dt|dd|colgroup|col|tbody|thead|tfoot)\b[^>]*>/gi;
/** Real HTML in markdown, not prose that names a tag ("use the <br> tag"):
 *  a comment, a <details>, a picture, or an element that is closed. */
const REAL_HTML = /<!--|<summary\b|<img\b[^>]*\bsrc=|<\/(?:p|div|span|a|b|strong|em|i|u|ul|ol|li|table|tr|td|th|h[1-6]|pre|code|blockquote|kbd|sub|sup|center|font|small|del|s|dl|dt|dd|summary|details)\s*>/i;
/** Elements with structure worth parsing whole: nesting counted, then read
 *  by the same converter full-HTML articles get. */
const BLOCK_TAG = /<(\/?)(table|pre|ul|ol|blockquote|dl)\b[^>]*>/gi;

/** The markdown's own code — ``` and ~~~ fences, indented blocks — as
 *  alternating [prose, code, prose, …] pieces, code left as written. */
function splitMarkdownCode(text: string): string[] {
  const out: string[] = [""];
  const lines = text.split("\n");
  let fence: string | null = null;
  let inIndented = false;
  let prevBlank = true;
  const push = (code: boolean, line: string) => {
    const isCode = out.length % 2 === 0;
    if (code !== isCode) out.push("");
    out[out.length - 1] += (out[out.length - 1] ? "\n" : "") + line;
  };
  for (const line of lines) {
    if (fence) {
      push(true, line);
      if (line.trim().startsWith(fence)) fence = null;
    } else if (/^\s{0,3}(```|~~~)/.test(line)) {
      fence = line.trim().slice(0, 3);
      push(true, line);
    } else if (/^(?: {4}|\t)/.test(line) && (prevBlank || inIndented)) {
      inIndented = true;
      push(true, line);
    } else {
      if (line.trim()) inIndented = false;
      push(inIndented && !line.trim(), line);
    }
    prevBlank = !line.trim();
  }
  return out;
}

/** Each outermost balanced `<tag>…</tag>` of a structured element, replaced. */
function replaceBlocks(text: string, fn: (html: string) => string): string {
  let out = "";
  let depth = 0;
  let start = -1;
  let last = 0;
  for (const m of text.matchAll(BLOCK_TAG)) {
    const at = m.index ?? 0;
    if (!m[1]) {
      if (depth === 0) start = at;
      depth++;
    } else if (depth > 0 && --depth === 0) {
      const end = at + m[0].length;
      out += text.slice(last, start) + fn(text.slice(start, end));
      last = end;
    }
  }
  return out + text.slice(last);
}

/** Inline tags in a run of prose. A row of a markdown table stays one line:
 *  its <br> is a space and its picture sits in the cell. */
function inlineTags(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const row = line.trimStart().startsWith("|");
      return line
        .replace(/<br\s*\/?>/gi, row ? " " : "\n")
        .replace(/<img\b[^>]*\bsrc=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>/gi, row ? " $1 " : "\n$1\n")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<a\b[^>]*\bhref=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>([^<]{0,500}?)<\/a>/gi, (_, u: string, t: string) => (t.trim() && t.trim() !== u ? `[${t.trim()}](${u})` : u))
        .replace(/<a\b[^>]*>([^<]{0,500}?)<\/a>/gi, "$1")
        .replace(/<(code|kbd)\b[^>]*>([^<]{0,500}?)<\/\1>/gi, "`$2`")
        .replace(/<hr\s*\/?>/gi, row ? "" : "\n\n---\n\n")
        .replace(/<\/?(?:strong|b)\b[^>]*>/gi, "**")
        .replace(/<\/?(?:em|i)\b[^>]*>/gi, "*");
    })
    .join("\n")
    .replace(/<summary\b[^>]*>([\s\S]{0,500}?)<\/summary>/gi, (_, t: string) => `\n\n**${t.trim()}**\n\n`)
    .replace(/<h([1-6])\b[^>]*>([\s\S]{0,500}?)<\/h\1>/gi, (_, _l: string, t: string) => `\n\n## ${t.trim()}\n\n`)
    .replace(/<\/?p\b[^>]*>/gi, "\n\n")
    .replace(/<\/?li\b[^>]*>/gi, (t) => (t[1] === "/" ? "" : "\n- "))
    .replace(/<\/?(?:table|tr|td|th|caption)\b[^>]*>/gi, " ")
    .replace(UNWRAP, "");
}

/**
 * Markdown with some HTML in it — the GitHub habit: `<details>` around a
 * section, `<!-- bot markers -->`, a `<br>`, an `<img>`, a table. The
 * markdown stays markdown; comments go, structured elements (tables, lists,
 * <pre>, quotes) are converted as HTML, inline tags become their markdown,
 * wrappers unwrap. The markdown's own code — fences, indented blocks, code
 * spans — is left exactly as written. Prose that merely names a tag is not
 * HTML and is not touched.
 */
export function stripStrayHtml(text: string): string {
  if (!REAL_HTML.test(text)) return text;
  const parsing = typeof DOMParser !== "undefined";
  return splitMarkdownCode(text)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let t = stripComments(part);
      if (parsing) t = replaceBlocks(t, (html) => `\n\n${htmlToText(html)}\n\n`);
      return t
        .split(/(`[^`\n]*`)/)
        .map((piece, k) => (k % 2 === 1 ? piece : inlineTags(piece)))
        .join("")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("\n")
    .replace(/^\n/, text.startsWith("\n") ? "\n" : "");
}

/** Whatever markup an event's text arrived in, as the light markdown the
 *  readers take: HTML converted, stray HTML in markdown cleaned. */
export function normalizeMarkup(text: string): string {
  if (!text) return text;
  return looksLikeHtml(text) ? htmlToText(text) : stripStrayHtml(text);
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return walk(doc.body, false)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
