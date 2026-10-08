import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { useHasSession } from "@/hooks/useHasSession";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";

/**
 * Whether the logged-in user is allowed to run search from their own trust
 * perspective ("search observer"), backed by `GET /user/isSearchObserver`.
 *
 * Defaults to `false` (house / NosFabrica perspective) when logged out, while
 * loading, or on error. `useSearchPov` stands the Account's last confirmed
 * answer in for it until `known`, so a reload doesn't search through the house
 * first; a first visit still waits for the backend to confirm. Gated on `useHasSession()` so it never
 * fires for anonymous visitors (that path goes through `authenticatedFetch`,
 * which can 401-redirect public pages).
 */
export function useIsSearchObserver(): { isSearchObserver: boolean; isLoading: boolean; known: boolean } {
  const hasSession = useHasSession();
  const pubkey = useActiveAccountDisplay()?.pubkey;
  const query = useQuery({
    // Per Account: another Account's answer must not read as this one's after a switch.
    queryKey: ["/user/isSearchObserver", pubkey],
    queryFn: () => apiClient.getIsSearchObserver(),
    enabled: hasSession,
    staleTime: 60_000,
  });

  return {
    isSearchObserver: query.data ?? false,
    isLoading: hasSession && query.isPending,
    /** The backend has answered — `isSearchObserver` is only a default before that. */
    known: query.isSuccess,
  };
}
