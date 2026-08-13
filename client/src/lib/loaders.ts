/**
 * One address loader for the whole app.
 *
 * Replaceable and addressable reads — profiles, relay lists, trust-provider
 * declarations, NIP-78 app data — used to go straight to the relays every time,
 * including for something the EventStore already held from the previous screen.
 * And because each read sat behind its own react-query key, three dashboard
 * modules asking for overlapping authors in the same tick issued three REQs that
 * nothing could collapse.
 *
 * The loader fixes both: it checks the store before asking, and buffers pointers
 * so everything requested inside one window leaves as a single REQ.
 */
import { createAddressLoader, createEventLoader } from "applesauce-loaders/loaders";
import { EMPTY, catchError, firstValueFrom, takeUntil, timer } from "rxjs";
import type { NostrEvent } from "nostr-tools";

import { pool } from "./relayPool";
import { eventStore } from "./eventStore";
import { PROFILE_RELAYS } from "./relays";

/**
 * How long pointers accumulate before a batch leaves.
 *
 * The library defaults to 1000ms, which is the wrong trade here: it would put a
 * full second in front of a *lone* profile fetch to serve a batching case that
 * only arises on mount. React effects from one render all fire within a few
 * milliseconds, so 150ms collapses the burst this exists for while costing a
 * single read less than a fifth of a typical relay round trip.
 */
export const ADDRESS_LOADER_BUFFER_MS = 150;

export const addressLoader = createAddressLoader(pool, {
  eventStore,
  bufferTime: ADDRESS_LOADER_BUFFER_MS,
  // Where to look when a pointer carries no relays of its own — the case for
  // every fallback load the EventStore itself starts.
  lookupRelays: PROFILE_RELAYS,
  followRelayHints: true,
});

/** The same, for pointers that name an event by id rather than by coordinate. */
export const idLoader = createEventLoader(pool, {
  eventStore,
  bufferTime: ADDRESS_LOADER_BUFFER_MS,
  extraRelays: PROFILE_RELAYS,
  followRelayHints: true,
});

/**
 * Teach the store to fill its own gaps.
 *
 * `EventModel` and `ReplaceableModel` call this only when the event is *not*
 * already held, so a component reading a profile the store has costs nothing.
 * Assigned here, at module scope, because it must be in place before the first
 * model subscribes and there is exactly one store to attach it to.
 *
 * Two loaders behind one hook because the store hands over either shape: a
 * coordinate (kind + pubkey, optionally a d tag) or a bare id. Routing only the
 * first and returning nothing for the second would look like "no such event"
 * rather than "nobody looked".
 */
eventStore.eventLoader = (pointer) =>
  "kind" in pointer && "pubkey" in pointer
    ? addressLoader(pointer as Parameters<typeof addressLoader>[0])
    : idLoader(pointer as Parameters<typeof idLoader>[0]);


/**
 * One replaceable or addressable event: from the store if it is there, else
 * loaded — batched with everything else asked for in the same window.
 *
 * The loader observable is COLD. Nothing is requested until it is subscribed,
 * which is what `firstValueFrom` does here; a caller that merely holds the
 * observable gets silence. That is the loader mistake the applesauce docs repeat
 * on every page.
 */
export async function loadReplaceable(
  kind: number,
  pubkey: string,
  { identifier, relays, timeoutMs = 10_000 }: { identifier?: string; relays?: string[]; timeoutMs?: number } = {},
): Promise<NostrEvent | undefined> {
  const held = eventStore.getReplaceable(kind, pubkey, identifier);
  if (held) return held;
  try {
    return await firstValueFrom(
      addressLoader({ kind, pubkey, identifier, relays }).pipe(
        takeUntil(timer(timeoutMs)),
        catchError(() => EMPTY),
      ),
      { defaultValue: undefined },
    );
  } catch {
    return undefined;
  }
}

/**
 * Many at once. Each pointer goes in separately so the loader's buffer can merge
 * them with whatever else is in flight — passing them as one call would batch
 * only within this caller, which is the thing that was already happening.
 */
export async function loadReplaceableMany(
  kind: number,
  pubkeys: string[],
  opts: { relaysFor?: (pubkey: string) => string[]; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const loaded = await Promise.all(
    pubkeys.map((pubkey) =>
      loadReplaceable(kind, pubkey, { relays: opts.relaysFor?.(pubkey), timeoutMs: opts.timeoutMs }),
    ),
  );
  return loaded.filter((event): event is NostrEvent => !!event);
}
