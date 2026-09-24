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
  const bare = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  // Markdown with some HTML in it (a GitHub comment) is markdown: converting
  // it as HTML would fold its line structure away. stripStrayHtml takes it.
  const mdLines = bare.replace(/<[^>]*>/g, "").split("\n").filter((l) => /^\s{0,3}(?:#{1,6} |[-*+] |\d+\. |> |\|)/.test(l)).length;
  if (mdLines >= 3) return false;
  // HTML the whole way through, not markdown with a few tags in it: most of
  // its lines are markup (or it is one long line of it).
  const lines = bare.split("\n").map((l) => l.trim()).filter(Boolean);
  const tagLines = lines.filter((l) => l.startsWith("<")).length;
  // Opening with a block element (a marketplace's "<p>…") counts too:
  // escaped code inside a <pre> is lines of text that are still HTML.
  const opensWithBlock = /^\s*<(?:p|div|h[1-6]|ul|ol|pre|blockquote|table)\b/i.test(bare);
  if (lines.length > 1 && !opensWithBlock && tagLines / lines.length < 0.5) return false;
  const tags = bare.match(TAG);
  if (!tags || tags.length < 3) return false;
  for (const m of bare.matchAll(BLOCK_OPEN)) {
    if (new RegExp(`</${m[1]}\\s*>`, "i").test(bare)) return true;
  }
  return false;
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
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
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

const COMMENT = /<!--[\s\S]*?-->/g;
// Wrappers whose content is the point: the tag goes, the text stays.
const UNWRAP = /<\/?(?:details|div|span|center|picture|source|font|small|big|u|ins|abbr|section|article|header|footer|main|figure|figcaption|sub|sup)\b[^>]*>/gi;

/**
 * Markdown with some HTML in it — the GitHub habit: `<details>` around a
 * section, `<!-- bot markers -->`, a `<br>`, an `<img>`. The markdown stays
 * markdown; comments go, wrappers unwrap, a summary reads as a bold line,
 * a picture as its URL. Code spans and fences are left exactly as written.
 */
export function stripStrayHtml(text: string): string {
  if (!/<[a-z!/]/i.test(text)) return text;
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part; // code: untouched
      return part
        .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner: string) => {
          // A <pre> is code: its text, entities decoded, fenced.
          const text = typeof DOMParser === "undefined" ? inner : new DOMParser().parseFromString(`<pre>${inner}</pre>`, "text/html").body.textContent || "";
          return `\n\n\`\`\`\n${text.replace(/^\n|\n$/g, "")}\n\`\`\`\n\n`;
        })
        .replace(/<table\b[\s\S]*?<\/table>/gi, (t) =>
          typeof DOMParser === "undefined" ? t : tableToMarkdown(new DOMParser().parseFromString(t, "text/html").querySelector("table")!),
        )
        .replace(COMMENT, "")
        .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi, (_, t: string) => `\n\n**${t.trim()}**\n\n`)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<img\b[^>]*\bsrc=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>/gi, "\n$1\n")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<a\b[^>]*\bhref=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_, u: string, t: string) => (t.trim() && t.trim() !== u ? `[${t.trim()}](${u})` : u))
        .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
        .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, _l: string, t: string) => `\n\n## ${t.trim()}\n\n`)
        .replace(/<kbd\b[^>]*>([\s\S]*?)<\/kbd>/gi, "`$1`")
        .replace(/<\/?(?:strong|b)\b[^>]*>/gi, "**")
        .replace(/<\/?(?:em|i)\b[^>]*>/gi, "*")
        .replace(/<\/?p\b[^>]*>/gi, "\n\n")
        .replace(/<\/tr>/gi, "\n")
        .replace(/<t[dh]\b[^>]*>/gi, " ")
        .replace(/<\/?(?:table|thead|tbody|tfoot|tr|td|th|colgroup|col)\b[^>]*>/gi, "")
        .replace(UNWRAP, "")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("");
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
