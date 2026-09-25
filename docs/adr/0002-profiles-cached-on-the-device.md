# Profiles are cached on the device, and the copy is advisory

Every reload asked the relay for the same names and avatars again: the event
store is memory-only, so a page of results re-fetched sixty-odd kind-0 events
that the previous visit had already seen. On a mobile connection that is a
second or more of nameless rows for people the device knew perfectly well.

Kind-0 events are now kept in IndexedDB (`lib/eventCache.ts`) and asked before
the relay. The copy is **advisory, never authoritative**: a profile is
replaceable, so a newer `created_at` always wins, and everything the app learns
about a profile — a search result, a loader, the User editing their own — is
written back through the store's `insert$`.

**Amended.** This first said "Nothing else may be persisted: only kind 0." The
rule it was reaching for is not about kind 0; it is about what browser storage
may hold. Restated:

> Only PUBLIC replaceable events that something waits on may be persisted.
> Never per-account data encrypted to self.

Kinds 3, 10002 and 10040 meet that bar and are kept too — they are public, they
are one row per author, and the app blocks on them before it can route anything
(docs/adr/0003). Kind 30078 does not and never will: it is encrypted to self and
scoped by an `authors` filter alone, so persisting it would carry one account's
ciphertext across a switch into shared storage. That was always the real
constraint; "only kind 0" was a proxy for it that stopped being true the moment
a second kind earned its place.

The module is `lib/eventCache.ts` rather than `lib/profileCache.ts` because it
no longer holds only profiles. One database, one writer, one eviction policy —
two ages, applied per kind.

Two ages, not one, for PROFILES. A copy under an hour old answers alone. An
older one is still shown at once, and the relay is asked as well, so the reader
sees a name immediately and the right one replaces it when it lands.

**Amended (2026-09-24).** This first added a third age: past a week a held copy
was not shown at all. That put a spinner in front of every person not seen in a
week, and bought nothing — the older copy is never an answer on its own, the
relay is asked after it regardless, and whatever it returns replaces the copy
on screen. A held profile is now shown however old it is; the 2,000-row cap is
what bounds how long it stays.

Routing kinds first got one age instead of two: a stale relay list was judged
not worth routing by, so it expired after thirty minutes. **Amended
(2026-09-24):** it is — an old relay list is almost always closer to right than
the default set an expired one fell back to. Routing now works like profiles:
a copy under thirty minutes old answers alone, an older one answers while the
relays are asked after it, and nothing expires. The store is capped at 2,000
rows, evicting least-recently-learned; that cap is the only lifetime.

## Considered options

**`EventStore`'s own `database` option** is the obvious door, and it is shut:
`IEventDatabase` is synchronous (`add(event): NostrEvent`,
`getByFilters(): NostrEvent[]`), which IndexedDB cannot implement.
`AsyncEventStore` exists but its reads return promises, so adopting it would
ripple through every `getReplaceable` caller in the app for a caching win.

**Loading the whole cache into the store at boot** would have made the first
paint synchronous — and slow. `EventStore.add` verifies signatures by default,
so a thousand held profiles is about a second of signature checking in front of
the first render. Reading on demand pays that only for the profiles a page
shows.

**A single TTL** was the first shape, and it was wrong: with one age, a cached
profile answers for its whole life and nothing ever corrects it, so a renamed
person kept their old name for a week. The freshness window is what makes the
cache self-correcting.

## Consequences

Persisted profile data is a second device-bound store beside `skVault`
(`docs/adr/0001`), under its own database (`brainstorm-profiles`). It holds
only public, already-published events, so losing it costs a round trip and
nothing else — and a device with no IndexedDB at all (a private window, an old
browser) behaves exactly as the app did before.

The freshness window is the knob that matters: shorter means more relay asks,
longer means a changed name lingers. An hour is a guess informed by how rarely
profiles change, not a measurement.
