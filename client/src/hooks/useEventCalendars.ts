/**
 * The calendars a NIP-52 calendar event is on: the kind-31924 calendars whose
 * own `a` tags name it, live from the store (ADR 0005), asked of the search
 * relay by `#a`. An event's own `a` to a calendar is only a request to be
 * added (NIP-52 "Collaborative Calendar Event Requests"): it is not read here,
 * where only the calendar's word counts.
 */
import { useMemo } from "react";
import type { NostrEvent } from "nostr-tools";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { fetchFromSearch } from "@/services/search";

export const CALENDAR_KIND = 31924;

export function useEventCalendars(address: string | null): NostrEvent[] {
  const filters = useMemo(() => (address ? [{ kinds: [CALENDAR_KIND], "#a": [address] }] : null), [address]);
  const found = useStoreEvents(address ? `event-calendars:${address}` : null, filters, () =>
    fetchFromSearch(filters ?? [], { limit: 20 }),
  );
  return useMemo(() => {
    // The newest version of each calendar, and only one that still lists the event.
    const byAddr = new Map<string, NostrEvent>();
    for (const e of found.events) {
      const key = `${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
      const known = byAddr.get(key);
      if (!known || e.created_at > known.created_at) byAddr.set(key, e);
    }
    return [...byAddr.values()].filter((c) => c.tags.some((t) => t[0] === "a" && t[1] === address));
  }, [found.events, address]);
}
