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
import { kinds } from "applesauce-core/helpers/event";
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
 * is answered here without a check: `add` then finds it in memory, keeps the
 * copy it has and merges only the newcomer's seen-relays into it — the
 * newcomer's content and signature are thrown away, so there is nothing of
 * theirs left to trust. `hasEvent`, not `getEvent`: it doesn't touch the LRU
 * that pruning reads (lib/storePruning).
 */
eventStore.verifyEvent = (event: NostrEvent) => eventStore.hasEvent(event.id) || verifySignature(event);

/**
 * Two holes in applesauce-core 6.2.0's `add`, closed here rather than at
 * every caller:
 *
 * - **A kind 5 is acted on before its signature is checked.** `add` hands it
 *   straight to the delete manager, so a forged deletion — any pubkey, any
 *   created_at — removed that key's events and, dated far in the future, kept
 *   every newer genuine version of them out for the session. A kind 5 now
 *   goes through the same `verifyEvent` as every other event first.
 * - **A deleted event is answered with itself, not null.** Every fetcher that
 *   passes on what `add` returns (the pool's `eventStore` option among them)
 *   handed deleted events to the screen as if the store held them. Null now
 *   means "not kept", whatever the reason.
 *
 * Wrapped on the instance, not subclassed: there is one store, built above
 * (services/eventStore.singleton.test).
 */
const libraryAdd = eventStore.add.bind(eventStore);
eventStore.add = (event: NostrEvent, fromRelay?: string) => {
  if (event.kind === kinds.EventDeletion) {
    if (eventStore.verifyEvent && !eventStore.verifyEvent(event)) return null;
  } else if (eventStore.deletes.check(event)) return null;
  return libraryAdd(event, fromRelay);
};

// The wasm verifier loads once there is real verifying to do — a results
// page's first frames — never at boot in front of the first screen
// (lib/verifier). On a slow link it takes more to be worth its ~120 KB.
// Not under test: each file would compile its own copy.
if (import.meta.env.MODE !== "test") loadFastVerifierWhenBusy(connectionSpeed() === "normal" ? 30 : 150);
