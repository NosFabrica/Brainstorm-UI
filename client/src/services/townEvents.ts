/**
 * A town's events (NIP-52, kinds 31922/31923), as our index answers for the
 * town's name — what a town search's map pins beside its places
 * (lib/eventPins keeps the ones to come that say where they are).
 */
import type { NostrEvent } from "nostr-tools";
import { fetchFromSearchRelayByFilters } from "@/services/nostr";

const TIMEOUT_MS = 6000;

export function fetchTownEvents(town: string): Promise<NostrEvent[]> {
  return fetchFromSearchRelayByFilters([{ kinds: [31922, 31923], search: town, limit: 100 }], TIMEOUT_MS).catch(
    () => [],
  );
}

/**
 * The events in a map's area: those tagged with one of the cells covering it
 * (lib/geohash cellsCovering; many events tag their spot at several precisions),
 * and — for those tagged only at their exact spot — the town's, by its name.
 * The caller keeps the ones inside the area. None on failure.
 */
export async function fetchAreaEvents(cells: string[], town: string | null): Promise<NostrEvent[]> {
  const filters = [
    { kinds: [31922, 31923], "#g": cells, limit: 200 },
    ...(town ? [{ kinds: [31922, 31923], search: town, limit: 100 }] : []),
  ];
  const events = await fetchFromSearchRelayByFilters(filters, TIMEOUT_MS).catch(() => []);
  return [...new Map(events.map((e) => [e.id, e])).values()];
}
