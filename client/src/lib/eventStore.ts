/**
 * The app's one event store.
 *
 * In `lib/` beside the pool because `lib/relayRequest.ts` needs it and may not
 * import up into `services/`.
 *
 * It is deliberately NOT cleared when the Active Account changes. Its keys are
 * event ids and `(kind, pubkey, d-tag)` tuples, so identity scoping is intrinsic:
 * the per-account entries (kind-30078) are only read back with an
 * `authors: [pubkey]` filter, and are encrypted to self besides. React Query is
 * the cache that must be cleared on a switch; its keys are URLs.
 */
import { EventStore } from "applesauce-core";
import type { IDeleteManager } from "applesauce-core/event-store";
import { kinds } from "applesauce-core/helpers/event";
import { getEventHash } from "nostr-tools/pure";
import type { NostrEvent } from "nostr-tools";
import { loadFastVerifierWhenBusy, verifySignature } from "./verifier";
import { connectionSpeed } from "./connection";

export const eventStore = new EventStore();

/**
 * Verified once per event, not once per relay that sends it.
 *
 * The store checks a signature BEFORE it looks for a duplicate (only a
 * replaceable that loses to the held copy bails out first), so a note from
 * five content relays was verified five times. An id the store already holds
 * is let through without a Schnorr check, but only when the newcomer's body
 * hashes to that id: then it IS the held event (whose signature was checked
 * on the way in), and `add` keeps the copy it has, merging only the
 * newcomer's seen-relays into it. A held id over any other body is a forgery,
 * whatever its kind, and is checked in full (and fails): left unchecked, a
 * different kind made `add` throw, and any body got its relay credited as
 * one that holds the real event. The hash is cheap next to the signature,
 * the same trade `lib/verifier`'s own memo makes. `hasEvent`, not
 * `getEvent`: it doesn't touch the LRU that pruning reads (lib/storePruning).
 *
 * A kind 5 never takes this path (see `add` below).
 */
const isHeldCopy = (event: NostrEvent): boolean => {
  if (!eventStore.hasEvent(event.id)) return false;
  try {
    return getEventHash(event) === event.id;
  } catch {
    return false;
  }
};
eventStore.verifyEvent = (event: NostrEvent) => isHeldCopy(event) || verifySignature(event);

/**
 * Two holes in applesauce-core 6.2.0's `add`, closed here rather than at
 * every caller:
 *
 * - **A kind 5 is acted on before its signature is checked.** `add` hands it
 *   straight to the delete manager, so a forged deletion — any pubkey, any
 *   created_at — removed that key's events and, dated far in the future, kept
 *   every newer genuine version of them out for the session. A kind 5 is
 *   now verified first, by `verifySignature` itself: never by the held-id
 *   shortcut above, since what a kind 5 does is read from its own body, and
 *   the store keeps no kind 5 for a genuine one to be held. Only a test that
 *   turns verification off (`verifyEvent = undefined`) turns it off here too.
 * - **A deleted event is answered with itself, not null.** Every fetcher that
 *   passes on what `add` returns (the pool's `eventStore` option among them)
 *   handed deleted events to the screen as if the store held them. Null now
 *   means "not kept", whatever the reason.
 *
 * Wrapped on the instance, not subclassed: there is one store, built above
 * (services/eventStore.singleton.test).
 */
/**
 * The store's delete manager: private in the library's typings, and the one
 * place that knows what a kind 5 has deleted. Read through `isDeleted` and
 * `deletions$`.
 */
const deletes = (eventStore as unknown as { deletes: IDeleteManager }).deletes;

/** Whether its author has deleted `event` (NIP-09), by a deletion this store has seen. */
export const isDeleted = (event: NostrEvent): boolean => deletes.check(event);

/** Fires for each pointer a deletion lands on. */
export const deletions$ = deletes.deleted$;

const libraryAdd = eventStore.add.bind(eventStore);
eventStore.add = (event: NostrEvent, fromRelay?: string) => {
  if (event.kind === kinds.EventDeletion) {
    if (eventStore.verifyEvent && !verifySignature(event)) return null;
  } else if (deletes.check(event)) return null;
  return libraryAdd(event, fromRelay);
};

// The wasm verifier loads once there is real verifying to do — a results
// page's first frames — never at boot in front of the first screen
// (lib/verifier). On a slow link it takes more to be worth its ~120 KB.
// Not under test: each file would compile its own copy.
if (import.meta.env.MODE !== "test") loadFastVerifierWhenBusy(connectionSpeed() === "normal" ? 30 : 150);
