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

export const eventStore = new EventStore();
