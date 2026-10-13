/**
 * NIP-73 external content ids — what a NIP-22 comment's `I`/`i` scope names
 * when the thing it is about lives off Nostr: a web page, a book, a podcast
 * episode, a place. A URL is a link; the rest are labelled text, with a link
 * where the id has an obvious public home.
 */
export interface ExternalRef {
  /** What kind of thing it is: "Web page", "Book", "Podcast episode"… */
  label: string;
  /** The id as a reader would say it: the URL, "978-…", "#bitcoin". */
  text: string;
  /** Where to open it, when it has an obvious public address. */
  href?: string;
}

const PREFIXES: [prefix: string, label: string, href?: (rest: string) => string][] = [
  ["isbn:", "Book"],
  ["isan:", "Film"],
  ["doi:", "Paper", (rest) => `https://doi.org/${rest}`],
  ["podcast:item:guid:", "Podcast episode"],
  ["podcast:publisher:guid:", "Podcast publisher"],
  ["podcast:guid:", "Podcast"],
  ["geo:", "Place"],
  ["iso3166:", "Country"],
  ["bitcoin:tx:", "Bitcoin transaction", (rest) => `https://mempool.space/tx/${rest}`],
  ["bitcoin:address:", "Bitcoin address", (rest) => `https://mempool.space/address/${rest}`],
  ["ethereum:", "Ethereum"],
];

/** Read a NIP-73 id. Null for an empty one. */
export function externalRef(value: string | undefined): ExternalRef | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return { label: "Web page", text: v, href: v };
  if (/^wss?:\/\//i.test(v)) return { label: "Relay", text: v };
  if (v.startsWith("#")) return { label: "Hashtag", text: v };
  const lower = v.toLowerCase();
  for (const [prefix, label, href] of PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = v.slice(prefix.length);
      return { label, text: rest || v, href: href && rest ? href(rest) : undefined };
    }
  }
  return { label: "External", text: v };
}

/**
 * An id as a title says it — "Score for …": a page by its host and path, a
 * relay by its host, a hashtag as written, a book as "Book 978-…".
 */
export function identifierName(value: string | undefined): string | null {
  const ref = externalRef(value);
  if (!ref) return null;
  if (ref.label === "Web page" || ref.label === "Relay") {
    try {
      const url = new URL(ref.text);
      if (ref.label === "Relay") return `relay ${url.host}`;
      const path = url.pathname === "/" ? "" : url.pathname;
      return `${url.host}${path}`;
    } catch {
      return ref.text;
    }
  }
  if (ref.label === "Hashtag" || ref.label === "External") return ref.text;
  return `${ref.label} ${ref.text}`;
}
