/**
 * Text search, and whether this server observes the search index.
 */

import { authenticatedFetch, fetch, getBrainstormApi } from "./core";

export const searchApi = {
  /**
   * Check whether the logged-in user is allowed to search from their own
   * trust perspective ("search observer"). Requires authentication.
   * Returns the boolean `data` field from `/user/isSearchObserver`.
   */
  async getIsSearchObserver(timeoutMs: number = 15000): Promise<boolean> {
    const response = await authenticatedFetch(
      `${getBrainstormApi()}/user/isSearchObserver`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`Failed to check search observer status (${response.status})`);
    }
    const json = await response.json();
    return json?.data === true;
  },

  /**
   * Free-text profile search via the Brainstorm backend `/search/byText`.
   * When `ownPubkey` is true the search is run from the logged-in user's own
   * trust perspective and the request is authenticated (session token sent);
   * otherwise it runs from NosFabrica's perspective without authentication.
   */
  async searchByText(
    text: string,
    onlyRanked: boolean = true,
    ownPubkey: boolean = false,
    timeoutMs: number = 15000,
    maxHits?: number,
    signal?: AbortSignal,
  ): Promise<{
    code: number;
    message: string | null;
    data: {
      query: string;
      numResults: number;
      results: Array<Record<string, unknown>>;
    };
  }> {
    const params = new URLSearchParams({
      text,
      onlyRanked: String(onlyRanked),
      ownPubkey: String(ownPubkey),
    });
    if (typeof maxHits === "number" && Number.isFinite(maxHits)) {
      params.set("maxHits", String(Math.trunc(maxHits)));
    }
    const url = `${getBrainstormApi()}/search/byText?${params.toString()}`;
    // Combined by hand: AbortSignal.any is missing on older mobile Safari.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = ownPubkey
        ? await authenticatedFetch(url, { signal: controller.signal })
        : await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  },
};
