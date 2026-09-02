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

let cached: Relay | null | undefined;

export function searchRelay(): Relay | null {
  if (cached !== undefined) return cached;
  const url = env.VITE_SEARCH_RELAY_URL.trim();
  if (!url) {
    console.error(
      "[search] VITE_SEARCH_RELAY_URL is not configured — relay search is disabled",
    );
    cached = null;
    return cached;
  }
  cached = pool.relay(url);
  return cached;
}
