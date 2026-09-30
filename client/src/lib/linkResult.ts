/**
 * A link result: a note where the link is the point, shown the way a search
 * engine shows a page — source line, the page's title, a description, a
 * picture — rather than as a note that happens to contain a URL.
 *
 * Two shapes qualify. A news-shaped note (headline, link, description — what
 * the feed accounts post; `lib/newsShape`) and a short share: the link at
 * the start or the end with at most a sentence of the sharer's own words.
 * Longer prose with a link in it stays a note: the author's words are the
 * point there, and turning every essay with a citation into a page card
 * would hide them.
 */
import { parseNewsShape } from "./newsShape";
import { parseNoteContent, primaryLink, unwrapMarkdownLinks } from "./noteContent";

export interface LinkResult {
  url: string;
  domain: string;
  /** The note's own headline, when it is news-shaped. */
  headline: string | null;
  /** The sharer's own words, URLs removed; "" for a bare link. */
  words: string;
  /** The note's own picture, if it carries one — the thumbnail before the page's. */
  imageUrl: string | null;
}

/** About a sentence: more than this and the words, not the link, are the post. */
export const MAX_SHARE_WORDS = 140;

const URL_RE = /https?:\/\/\S+/g;
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?$/i;

const domainOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export function linkResultOf(raw: string, opts: { feedAccount?: boolean } = {}): LinkResult | null {
  const news = parseNewsShape(raw, { imageSplitsHeadline: opts.feedAccount });
  // A feed account's headline-link-summary is news whatever its length; a
  // person's is a link result only while their words stay about a sentence.
  if (news && (opts.feedAccount || news.headline.length + news.description.length <= MAX_SHARE_WORDS)) {
    return {
      url: news.url,
      domain: news.domain,
      headline: news.headline,
      words: news.description,
      imageUrl: news.imageUrl,
    };
  }
  const images = new Set<string>();
  const content = unwrapMarkdownLinks(raw, images);
  const url = primaryLink(parseNoteContent(content));
  if (!url) return null;
  const domain = domainOf(url);
  if (!domain) return null;
  const at = content.indexOf(url);
  if (at < 0) return null;
  const isImage = (u: string) => IMAGE_RE.test(u) || images.has(u);
  const strip = (s: string) => s.replace(URL_RE, "").replace(/\s+/g, " ").trim();
  const before = strip(content.slice(0, at));
  const after = strip(content.slice(at + url.length));
  // The link leads or closes the note; words on both sides make it prose.
  if (before && after) return null;
  const words = before || after;
  if (words.length > MAX_SHARE_WORDS) return null;
  const imageUrl = (content.match(URL_RE) ?? []).find(isImage) ?? null;
  return { url, domain, headline: null, words, imageUrl };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Words that only say the title again add nothing. */
function isEcho(words: string, title: string | null): boolean {
  if (!title) return false;
  const w = norm(words),
    t = norm(title);
  return !w || t.includes(w) || w.includes(t);
}

/**
 * What the row shows: the page's title leads (the note's headline until the
 * page answers); the sharer's words describe it when they add something,
 * otherwise the page's description.
 */
export function linkResultText(
  link: LinkResult,
  page: { title: string | null; description: string | null } | null,
): { title: string | null; description: string | null } {
  const title = page?.title || link.headline || null;
  const own = [page?.title && link.headline && !isEcho(link.headline, page.title) ? link.headline : "", link.words]
    .filter(Boolean)
    .join(" ");
  const description = own && !isEcho(own, title) ? own : page?.description || null;
  return { title, description };
}
