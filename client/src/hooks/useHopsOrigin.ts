import { useQuery } from "@tanstack/react-query";
import { useScorePov, type ScorePov } from "@/components/score/TrustScorePov";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { resolveHouseObserver } from "@/services/trustSource";

/**
 * Whose distance are we showing, and is that the perspective the user picked?
 *
 * The one answer both hops surfaces (the profile DegreeChip and /p/:id/hops)
 * consume, so they cannot drift. Decisions in the hops plan:
 *  - personalized + a signed-in pubkey + a completed calculation → the viewer.
 *  - anything else → the House observer, `originPov: "global"` — and
 *    `isFallback: true` when the toggle SAID personalized but no usable
 *    personal origin exists (the chrome tells the truth even when it
 *    disagrees with the toggle). `brainstorm_calc_completed` is a localStorage
 *    breadcrumb, not server truth — a second browser has it false.
 */
export interface HopsOrigin {
  origin: string | null;
  originPov: ScorePov;
  isFallback: boolean;
  loading: boolean;
}

/** The pure rule, extracted so it can be tested without the hook harness. */
export function resolveHopsOrigin(input: {
  pov: ScorePov;
  viewerPubkey: string | null;
  calcDone: boolean;
  housePubkey: string | null;
}): Omit<HopsOrigin, "loading"> {
  const wantsPersonal = input.pov === "personalized";
  if (wantsPersonal && input.viewerPubkey && input.calcDone) {
    return { origin: input.viewerPubkey, originPov: "personalized", isFallback: false };
  }
  return { origin: input.housePubkey, originPov: "global", isFallback: wantsPersonal };
}

export function useHopsOrigin(): HopsOrigin {
  const { pov } = useScorePov();
  const me = useActiveAccountDisplay();
  // Resolves once per app load (module-memoized promise underneath too);
  // both surfaces share this cache entry.
  const houseQuery = useQuery({
    queryKey: ["house-observer"],
    queryFn: resolveHouseObserver,
    staleTime: Infinity,
    retry: 1,
  });
  let calcDone = false;
  try { calcDone = localStorage.getItem("brainstorm_calc_completed") === "true"; } catch {}
  const resolved = resolveHopsOrigin({
    pov,
    viewerPubkey: me?.pubkey ?? null,
    calcDone,
    housePubkey: houseQuery.data ?? null,
  });
  return {
    ...resolved,
    // Only the house path waits on the network; a personal origin is immediate.
    loading: resolved.origin === null && houseQuery.isLoading,
  };
}
