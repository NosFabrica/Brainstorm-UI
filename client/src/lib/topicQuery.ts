// A search query starting with `#` is a *topic* (hashtag) search — it resolves
// to the trust-ranked content feed at `/t/<tag>`, not a profile search. This is
// the single source of truth for detecting + normalizing that, shared by the
// landing search box and the public-page HeaderSearchBox so they behave
// identically.
import { isClassicVinesTopic } from "@/lib/mediaFacet";

export function parseTopicQuery(query: string): { isTopic: boolean; tag: string } {
  const q = query.trim();
  // ONE hashtag and nothing else. `#nostr from:npub…` or `#nostr bitcoin` is a search that
  // happens to carry a tag filter, and the box's grammar handles it — routing it here used to
  // squash the whole query into one tag ("#nostr bitcoin" → /t/nostrbitcoin).
  if (!/^#\S+$/.test(q)) return { isTopic: false, tag: "" };
  // The one hashtag that is not a topic. Restored Vines carry `vine-archive` as a label, not
  // as a `t`, so its topic page (which also drops the hyphen) had nothing to show. It stays a
  // search, and the results page opens it on Media with Classic Vines chosen.
  if (isClassicVinesTopic(q)) return { isTopic: false, tag: "" };
  const tag = q
    .slice(1)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return { isTopic: true, tag };
}

/** Destination path for a normalized topic tag. */
export function topicPath(tag: string): string {
  return `/t/${encodeURIComponent(tag)}`;
}
