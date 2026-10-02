import { useQuery } from "@tanstack/react-query";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasMywot } from "@/hooks/useHasMywot";
import { isSearchObserverOnRelay } from "@/services/searchObserver";

/**
 * Whether the search relay can rank through the Active Account ("search
 * observer"), by the relay's own verdict. `false` in Anonymous browsing,
 * without an assistant, while loading, or on error. `useCanSearchMywot` stands
 * the Account's last confirmed answer in for it while loading, so a reload
 * doesn't search through the house first; a first visit still waits for the
 * relay to confirm.
 */
export function useIsSearchObserver(): { isSearchObserver: boolean; isLoading: boolean; known: boolean } {
  const pubkey = useActiveAccountDisplay()?.pubkey;
  const mywot = useHasMywot();
  const enabled = !!pubkey && !!mywot.taPubkey;
  const query = useQuery({
    // taPubkey: gaining an assistant must refetch, since without one the query is disabled.
    queryKey: ["search-observer", pubkey, mywot.taPubkey],
    queryFn: () => isSearchObserverOnRelay(pubkey!),
    enabled,
    staleTime: 60_000,
  });

  // No probe without an assistant: until `/user/history` answers, this is loading too.
  if (!enabled)
    return { isSearchObserver: false, isLoading: !!pubkey && mywot.isLoading, known: !!pubkey && mywot.known };
  return {
    isSearchObserver: query.data ?? false,
    isLoading: query.isPending,
    /** The relay has answered — `isSearchObserver` is only a default before that. */
    known: query.isSuccess,
  };
}
