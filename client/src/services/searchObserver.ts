import { getBrainstormApi } from "@/services/api/core";

const TIMEOUT_MS = 5000;

/**
 * A lone NIP-50 extension: the relay still decides readiness (the lens comes first), then has no
 * text to match, so no index search runs. ORE-05 refuses an empty query.
 */
const PROBE_QUERY = "include:spam";

/**
 * Whether the search relay can rank through `pubkey`, by its own rule, asked through our API's
 * ORE-05 proxy: unauthenticated, and unobserved (the global fetch, not the API folder's), so a
 * failing probe never feeds the server-down detector. `relevance-pov` answers 200 only when the
 * user's 10040 names a rank service with a projected, ranked card. 202 (still mirroring), 422
 * (cannot) and any error are all "not available".
 */
export async function isSearchObserverOnRelay(pubkey: string): Promise<boolean> {
  const api = getBrainstormApi();
  if (!api) return false;
  try {
    const res = await globalThis.fetch(`${api}/search/pubkeys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: PROBE_QUERY, algorithm: "relevance-pov", pov: pubkey, limit: 1 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
