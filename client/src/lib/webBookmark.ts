/**
 * A NIP-B0 web bookmark (kind 39701): a link someone saved, with their words.
 * The page is the `d` tag — the URL without its scheme ("alice.blog/post") —
 * the name is the `title` tag and the description is the content. It is one
 * link, not a list: drawn as a link row, never as a list card with "0 items".
 */
type EventLike = { kind: number; tags: string[][]; content: string };

export const WEB_BOOKMARK_KIND = 39701;

export interface WebBookmark {
  /** The page, with a scheme: `https://` when the `d` tag left it out, as NIP-B0 asks. */
  url: string;
  /** The site, for the source line: "alice.blog". */
  host: string;
  title: string | null;
  description: string;
  topics: string[];
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function webBookmarkOf(ev: EventLike): WebBookmark | null {
  if (ev.kind !== WEB_BOOKMARK_KIND) return null;
  const d = ev.tags.find((t) => t[0] === "d")?.[1]?.trim();
  if (!d) return null;
  const url = SCHEME.test(d) ? d : `https://${d}`;
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    host = parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host) return null;
  return {
    url,
    host,
    title: ev.tags.find((t) => t[0] === "title")?.[1]?.trim() || null,
    description: ev.content.trim(),
    topics: [
      ...new Set(
        ev.tags
          .filter((t) => t[0] === "t")
          .map((t) => (t[1] ?? "").trim())
          .filter(Boolean),
      ),
    ],
  };
}
