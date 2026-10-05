# Nostr reads come from the EventStore; react-query is for the Brainstorm API

Relay reads used to be react-query queries wrapped around one-shot fetchers that
collected until EOSE or a timeout. That gave every Nostr read a second cache beside
the EventStore, hand-written keys that drifted from their inputs, a snapshot that
never saw an event arriving after the window (`staleTime: Infinity` is the app
default), and a page that waited for the slowest relay before showing anything.
Our own publishes had to be patched in by hand (`setQueryData`, delayed
invalidates, rollbacks).

## The rule

- **The EventStore holds Nostr data; components subscribe to it.** Lists render
  from `useStoreEvents` (a store timeline), one replaceable from
  `useStoreReplaceable`, profiles from `useLiveProfile` / `useLiveProfiles`. Rows
  appear as relays answer.
- **The existing fetchers are the asks.** They keep their routing (outbox, relay
  hints, the search-relay fallback, the per-person batch) and add each event to the
  store as it arrives. `lib/askOnce` runs one ask per key per window, and a mount
  joins an ask already out.
- **Our own writes land in the store.** `publishToRelays` adds the event once a
  relay accepts it; the store keeps the newest version, so a lagging relay cannot
  revert it. Optimism before the signature uses a pending overlay
  (`lib/listEdits`), never a cache write.
- **react-query is for the Brainstorm HTTP API**, keyed on its real inputs
  (`@tanstack/query/exhaustive-deps` at error). A derived value that mixes the two
  takes its events from the store and its HTTP half from a query.
- **Relay-first where it must be.** A read that is about to be REPLACED and
  republished (`fetchTrustProviderList`, `fetchPrivateAppData`,
  `pickAuthoritativeBase`) asks the relays first, newest wins. That decides how
  the ask is made, not where the answer is kept: statuses derived from such reads
  (`useTrustProviderStatus`, `useTrustListsStatus`) still read the store.

## Exceptions

- **Relay probes.** "Is this event on that relay right now?" cannot be answered by
  a store holding copies from elsewhere. Admin diagnostics (`NostrHealthCard`,
  `TrustedListMembers`) stay react-query queries, uncached (`staleTime: 0`,
  `gcTime: 0`), and mark the call with
  `eslint-disable-next-line no-restricted-syntax -- relay probe`.
- **Tags (deferred).** `hooks/useTags.ts` still wraps relay reads in react-query.
  Its reads already merge store-held events, so our own tags show; what remains is
  optimistic patching and a 5–30 minute staleness. The catalogue is a costly
  aggregate over the whole assertion history and may stay a cached query when the
  rest moves.
- **`onRecover`** invalidates every query when the API comes back. With relay reads
  out of react-query that is correct by construction; the tag queries it also
  re-asks are harmless.

## Guardrail

`eslint.config.js` rejects a relay fetcher called inside a react-query `queryFn`
(`no-restricted-syntax`, pinned by `lib/relayReadLint.test.ts`). A new fetcher
joins `RELAY_FETCHERS` there.

## Considered

- **Keeping react-query with `staleTime: 0` and invalidation on publish.** Keeps
  the two caches and the hand-written keys, and still renders only after EOSE.
- **Persistent subscriptions per screen.** Would make other people's new events
  live, not just ours. Not done: the asks are one-shot and re-ask per window.
  An open thread is the first candidate.
