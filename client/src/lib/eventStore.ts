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
import type { NostrEvent } from "nostr-tools";
import { startFastVerifier, verifySignature } from "./verifier";

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

// The wasm verifier loads behind the first events, never in front of them
// (lib/verifier). Not under test: each file would compile its own copy.
if (import.meta.env.MODE !== "test") void startFastVerifier();
