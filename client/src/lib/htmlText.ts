/**
 * HTML descriptions as the light markdown the reading renderer understands.
 * Some marketplace and bridge clients publish `<p>…</p><pre><code>…` as an
 * event's text; shown raw it is tag soup, stripped it loses its paragraphs.
 *
 * The output is TEXT — it is parsed and rendered as text downstream, never
 * inserted as HTML — so a hostile description can't inject anything.
 */

const TAG = /<\/?(?:p|br|div|ul|ol|li|h[1-6]|pre|code|strong|em|b|i|a|blockquote|span)\b[^>]*>/gi;

/** Enough real tags that this is HTML, not prose that mentions a `<p>`. */
export function looksLikeHtml(text: string): boolean {
  if (typeof DOMParser === "undefined") return false;
  const tags = text.match(TAG);
  return !!tags && tags.length >= 3 && tags.some((t) => t.startsWith("</"));
}

function walk(node: Node, inPre: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent || "";
    return inPre ? t : t.replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inner = () => Array.from(el.childNodes).map((c) => walk(c, inPre || tag === "pre")).join("");
  switch (tag) {
    case "script":
    case "style":
      return "";
    case "br":
      return "\n";
    case "p":
    case "div":
    case "blockquote":
      return `\n\n${inner().trim()}\n\n`;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `\n\n## ${inner().trim()}\n\n`;
    case "ul":
    case "ol":
      return `\n\n${inner()}\n\n`;
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

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return walk(doc.body, false)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
