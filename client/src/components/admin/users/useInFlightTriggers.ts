import { useCallback, useRef, useState } from "react";

/**
 * The people a GrapeRank run has been requested for and not yet answered,
 * whichever control sent it: a row's Trigger, an Activity row's re-trigger, a
 * failure group's, or a bulk re-trigger. Every one of them claims its pubkeys
 * here first, so none sends a second request for someone already in flight.
 *
 * Claims are recorded synchronously (a ref), so two clicks in the same tick
 * can't both win; `inFlight` is the same set as state, for rendering.
 */
export function useInFlightTriggers() {
  const held = useRef(new Set<string>());
  const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set());

  /** Claims every pubkey not already in flight, and returns the ones it claimed. */
  const claim = useCallback((pubkeys: readonly string[]): string[] => {
    const claimed: string[] = [];
    for (const pk of pubkeys) {
      if (!pk || held.current.has(pk)) continue;
      held.current.add(pk);
      claimed.push(pk);
    }
    if (claimed.length) setInFlight(new Set(held.current));
    return claimed;
  }, []);

  const release = useCallback((pubkey: string) => {
    if (held.current.delete(pubkey)) setInFlight(new Set(held.current));
  }, []);

  return { inFlight, claim, release };
}
