# NIP-65 routing is a loaded table, not a peek at the event store

The app already looked like it implemented the outbox model. `services/nostr.ts`
had `loadOutboxRelayListFromDb(pubkey, fallback)`, and the read and publish
paths called it. What it did was read a kind-10002 **out of the local event
store** and union its `write` relays with a hardcoded fallback.

Nothing filled that store. The signed-in user's relay list was fetched only on
the *failure* path of the login-time contact-list read, or on the dashboard when
the account had no cached name or picture. A stranger's was never fetched at all
before reading their notes. So `loadOutboxRelayListFromDb` returned the fallback
in almost every session, and in practice every read and every publish this app
made went to the same five relays in `lib/relays.ts`. The outbox model was
present in shape and inert in effect.

Three further gaps sat behind that one:

- **`publishToRelays` ignored its `relays` argument.** The signature took one
  and the body never read it. `services/tags.ts` had to hand-roll `pool.publish`
  to reach the tag hub, with a comment explaining why.
- **There was no inbox half.** Nothing anywhere parsed `["r", url, "read"]`.
  Replies, reports, RSVPs, vouches and NIP-22 comments all name a `p` recipient
  and none of them reached that recipient's read relays — the half of NIP-65
  that makes a mention arrive. NIP-57 zap requests had the same bug in a form
  that loses money's worth of signal: the `relays` tag told the wallet to publish
  the receipt to *our* relays, not to where the person being zapped reads.
- **A profile save overwrote the user's relay list.** `publishProfile` finished
  by signing a fresh kind-10002 whose tags were literally `PROFILE_RELAYS`.
  Kind 10002 is replaceable, so a user who had curated their relays in another
  client lost that list the first time they edited their bio here — and every
  outbox-model client then routed them to our defaults.

## The model

`lib/relayRouting.ts` is the one place that answers "which relays". It holds the
whole rule:

- **To read an author**, ask the relays *they write to* — `outboxRelays()`,
  which **loads** the kind-10002 if the store hasn't got it.
- **To send an event that names someone**, add the relays *they read from* —
  `inboxRelays()`. `publishRelaysFor()` composes the two: author outbox, every
  addressee's inbox, the caller's extras, our defaults as a floor.
- **Emit relay hints.** `tagWithHint()` puts the target's write relay in the
  third slot of an `e`/`a`/`p` tag, so the next client resolves it without a
  lookup. We consumed hints and contributed none.

The tag surface has its own floor — the hub in `tagging.config.json` — and the
same rule on top of it. The kit states it as "reads query these ∪ the user's
read relays; publishes go to these ∪ the user's write relays", and only the
publish half was ever true: `fetchTagEvents` asked the hub and nothing else, so
a tagging that reached the hub was found and one that only reached the relays
the viewer actually reads was not. Both halves hold now, through the one
choke point every tag read in that module funnels through.

Our own `PROFILE_RELAYS` stay a floor under both. Dropping them would be the
purer reading of NIP-65 and a worse app: most of nostr has no kind-10002, and a
user whose list we have not loaded yet still has to see something.

## The costs we accepted

**Routing is bounded, and loses to the fallback.** A relay-list lookup gets
2.5 seconds — deliberately shorter than the content reads it precedes — and a
miss is cached for five minutes. Routing is an optimisation over a fallback
that already works; blocking a page render on it is the worse answer. Where a
read has an independent leg (the search relay, in `fetchRecentByKinds` and
`fetchLiveStreams`), the lookup runs beside it rather than in front of it.

**A multi-author read is planned, not flattened.** `outboxRelays` answers the
single-author question by unioning everything into one list, which is right for
one author and degenerates at scale: asking six relays about four hundred
authors sends six copies of the same enormous filter, nearly all of it naming
people that relay has never carried. `planOutboxReads` instead uses
applesauce's `selectOptimalRelays` — a set cover that repeatedly takes the relay
serving the most still-uncovered authors — and `groupPubkeysByRelay`, so each
connection gets a filter naming only its own authors (`requestAllByRelay`).
Eight connections (`MAX_CONNECTIONS`) reach far more of the set than eight
arbitrary ones.

Two traps that make this fail silently, both covered by tests:

- **Key the map the way the pool keys connections.** `RelayPool` normalizes with
  `normalizeURL`, which *keeps* a trailing slash; our `dedupeRelays` drops it. A
  plan keyed our way matches nothing — every relay gets an empty author list and
  the read returns empty with no error.
- **Never drop an uncovered author.** A tight budget can leave someone with none
  of their relays selected, and `groupPubkeysByRelay` skips anyone whose list
  came back empty. Those authors go on the floor; otherwise they read as having
  posted nothing.

