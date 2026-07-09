// A search query starting with `#` is a *topic* (hashtag) search — it resolves
// to the trust-ranked content feed at `/t/<tag>`, not a profile search. This is
// the single source of truth for detecting + normalizing that, shared by the
// landing search box and the public-page HeaderSearchBox so they behave
// identically.

export function parseTopicQuery(query: string): { isTopic: boolean; tag: string } {
  const q = query.trim();
  if (!q.startsWith("#")) return { isTopic: false, tag: "" };
  const tag = q.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, "");
  return { isTopic: true, tag };
}

/** Destination path for a normalized topic tag. */
export function topicPath(tag: string): string {
  return `/t/${encodeURIComponent(tag)}`;
}
