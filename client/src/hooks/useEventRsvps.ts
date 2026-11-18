import { useEffect, useState } from "react";
import { fetchEventRsvps, type EventRsvps } from "@/services/search";

/** How long the address list must stop changing before its RSVPs are asked for. */
export const RSVP_SETTLE_MS = 400;

/**
 * Who is going to each calendar event, keyed by its `kind:pubkey:d` address.
 * A result list fills in bursts and each burst changes the addresses; asking on
 * every one sent five requests for the same page (measured on staging
 * 2026-09-17), each for up to 500 RSVPs. So it asks once the list settles.
 */
export function useEventRsvps(addresses: string[]): Map<string, EventRsvps> {
  const [rsvps, setRsvps] = useState<Map<string, EventRsvps>>(new Map());
  const key = addresses.join(",");
  useEffect(() => {
    if (!key) {
      setRsvps(new Map());
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      void fetchEventRsvps(key.split(",")).then((m) => {
        if (alive) setRsvps(m);
      });
    }, RSVP_SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  return rsvps;
}
