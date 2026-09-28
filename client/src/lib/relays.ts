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
