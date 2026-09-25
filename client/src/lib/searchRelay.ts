/**
 * The one connection to the SearchOverTrust relay — a lazy singleton over the
 * app's shared pool, so typeahead, full search, and author hydration multiplex
 * their REQs (own subscription ids) on a single socket with applesauce's
 * reconnect handling for free.
 *
 * Lives in lib/ (not services/) for the same layering reason as relayPool:
 * nothing here may import upward.
 */
import type { Relay } from "applesauce-relay";
import { pool } from "./relayPool";
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
    console.error(
      "[search] VITE_SEARCH_RELAY_URL is not configured — relay search is disabled",
    );
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
