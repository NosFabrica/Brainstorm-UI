/**
 * Loading an event's own page (`/e/…`): the search relay and the pointer's
 * relays are asked at once, not one after the other.
 *
 * Whichever answers first is shown — both legs add what they find to the
 * store, and the page reads the store, so a slow leg never holds up a fast one.
 * Once both have answered, anything the relays found that search lacks, or
 * holds an older version of, is handed to search (services/searchSeed): the
 * next reader, and every search, then finds it there.
 *
 * "The relays" are the pointer's own hints beside the default ones (and, for an
 * address, the author's outbox) — added to them, never instead of them. A copy
 * found on a default relay is as much a gap in search as one on a hint.
 */
import type { NostrEvent } from "nostr-tools";
import { requestAll } from "@/lib/relayRequest";
import { dedupeRelays } from "@/lib/relayList";
import { PROFILE_RELAYS, SEARCH_RELAY } from "@/lib/relays";
import { fetchAddressableEvents, querySearchRelay } from "@/services/nostr";
import { searchLacks, seedSearchRelay } from "@/services/searchSeed";

const SEARCH_TIMEOUT_MS = 5000;

/** The relay leg's relays: the hints first, the defaults beside them, never search (its own leg). */
function relaysFor(hints: string[] | undefined): string[] {
  return dedupeRelays([...(hints ?? []), ...PROFILE_RELAYS]).filter((r) => r !== SEARCH_RELAY);
}

/**
 * The first leg to find something, or nothing once both have finished. The
 * other leg runs on: its events still reach the store, and the page with them.
 */
function firstFound(legs: Promise<NostrEvent[]>[]): Promise<NostrEvent[]> {
  return new Promise((resolve) => {
    let left = legs.length;
    for (const leg of legs) {
      leg.then(
        (events) => {
          left--;
          if (events.length) resolve(events);
          else if (!left) resolve([]);
        },
        () => {
          if (!--left) resolve([]);
        },
      );
    }
  });
}

/** A `note`/`nevent`: one exact event, by id. */
export function loadEventForPage(ptr: { id: string; relays?: string[] }, timeoutMs = 6000): Promise<NostrEvent[]> {
  const id = ptr.id;
  const fromSearch = querySearchRelay([{ ids: [id], limit: 1 }], Math.min(timeoutMs, SEARCH_TIMEOUT_MS));
  // An id names one event: the first copy from any relay is the answer.
  const fromRelays = requestAll(relaysFor(ptr.relays), { ids: [id] }, timeoutMs, {
    enough: (collected) => collected.has(id),
  }).then((events) => events.filter((e) => e.id === id));

  void Promise.all([fromSearch, fromRelays]).then(([search, relays]) => {
    const found = relays[0];
    if (
      searchLacks(
        found,
        search.events.find((e) => e.id === id),
        search.answered,
      )
    )
      seedSearchRelay(found);
  });

  return firstFound([fromSearch.then((s) => s.events.filter((e) => e.id === id)), fromRelays]);
}

/** An `naddr`: whatever its author last published at the address. */
export function loadAddressForPage(
  ptr: { kind: number; pubkey: string; identifier: string; relays?: string[] },
  timeoutMs = 6000,
): Promise<NostrEvent[]> {
  const coord = `${ptr.kind}:${ptr.pubkey}:${ptr.identifier}`;
  const atAddress = (e: NostrEvent) =>
    e.kind === ptr.kind && e.pubkey === ptr.pubkey && (e.tags.find((t) => t[0] === "d")?.[1] ?? "") === ptr.identifier;
  const newestOf = (events: NostrEvent[]) =>
    events.filter(atAddress).sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))[0];

  const fromSearch = querySearchRelay(
    [{ kinds: [ptr.kind], authors: [ptr.pubkey], "#d": [ptr.identifier] }],
    Math.min(timeoutMs, SEARCH_TIMEOUT_MS),
  );
  // `newest`: every relay is waited out, so a hint holding a newer version than
  // the fastest default relay is heard. The page does not wait on it — the
  // first copy is already in the store, and shown.
  const fromRelays = fetchAddressableEvents([{ ...ptr, relays: relaysFor(ptr.relays) }], [], timeoutMs, {
    askSearch: false,
    newest: true,
  }).then((map) => {
    const found = map.get(coord);
    return found ? [found] : [];
  });

  void Promise.all([fromSearch, fromRelays]).then(([search, relays]) => {
    const found = relays[0];
    if (searchLacks(found, newestOf(search.events), search.answered)) seedSearchRelay(found);
  });

  return firstFound([
    fromSearch.then((s) => {
      const found = newestOf(s.events);
      return found ? [found] : [];
    }),
    fromRelays,
  ]);
}
