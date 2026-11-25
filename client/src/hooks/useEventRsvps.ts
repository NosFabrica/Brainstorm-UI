import { useEffect, useRef, useState } from "react";
import { fetchEventRsvps, type EventRsvps } from "@/services/search";

/** How long the address list must stop changing before its RSVPs are asked for. */
export const RSVP_SETTLE_MS = 400;

/**
 * Who is going to each calendar event, keyed by its `kind:pubkey:d` address.
 * A result list fills in bursts and each burst changes the addresses; asking on
 * every one sent five requests for the same page (measured on staging
 * 2026-09-17), each for up to 500 RSVPs. So it asks once the list settles, and
 * then only for the addresses it has not asked before: a "More" page asks for
 * its own events, not every earlier one again under one shared limit. A
 * generation drops answers that land after the list emptied (a new search).
 */
export function useEventRsvps(addresses: string[]): Map<string, EventRsvps> {
  const [rsvps, setRsvps] = useState<Map<string, EventRsvps>>(new Map());
  const asked = useRef({ gen: 0, addresses: new Set<string>() });
  const key = addresses.join(",");
  useEffect(() => {
    const seen = asked.current;
    if (!key) {
      seen.gen += 1;
      seen.addresses = new Set();
      setRsvps(new Map());
      return;
    }
    const gen = seen.gen;
    const timer = setTimeout(() => {
      const fresh = [...new Set(key.split(","))].filter((a) => !seen.addresses.has(a));
      if (fresh.length === 0) return;
      for (const a of fresh) seen.addresses.add(a);
      void fetchEventRsvps(fresh).then((m) => {
        if (asked.current.gen === gen && m.size) setRsvps((prev) => new Map([...prev, ...m]));
      });
    }, RSVP_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key]);
  return rsvps;
}
