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