**Each author contributes at most four relays** (`MAX_RELAYS_PER_AUTHOR`), and
a publish resolves at most eight addressees' inboxes (`MAX_INBOX_RECIPIENTS`).
Without the second cap, publishing a kind-3 would mean resolving the relay list
of everyone you follow — and a kind-3's `p` tags are a membership list, not an
address book, so those kinds are excluded from inbox routing outright.

**Not everything an addressee is, is a `p` tag.** Two other tags name a person
indirectly, and both were being missed. An `a` tag is `kind:pubkey:d`, so the
author sits inside the value. An `e` or `q` tag names an event rather than a
person, but NIP-10 and NIP-18 both allow the referenced author's pubkey in a
later slot, and failing that the event store may already know who wrote it.
`addressees()` now reads all three. It never goes to the relays to resolve a
reference — a publish must not block on that — so an `e` tag we cannot resolve
simply contributes no addressee.

This changed little for today's events, because ours mostly `p`-tag the same
person the `a`/`e` points at. It matters for the next kind that does not: a
reply or reaction carrying only an `e` would have reached nobody's inbox, and
nothing would have reported it.

Two retractions did have the gap for real. A kind-5 withdrawing an RSVP, and
one revoking a vouch, carry an `e` and an `a` that both name the VIEWER's own
events — so nothing in the tags named the host or the subject, and the
retraction never reached the inbox the original had. Both now carry a `p`.

**Not everything a `p` tag names is an addressee.** Alongside the membership
lists, we exclude the kinds that are a claim *about* a person rather than a
message *to* them — NIP-56 reports and tag assertions/disputes. A vouch or an
RSVP is something its subject wants; an accusation delivered into the inbox they
publish for replies is not a notification they asked for, and an inbox anyone
can write an accusation to is a harassment vector. Those stay on the author's
own relays (and, for tags, the hub), where a reader looking for them finds them.

**kind-0 keeps the fast path.** Time-to-avatar sits on `fetchProfileEvent`, and
the default set genuinely covers kind-0 (purplepag.es exists to index it). So it
asks what it already knows first and only routes on a miss, rather than paying
for a lookup it usually does not need.

**`publishRelayList` still replaces.** It is for a caller that means to set the
list. Everything that merely wants the user discoverable now calls
`announceRelayList`, which re-broadcasts the list they already have — same id,
same signature, no signer prompt — and publishes ours only for a key that has
never had one.

## What we take from applesauce, and what we don't

The library ships an outbox toolkit and we use the parts that fit:
`mergeRelaySets` for URL identity, `selectOptimalRelays` +
`groupPubkeysByRelay` + `createFilterMap` for multi-author planning,
`setFallbackRelays` for the floor. Relay URLs here are all `normalizeURL` form
as a result, which is what `RelayPool` keys connections by — the property the
filter map depends on.

We do NOT use `getInboxes` / `getOutboxes` for parsing a kind-10002, and the
reason is worth recording because the helpers otherwise look like a drop-in.
They gate every relay on `isSafeRelayURL`, whose host pattern requires the
last label to be at most six characters. Measured against the real list:

    wss://relay.damus.io      ✓      wss://relay.community     ✗
    wss://nos.lol             ✓      wss://nostr.technology    ✗
    wss://purplepag.es        ✓      wss://relay.foundation    ✗

Those are real relays on real TLDs. Adopting the helpers would silently delete
them from their owners' relay lists — the exact failure this ADR exists to fix,
reintroduced one layer down. So `parseRelayList` stays ours (memoized on the
event, as theirs is), and `dedupeRelays` puts its own scheme check in front of
`mergeRelaySets`, which would otherwise rewrite any scheme to `wss:` and accept
an `https://` string as a relay. Our marker reading stays the forgiving one for
the same instinct: `["r", url, "wrtie"]` keeps the relay rather than dropping it.

**A relay hint never waits on the network.** `relayHintFor` is store-only. It is
read while *building* an event, so an awaited lookup there is dead time between
the user's click and the signer prompt — up to the routing deadline, for a field
that is optional by design. Anything that reads a profile warms the list first,
and the publish that follows loads it anyway.

## Whose relay a hint names

A hint says "the thing this tag points at can be found here", so which relay is
correct depends on the TAG, not on the event:

| Tag | Points at | Hint is |
| --- | --- | --- |
| `p` | a person | where THEY write |
| `a` | `kind:pubkey:d` | where that pubkey writes |
| `e` / `q` | somebody's event | where ITS AUTHOR writes |

The mistake this invites is computing one hint per event and stamping it on
every tag. That is right for an RSVP, where the `a`, the `e` and the `p` all
point at the host — and wrong for the retraction of one, where the `e` and `a`
name the VIEWER's own event and only the `p` names anyone else. Both shapes are
pinned in `services/relayHints.test.ts`.

`relayHintFor(pubkey)` is store-only and returns their first write relay, or
nothing. A hint we cannot produce is left off rather than guessed: a wrong hint
sends readers somewhere the event definitely is not.

