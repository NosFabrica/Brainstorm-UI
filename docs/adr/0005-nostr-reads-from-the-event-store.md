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
  `useIsSearchObserver` (is My-WoT search ready on the search relay?) is the same
  kind of probe but cached: it gates every search. A "yes" holds for the session
  (re-asked when the Account's 10040 changes), a "no" is re-asked every minute.
- **Tags (deferred).** `hooks/useTags.ts` still wraps relay reads in react-query
  (its `no-restricted-syntax` is off in `eslint.config.js`). Its reads already
  merge store-held events (`services/tags/read.ts` `withLocal`), so our own tags
  show; what remains is optimistic patching with rollback (vote, apply, comment,
  pin) and a 5–30 minute staleness. Checked again on 2026-11-26, after
  `services/tags/` was split into files and the tagging headers moved onto
  `lib/addressCache`: the split was by file, not between the relay read and what
  is derived from it, so every fetcher still interleaves its reads with the
  asserters' trust (the observer's scorer, resolved per call), the tag names and
  headers, and, for the catalogue and a tag's notes, paging through the whole
  assertion history. Moving it is splitting each of those ten fetchers into store
  filters and a pure derivation, and their mutations into store writes; the
  catalogue may stay a cached query when the rest moves.
- **`onRecover`** invalidates every query when the API comes back. With relay reads
  out of react-query that is correct by construction; the tag queries it also
  re-asks are harmless.

## Guardrail

`eslint.config.js` rejects a relay fetcher called inside a react-query `queryFn`
(`no-restricted-syntax`, at error everywhere but `hooks/useTags.ts`, pinned by
`lib/relayReadLint.test.ts`). The fetchers it knows are grown from the
primitives in `RELAY_READS`: every function in `services/` and `lib/` that calls
one, however many hops down, is a relay read too, so a wrapper (an item's
reactions, a concept's items, a lens's ranks) needs nothing. A new primitive
joins `RELAY_READS`.

Nothing else is deferred (2026-11-26). The last reads moved, and how:

- **Reviews of a place or a book** (`hooks/usePlaceReviews`, `useBookReviews`).
  Which reviews stand depends on the kind-5 removals, and the store keeps none:
  it acts on a kind 5 (drops what it deletes) and throws it away. The removals
  come as the ask's own answer, which `useStoreEvents` holds under a
  `{ kinds: [5] }` filter, and `standingReviews` reads them by the contract's
  rules (a removal by `e` alone, which the store's NIP-09 check of an
  addressable record doesn't consult, still counts). Where the store's deletion
  runs ahead of the contract — a person's removed newest record is gone, so an
  older one under their other `d` stands in — the store's reading holds.
- **Ranks through a lens** (`hooks/useLensRanks`: reviews' stars, `useWotItems`,
  the admin Growth card). The observer's 10040 through `useTrustProviderList`,
  then the scorer's kind 30382s through `useStoreEvents` keyed on the scorer it
  names; the house observer, an HTTP answer, stays a query.
- **The Dictionary and what resolves a concept** (`hooks/useDictionaryEntries`:
  `useDictionary`, `useItemConcept`, admin's `useUserDictionary`, the link
  picker's URL Templates list). The headers and copies are store events; which
  copy governs is derived from them (`services/dictionary` `dictionaryEntriesOf`).
  A copy published elsewhere (the user's Assistant, from the server) is asked for
  again with `readAgain` (`lib/readGeneration`), where a query was invalidated.
- **A list's items, by id or by search** (`hooks/useConceptItems`,
  `useLinkTemplates`): store timelines over the item filters; a NIP-50 search,
  which no store filter can express, is the ask's own answer as the store holds it.
- **GitHub evidence** (`hooks/useGitHubEvidence`): the claimants (kind 0s) from
  the store, GitHub's profile and gists as queries, joined in the hook.

## Considered

- **Keeping react-query with `staleTime: 0` and invalidation on publish.** Keeps
  the two caches and the hand-written keys, and still renders only after EOSE.
- **Persistent subscriptions per screen.** Would make other people's new events
  live, not just ours. Not done: the asks are one-shot and re-ask per window.
  An open thread is the first candidate.
