import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";
import { isSearchObserverOnRelay } from "@/services/searchObserver";

/**
 * Whether the search relay can rank through the Active Account ("search
 * observer"): a profile comes back through its lens. `false` in Anonymous browsing,
 * without an assistant, while loading, or on error. `useCanSearchMywot` stands
 * the Account's last confirmed answer in for it while loading, so a reload
 * doesn't search through the house first; a first visit still waits for the
 * relay to confirm.
 *
 * A "yes" holds for the session (ranks don't vanish on their own); a "no" is re-asked every
 * minute, so My-WoT turns on as the relay finishes projecting. A changed or removed 10040
 * re-asks at once.
 */
const NOT_YET_MS = 60_000;

export function useIsSearchObserver(): { isSearchObserver: boolean; isLoading: boolean; known: boolean } {
  const pubkey = useActiveAccountDisplay()?.pubkey;
  const mywot = useHasMywot();
  const enabled = !!pubkey && !!mywot.taPubkey;
  const query = useQuery({
    // taPubkey: gaining an assistant must refetch, since without one the query is disabled.
    queryKey: ["search-observer", pubkey, mywot.taPubkey],
    // eslint-disable-next-line no-restricted-syntax -- relay probe
    queryFn: () => isSearchObserverOnRelay(pubkey!),
    enabled,
    staleTime: (q) => (q.state.data === true ? Infinity : NOT_YET_MS),
    refetchInterval: (q) => (q.state.data === true ? false : NOT_YET_MS),
  });

  // Only a change from a known list: a first list arriving is covered by the "no" polling.
  const queryClient = useQueryClient();
  const listId = useTrustProviderList(enabled ? pubkey : null).event?.id;
  const lastListId = useRef(listId);
  useEffect(() => {
    if (lastListId.current && lastListId.current !== listId)
      void queryClient.invalidateQueries({ queryKey: ["search-observer", pubkey] });
    lastListId.current = listId;
  }, [listId, pubkey, queryClient]);

  // No check without an assistant: until `/user/history` answers, this is loading too.
  if (!enabled)
    return { isSearchObserver: false, isLoading: !!pubkey && mywot.isLoading, known: !!pubkey && mywot.known };
  return {
    isSearchObserver: query.data === true,
    isLoading: query.isPending,
    /** The relay has answered — `isSearchObserver` is only a default before that. */
    known: query.isSuccess,
  };
}
