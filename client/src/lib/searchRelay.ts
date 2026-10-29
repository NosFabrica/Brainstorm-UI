/**
 * The one connection to the SearchOverTrust relay — a lazy singleton over the
 * app's shared pool, so typeahead, full search, and author hydration multiplex
 * their REQs (own subscription ids) on a single socket with applesauce's
 * reconnect handling for free.
 *
 * Lives in lib/ (not services/) for the same layering reason as relayPool:
 * nothing here may import upward.
 */
import { Relay } from "applesauce-relay";
import { pool, warmRelay } from "./relayPool";
import { env } from "./runtimeEnv";
import { watchRelay } from "@/lib/serverStatus";

let cached: Relay | null | undefined;
let unwatch: (() => void) | undefined;

export function searchRelay(): Relay | null {
  // A relay the pool has since dropped (services/relayAuth drops one signed in
  // as an account that may no longer sign) is closed for good; ask again.
  if (cached !== undefined && (cached === null || pool.relays.get(cached.url) === cached)) return cached;
  const url = env.VITE_SEARCH_RELAY_URL.trim();
  if (!url) {
    console.error("[search] VITE_SEARCH_RELAY_URL is not configured — relay search is disabled");
    cached = null;
    return cached;
  }
  cached = pool.relay(url);
  // The server-status store reads this socket's own reconnect signals, so
  // the search page can say it is running behind instead of showing a skeleton.
  unwatch?.();
  unwatch = watchRelay(cached);
  return cached;
}

/**
 * A socket of its own for questions asked beside a search — the results page's tab counts —
 * which the caller closes once they are answered. The relay works each socket's requests as a
 * queue: seventeen COUNTs on the search's socket held the REQ behind them for 2,059ms against
 * ~200ms alone, and on a second socket the same REQ took 326ms (probed 2026-10-22). Outside the
 * pool on purpose: the pool keeps one socket per relay, which is the queue this avoids.
 */
export function openSideSearchRelay(): Relay | null {
  const url = env.VITE_SEARCH_RELAY_URL.trim();
  return url ? new Relay(url) : null;
}

/**
 * Open the search socket before the first keystroke — a reader who focuses
 * the box is about to search, and the handshake then overlaps their typing
 * instead of sitting in front of the first suggestion.
 */
export function warmSearchRelay(): void {
  const relay = searchRelay();
  if (relay) warmRelay(relay);
}
