/**
 * Whether an event a relay sent is an answer to what was asked. Its own module
 * (not lib/relayPool) so a read helper can check it without importing the pool.
 */
import { matchFilters, type Filter as NostrFilter } from "applesauce-core/helpers/filter";

/**
 * Whether a relay's EVENT answers the filters its REQ sent. A NIP-50 `search`
 * term is the relay's to judge — `matchFilters` ignores it — and the rest
 * (ids, kinds, authors, tags, since/until) must hold. Never throws: a malformed
 * event (no tags, a non-string tag) is simply not an answer.
 */
export function answersFilters(filters: NostrFilter[], event: unknown): boolean {
  try {
    const e = event as { id?: unknown; pubkey?: unknown; kind?: unknown; created_at?: unknown; tags?: unknown };
    if (!e || typeof e.id !== "string" || typeof e.pubkey !== "string") return false;
    if (typeof e.kind !== "number" || typeof e.created_at !== "number" || !Array.isArray(e.tags)) return false;
    return matchFilters(filters, event as Parameters<typeof matchFilters>[1]);
  } catch {
    return false;
  }
}
