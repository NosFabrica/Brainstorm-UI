/**
 * How every Dictionary read reaches relays — concept headers, copies, list
 * items, URL templates: our own index first, the tag hub beside it.
 *
 * The index is the search relay (`VITE_SEARCH_RELAY_URL`, Brainstorm's own,
 * next to the server), which indexes everything and answers under the
 * `include:spam` lens. The hub (`dictionaryRelays()`, dcosl) is where list
 * events are published. Both are asked at once and the answers merged: the
 * index can lag — on 2026-10-02 its newest kind-39998 was five days behind
 * the hub's — and asking it alone, or first with the hub only on an empty
 * answer, would hide a copy published since, because "not indexed yet" and
 * "doesn't exist" look the same. In parallel, a list event shows wherever
 * it already is, at no extra wait.
 *
 * Never rejects: a relay that fails is an empty answer from that relay.
 */
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { fetchEventsByFilter, fetchFromSearchRelayByFilters } from "@/services/nostr";
import { isBlankEvent } from "@/lib/blankEvent";

export async function readListEvents(
  filters: Record<string, unknown>[],
  timeoutMs = 8000,
  hubRelays: string[] = dictionaryRelays(),
): Promise<NostrEvent[]> {
  if (!filters.length) return [];
  const [indexed, hub] = await Promise.all([
    fetchFromSearchRelayByFilters(filters, timeoutMs).catch(() => [] as NostrEvent[]),
    (fetchEventsByFilter(filters as never, hubRelays, timeoutMs) as Promise<NostrEvent[]>).catch(
      () => [] as NostrEvent[],
    ),
  ]);
  const byId = new Map<string, NostrEvent>();
  for (const ev of [...indexed, ...hub]) if (!isBlankEvent(ev)) byId.set(ev.id, ev);
  return [...byId.values()];
}
