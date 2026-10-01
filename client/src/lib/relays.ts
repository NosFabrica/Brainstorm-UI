/**
 * The relay sets the app reads from by default.
 *
 * In `lib/` beside the pool and the store because `lib/loaders.ts` needs them for
 * its lookup relays, and `lib/` may not import up into `services/`.
 */
import { normalizeURL } from "applesauce-core/helpers/url";
import { env } from "./runtimeEnv";

/**
 * Our own relay (SearchOverTrust): it indexes far more of the network than the
 * public relays, so every fallback read asks it too. It refuses a plain read
 * without sign-in, so reads sent to it carry a NIP-50 `search` token
 * (lib/relayPool adds it); it is an index, not a place we publish to.
 */
export const SEARCH_RELAY = normalizeURL(env.VITE_SEARCH_RELAY_URL.trim() || "wss://search.brainstorm.world/");

/** Answers any filter over the whole corpus, unranked — what a fallback lookup wants. */
export const SEARCH_RELAY_READ_TOKEN = "include:spam";

/** Where profiles and other replaceable metadata are looked for. */
export const PROFILE_RELAYS = [
  "wss://relay.damus.io/",
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://purplepag.es/",
  "wss://nostr.wine/",
  SEARCH_RELAY,
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
  SEARCH_RELAY,
];
