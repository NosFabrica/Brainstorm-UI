/**
 * Whether this server observes the search index.
 */

import { authenticatedFetch, getBrainstormApi } from "./core";

export const searchApi = {
  /**
   * Check whether the logged-in user is allowed to search from their own
   * trust perspective ("search observer"). Requires authentication.
   * Returns the boolean `data` field from `/user/isSearchObserver`.
   */
  async getIsSearchObserver(timeoutMs: number = 15000): Promise<boolean> {
    const response = await authenticatedFetch(`${getBrainstormApi()}/user/isSearchObserver`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Failed to check search observer status (${response.status})`);
    }
    const json = await response.json();
    return json?.data === true;
  },
};
