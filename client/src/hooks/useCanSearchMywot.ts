import { useEffect } from "react";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";
import { accountManager } from "@/accounts";
import { getMetadata, updateMetadata, type BrainstormAccount } from "@/accounts/metadata";

/**
 * May the active Account read through its own web of trust: it has a personalized graph
 * (`/user/history`) AND is permitted to be its own search observer (`/user/isSearchObserver`).
 * The one rule behind every "My WoT or the house?" choice — search, threads, profile pages.
 *
 * Both are API answers a reload asks again. While each is still LOADING, the Account's last
 * confirmed answer (`canSearchMywot`) stands in for it: otherwise every reload read through the
 * house first and then again through the user's own lens once the API caught up — a wasted
 * REQ and a flash of the wrong ranking. Only while loading: with no Session (nothing will be
 * asked) or after a failed ask, the answer is "no", as it always was.
 */
export function useCanSearchMywot(): { hasMywot: boolean; isSearchObserver: boolean; canUseMywot: boolean } {
  // Read, not subscribed: an Account switch re-renders through the two queries' own keys.
  const account = accountManager.active as BrainstormAccount | undefined;
  const mywot = useHasMywot();
  const observer = useIsSearchObserver();

  const remembered = account ? getMetadata(account).canSearchMywot === true : false;
  const hasMywot = mywot.isLoading ? remembered : mywot.hasMywot;
  const isSearchObserver = observer.isLoading ? remembered : observer.isSearchObserver;
  const canUseMywot = hasMywot && isSearchObserver;

  // Remembered only once both have answered: one answer alone says nothing about the other.
  const answered = mywot.known && observer.known ? canUseMywot : null;
  useEffect(() => {
    if (!account || answered === null) return;
    if (getMetadata(account).canSearchMywot !== answered) updateMetadata(account, { canSearchMywot: answered });
  }, [account, answered]);

  return { hasMywot, isSearchObserver, canUseMywot };
}
