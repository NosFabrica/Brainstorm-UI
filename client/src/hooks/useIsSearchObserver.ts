import { useQuery } from "@tanstack/react-query";
import { apiClient, hasSessionToken } from "@/services/api";

/**
 * Whether the logged-in user is allowed to run search from their own trust
 * perspective ("search observer"), backed by `GET /user/isSearchObserver`.
 *
 * Defaults to `false` (house / NosFabrica perspective) when logged out, while
 * loading, or on error — so personalized search is only ever enabled once the
 * backend explicitly confirms it. Gated on `hasSessionToken()` so it never
 * fires for anonymous visitors (that path goes through `authenticatedFetch`,
 * which can 401-redirect public pages).
 */
export function useIsSearchObserver(): { isSearchObserver: boolean; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["/user/isSearchObserver"],
    queryFn: () => apiClient.getIsSearchObserver(),
    enabled: hasSessionToken(),
    staleTime: 60_000,
  });

  return {
    isSearchObserver: query.data ?? false,
    isLoading: hasSessionToken() && query.isPending,
  };
}