Follow lists carry them too. NIP-02 is `["p", <pubkey>, <relay>, <petname>]`,
and those hints are how other clients bootstrap routing for the people you
follow — a reader holding your list and no kind-10002 for someone in it has
nowhere else to look. `ContactsFactory.addContact` takes the hint from a
pointer's first relay, so passing a bare pubkey string silently produced a bare
tag, which is what this did until the audit.

## The routing table has to be there BEFORE the signature

This is what the cache is for, and the rule that follows from it.

Routing is needed at the moment an event is signed and published. That is the
worst possible moment to go and find it. A lookup there is dead air between the
reader's click and the signer prompt; a lookup that loses its race is worse than
that, because the publish still succeeds — on the default relays, missing the
inbox of the person it was for, reporting nothing.

So the routing table is loaded while the reader is still reading:

> **Anything that puts a person or a note on the screen warms the relay lists
> of the people it names.** Call `warmRelayLists(pubkeys)` (`lib/relayRouting`).

It is fire-and-forget: nothing waits on it, nothing fails because of it, and
what it learns is deduped in flight, written to disk, and negatively cached for
someone who has no list at all. It is bounded at 100 people per call, because a
feed can name hundreds of authors and an `authors` filter that long is one some
relays quietly truncate.

The wiring sits at the points where the app resolves a profile, because that is
what every surface showing a person OR a note already does — a feed resolves its
authors, a thread resolves its repliers, a profile page resolves its subject:

| Where | Covers |
| --- | --- |
| `fetchProfileMap` | a page of people, and the authors of a page of notes |
| `fetchProfiles` | streamed avatar lists |
| `fetchProfileEvent` | the subject of a profile or share page |

A new surface that renders people some other way needs the call adding. The test
that states the whole point is in `nostr.publishRouting.test.ts`: "needs no
lookup at publish time for someone already on screen".

## Making the routing table survive a reload

Routing is only cheap if the table is already there. The `eventStore` is
in-memory, so it was never there: `completeLogin` warmed the relay list, but a
RELOAD does not run `completeLogin` — `bootstrapAccounts` restores the account
and nothing warmed anything. Every page load paid the cold path.

`lib/eventCache.ts` persists the routing kinds (3, 10002, 10040) to IndexedDB
and hydrates the active account's own back into the store
from `main.tsx`, before the first render. `loadReplaceable` checks the store
synchronously and returns on a hit, so a hydrated event costs no network and
skips the loader's buffer as well. The existing `followStore` snapshot — which
every current user already has on disk — is hydrated the same way, so the
contact list is present on the first render with no new storage at all.

Three properties this cannot be built without:

- **Verified on hydrate.** IndexedDB is writable by anything that can run
  script on this origin, and a forged kind-10002 steers where we *publish*.
- **Revalidated after hydrate.** `addressPointerLoadingSequence` stops at its
  first hit and `loadReplaceable` returns a held event without asking anyone,
  so a cache without a refresh pins the user to whatever relay list they had
  when it was written. Hydration kicks a `fromRelays` reload of everything it
  restored; the store keeps whichever copy is newer.
- **Routing waits for it.** Hydration is asynchronous, so `loadRelayList`
  awaits `whenHydrated()` before concluding the store has nothing. Without that
  the one read the session's routing is built from races the cache and loses.

Dropped on sign-out: which profiles someone looked at is a browsing trail, and
it should not outlive the session on a shared device. Capped at 500 rows, LRU
by write time.

The same store is wired into the address loader as its `cacheRequest`, which is
step one of the loading sequence — consulted before any relay, and a hit removes
the pointer so the relays are never asked. That is what makes a profile or a
relay list seen earlier in the day cost nothing at all, and for
`planOutboxReads` it means a two-hop author set can be routed largely from disk.

Two things that has to get right:

- **Bounded staleness.** Because a hit ends the sequence, a cache with no
  expiry would pin every author's relay list to whatever it was when we last
  saw them. Entries answer for 30 minutes and are then treated as a miss. The
  active account is not subject to this — it is refreshed explicitly.
- **`cache: false` on a deliberate relay read.** `loadReplaceable`'s
  `fromRelays` now sets it. Without that, the revalidation that keeps a
  hydrated copy fresh would be answered from the very cache it exists to
  refresh, and nothing would ever be refreshed again.

The id loader gets no `cacheRequest`: the store is keyed by replaceable
coordinate and indexed by author, so it cannot answer "the event with this id"
without a scan, and nothing it holds is normally looked up that way.

## What is still default-routed

Queries with no author to route by, which is not a gap but a limit of the model:
`fetchNotesByHashtag` (`#t`), thread replies (`#e`), tag comments (`#A`) and
`fetchReportsForPubkey` (`#p`) are all "who said this about X" — the authors are
strangers by definition. `fetchEventsByIds` has only ids, so it routes by relay
hints and nothing else.
