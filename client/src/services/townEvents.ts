/**
 * A town's events — NIP-52 (kinds 31922/31923) and Event Index's list items
 * (kind 39999 under the Events lists, config/events) — as our index answers
 * for the town's name: what a town search's map pins beside its places
 * (lib/eventPins keeps the ones to come that say where they are). One event
 * once, where an item and an aggregator's copy both describe it
 * (lib/eventDedupe).
 */
import type { NostrEvent } from "nostr-tools";
import { EVENT_LISTS } from "@/config/events";
import { EVENT_ITEM_KIND } from "@/lib/calendarEvent";
import { dedupeEvents } from "@/lib/eventDedupe";
import { fetchFromSearchRelayByFilters } from "@/services/nostr";

const TIMEOUT_MS = 6000;
const NIP52 = [31922, 31923];

export async function fetchTownEvents(town: string): Promise<NostrEvent[]> {
  const events = await fetchFromSearchRelayByFilters(
    [
      { kinds: NIP52, search: town, limit: 100 },
      { kinds: [EVENT_ITEM_KIND], "#z": [...EVENT_LISTS], search: town, limit: 100 },
    ],
    TIMEOUT_MS,
  ).catch(() => []);
  return dedupeEvents([...new Map(events.map((e) => [e.id, e])).values()]);
}

/**
 * The events in a map's area: those tagged with one of the cells covering it
 * (lib/geohash cellsCovering; many events tag their spot at several precisions),
 * and — for those tagged only at their exact spot — the town's, by its name.
 * The caller keeps the ones inside the area. None on failure.
 *
 * No cells means the view is too wide for a `#g` filter to serve, not that it holds
 * nothing: the geo filters are left out so the town's name still answers, since
 * `"#g": []` would be a filter matching nothing.
 */
export async function fetchAreaEvents(cells: string[], town: string | null): Promise<NostrEvent[]> {
  const filters = [
    ...(cells.length
      ? [
          { kinds: NIP52, "#g": cells, limit: 200 },
          { kinds: [EVENT_ITEM_KIND], "#z": [...EVENT_LISTS], "#g": cells, limit: 200 },
        ]
      : []),
    ...(town
      ? [
          { kinds: NIP52, search: town, limit: 100 },
          { kinds: [EVENT_ITEM_KIND], "#z": [...EVENT_LISTS], search: town, limit: 100 },
        ]
      : []),
  ];
  if (!filters.length) return [];
  const events = await fetchFromSearchRelayByFilters(filters, TIMEOUT_MS).catch(() => []);
  return dedupeEvents([...new Map(events.map((e) => [e.id, e])).values()]);
}
