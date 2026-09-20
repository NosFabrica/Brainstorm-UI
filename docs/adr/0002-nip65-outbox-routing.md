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

## What is still default-routed

Queries with no author to route by, which is not a gap but a limit of the model:
`fetchNotesByHashtag` (`#t`), thread replies (`#e`), tag comments (`#A`) and
`fetchReportsForPubkey` (`#p`) are all "who said this about X" — the authors are
strangers by definition. `fetchEventsByIds` has only ids, so it routes by relay
hints and nothing else.
