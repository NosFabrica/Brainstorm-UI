/**
 * One address loader for the whole app: it answers from the EventStore before
 * asking the relays, and buffers pointers so everything requested inside one
 * window leaves as a single REQ.
 */
import { createAddressLoader, createEventLoader } from "applesauce-loaders/loaders";
import { EMPTY, catchError, firstValueFrom, takeUntil, timer } from "rxjs";
import type { NostrEvent } from "nostr-tools";

import { pool } from "./relayPool";
import { eventStore } from "./eventStore";
import { cachedEventsForFilters } from "./eventCache";
import { PROFILE_RELAYS } from "./relays";

/**
 * The library defaults to 1000ms, which would put a full second in front of a
 * lone fetch to serve a batching case that only arises on mount. Effects from one
 * render fire within milliseconds of each other.
 */
export const ADDRESS_LOADER_BUFFER_MS = 150;

export const addressLoader = createAddressLoader(pool, {
  eventStore,
  bufferTime: ADDRESS_LOADER_BUFFER_MS,
  // Step one of the loading sequence: disk, before any relay. A hit removes the
  // pointer and the relays are never asked — which is the win for a profile or
  // relay list seen recently, and the reason `cachedEventsForFilters` enforces
  // a TTL and verifies signatures rather than trusting what it reads.
  cacheRequest: cachedEventsForFilters,
  // Where to look when a pointer carries no relays of its own — the case for
  // every fallback load the EventStore itself starts.
  lookupRelays: PROFILE_RELAYS,
  followRelayHints: true,
});

/**
 * The same, for pointers that name an event by id rather than by coordinate.
 *
 * Deliberately no `cacheRequest`: the cache is keyed by replaceable coordinate
 * (`kind:pubkey:d`) and indexed by author, so it cannot answer "the event with
 * this id" without a scan. Nothing it holds is normally looked up that way.
 */
export const idLoader = createEventLoader(pool, {
  eventStore,
  bufferTime: ADDRESS_LOADER_BUFFER_MS,
  extraRelays: PROFILE_RELAYS,
  followRelayHints: true,
});

/**
 * Teach the store to fill its own gaps — the models call this only when the event
 * is not already held.
 *
 * Two loaders behind one hook because the store hands over either shape: a
 * coordinate or a bare id. Serving only the first would make an id lookup look
 * like "no such event" rather than "nobody looked".
 */
eventStore.eventLoader = (pointer) =>
  "kind" in pointer && "pubkey" in pointer
    ? addressLoader(pointer as Parameters<typeof addressLoader>[0])
    : idLoader(pointer as Parameters<typeof idLoader>[0]);


/**
 * One replaceable or addressable event: from the store if it is there, else
 * loaded — batched with everything else asked for in the same window.
 *
 * The loader observable is COLD — nothing is requested until subscribed, which is
 * what `firstValueFrom` does here.
 */
export async function loadReplaceable(
  kind: number,
  pubkey: string,
  {
    identifier,
    relays,
    timeoutMs = 10_000,
    fromRelays = false,
  }: { identifier?: string; relays?: string[]; timeoutMs?: number; fromRelays?: boolean } = {},
): Promise<NostrEvent | undefined> {
  // `fromRelays` is for the caller whose question is about the relays rather than
  // about the event — "does this relay hold their kind-0?". Answering that from
  // the store would be answering a different question.
  const held = fromRelays ? undefined : eventStore.getReplaceable(kind, pubkey, identifier);
  if (held) return held;
  try {
    return await firstValueFrom(
      // `cache: false` when the caller asked for relays. The loader consults the
      // disk cache first and stops on a hit, so without this a "go to the
      // relays" read would be answered from the very cache it exists to refresh
      // — and the hydrated copy would never be revalidated at all.
      addressLoader({ kind, pubkey, identifier, relays, cache: !fromRelays }).pipe(
        takeUntil(timer(timeoutMs)),
        catchError(() => EMPTY),
      ),
      { defaultValue: undefined },
    );
  } catch {
    return undefined;
  }
}
