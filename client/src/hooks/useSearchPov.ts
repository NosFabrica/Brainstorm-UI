import { useMemo } from "react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useIsSearchObserver } from "@/hooks/useIsSearchObserver";

// Anonymous visitors search from the NosFabrica ("house") POV.
export const ANON_POV = "nosfabrica" as const;

/**
 * The perspective a search runs from — one rule for the results page and every box that
 * suggests people. Logged-in users search from their active perspective; "My WoT" falls back
 * to the house view unless the user both has a personalized graph (hasMywot) and is permitted
 * to be their own search observer (isSearchObserver). Anonymous visitors always use the house.
 */
export function useSearchPov() {
  const user = useActiveAccountDisplay();
  const [pov, setPov] = useActivePerspective();
  const { hasMywot } = useHasMywot();
  const { isSearchObserver } = useIsSearchObserver();
  const canUseMywot = hasMywot && isSearchObserver;
  const effectivePov = useMemo(() => {
    if (!user) return ANON_POV;
    return pov === "mywot" && !canUseMywot ? ANON_POV : pov;
  }, [user, pov, canUseMywot]);
  return { user, pov, setPov, effectivePov, hasMywot, isSearchObserver };
}
