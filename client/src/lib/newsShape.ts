/**
 * News-shaped note detection for the SERP's news cards.
 *
 * There is no OG unfurl available (CORS forbids fetching a page's meta tags
 * from the browser, and no server proxy exists yet — see RELAY-ASKS) — but
 * the news bots EMBED their own metadata in the note: headline first, the
 * article URL, then a summary. When a note has that shape, the UI can render
 * a real news card — clickable headline, source line, description,
 * thumbnail — with zero extra requests.
 */

export interface NewsShape {
  headline: string;
  url: string;
  domain: string;
  description: string;
  /** First image URL found in the note, if any — the card's thumbnail. */
  imageUrl: string | null;
}

const URL_RE = /https?:\/\/\S+/g;
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?$/i;
const MAX_HEADLINE = 200;
// "check this out <link>" is a share, not a story — a real headline has meat.
const MIN_HEADLINE = 25;

export function parseNewsShape(content: string): NewsShape | null {
  const urls = content.match(URL_RE) ?? [];
  if (urls.length === 0) return null;

  const articleUrl = urls.find((u) => !IMAGE_RE.test(u));
  if (!articleUrl) return null;

  const at = content.indexOf(articleUrl);
  const headline = content.slice(0, at).trim().replace(/\s+/g, " ");
  // A headline is a headline — short, present, before the link. A wall of
  // text or nothing at all means this is a regular post, not news.
  if (headline.length < MIN_HEADLINE || headline.length > MAX_HEADLINE) return null;

  let domain: string;
  try {
    domain = new URL(articleUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const rest = content.slice(at + articleUrl.length);
  const imageUrl = urls.find((u) => u !== articleUrl && IMAGE_RE.test(u)) ?? null;
  // Web URLs leave the summary (the headline carries the link); nostr:
  // mention tokens STAY — the renderer turns them into the person's
  // name + picture, which is the whole point of a mention.
  const description = rest.replace(URL_RE, "").replace(/\s+/g, " ").trim();

  return { headline, url: articleUrl, domain, description, imageUrl };
}
