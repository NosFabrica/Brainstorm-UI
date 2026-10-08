import { useEffect, useMemo } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";
import { accountManager } from "@/accounts";
import { getMetadata, updateMetadata, type BrainstormAccount } from "@/accounts/metadata";

// Anonymous visitors search from the NosFabrica ("house") POV.
export const ANON_POV = "nosfabrica" as const;

/**
 * The perspective a search runs from — one rule for the results page and every box that
 * suggests people. Logged-in users search from their active perspective; "My WoT" falls back
 * to the house view unless the user both has a personalized graph (hasMywot) and is permitted
 * to be their own search observer (isSearchObserver). Anonymous visitors always use the house.
 *
 * Both answers come from the API, which a reload asks again. Until each has answered, the
 * Account's last-known answer (`canSearchMywot`) stands in for it: otherwise every reload
 * searched through the house first, and closed that REQ to search again through My WoT the
 * moment the API caught up.
 */
export function useSearchPov() {
  const user = useActiveAccountDisplay();
  // Read, not subscribed: a switch already re-renders this through `useActiveAccountDisplay`.
  const account = accountManager.active as BrainstormAccount | undefined;
  const [pov, setPov] = useActivePerspective();
  const mywot = useHasMywot();
  const observer = useIsSearchObserver();

  const remembered = account ? getMetadata(account).canSearchMywot === true : false;
  const hasMywot = mywot.known ? mywot.hasMywot : remembered;
  const isSearchObserver = observer.known ? observer.isSearchObserver : remembered;
  const canUseMywot = hasMywot && isSearchObserver;

  // Remembered only once both have answered: one answer alone says nothing about the other.
  const answered = mywot.known && observer.known ? canUseMywot : null;
  useEffect(() => {
    if (!account || answered === null) return;
    if (getMetadata(account).canSearchMywot !== answered) updateMetadata(account, { canSearchMywot: answered });
  }, [account, answered]);

  const effectivePov = useMemo(() => {
    if (!user) return ANON_POV;
    return pov === "mywot" && !canUseMywot ? ANON_POV : pov;
  }, [user, pov, canUseMywot]);
  return { user, pov, setPov, effectivePov, hasMywot, isSearchObserver };
}
