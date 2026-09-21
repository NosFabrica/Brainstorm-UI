/**
 * The relay sets the app reads from by default.
 *
 * In `lib/` beside the pool and the store because `lib/loaders.ts` needs them for
 * its lookup relays, and `lib/` may not import up into `services/`.
 */

/** Where profiles and other replaceable metadata are looked for. */
export const PROFILE_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://purplepag.es/",
  "wss://nostr.wine/",
];

/**
 * Relays that actually carry note/article content, dropping purplepag.es, which
 * is profile-only. Used for hashtag / content queries.
 */
export const CONTENT_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://nostr.wine/",
];

/**
 * Relay URLs, each relay once: a trailing slash or a capital letter in the
 * host is the same relay. Publishing to both doubled every publish's
 * connections — and a slow relay's wait with them.
 */
export function uniqueRelays(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    let key: string;
    try {
      const u = new URL(trimmed);
      key = `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    } catch {
      key = trimmed.replace(/\/+$/, "");
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
