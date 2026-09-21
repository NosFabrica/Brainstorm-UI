# Profiles are cached on the device, and the copy is advisory

Every reload asked the relay for the same names and avatars again: the event
store is memory-only, so a page of results re-fetched sixty-odd kind-0 events
that the previous visit had already seen. On a mobile connection that is a
second or more of nameless rows for people the device knew perfectly well.

Kind-0 events are now kept in IndexedDB (`lib/profileCache.ts`) and asked
before the relay. The copy is **advisory, never authoritative**: a profile is
replaceable, so a newer `created_at` always wins, and everything the app learns
about a profile — a search result, a loader, the User editing their own — is
written back through the store's `insert$`. Nothing else may be persisted: only
kind 0.

Two ages, not one. A copy under an hour old answers alone. An older one is
still shown at once, and the relay is asked as well, so the reader sees a name
immediately and the next visit sees the right one. Past a week it is not shown
at all. The store is capped at 2,000 profiles, evicting least-recently-learned.

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
