/**
 * The app's one event store.
 *
 * Down here beside the pool for the same reason the pool is: `lib/relayRequest.ts`
 * needs it, and so does `services/nostr.ts`, and the arrow between those two only
 * points one way. `services/nostr.ts` re-exports it, so nothing that already
 * imports it from there has to move.
 *
 * It is deliberately NOT cleared when the Active Account changes. Its keys are
 * event ids and `(kind, pubkey, d-tag)` tuples, so identity scoping is intrinsic:
 * the per-account entries (kind-30078 app data) are only ever read back with an
 * `authors: [pubkey]` filter, and the private ones are encrypted to self on top of
 * that. Everything else in here — profiles, notes, relay lists, reports — is
 * public and genuinely shared, so dropping it would only force refetches of data
 * both identities can see anyway. React Query is the cache that must be cleared
 * on a switch; its keys are URLs, which carry no pubkey.
 */
import { EventStore } from "applesauce-core";

export const eventStore = new EventStore();
