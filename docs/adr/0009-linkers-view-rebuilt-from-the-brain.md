# The linker's view is a cache, rebuilt from the instance's own brain

**Status:** proposed, 2026-10-24; rewritten 2026-10-25 for the rephrased D3.

Search will read meaning from the linker's view: the slice of the graph the linker (E2) uses at query time to read
"brunch" as a cuisine and "chicago" as a place. This ADR says where that view comes from and who wins when it disagrees
with what it was derived from, and turns that into a test an instance can pass or fail.

It replaces this ADR's first draft, which made signed events on relays the truth and asked for a rebuild that read only
relays NosFabrica does not run.

## Why

The linker cannot be built until someone decides what it reads, where that copy comes from, and who wins when copies
disagree. Left open, whoever builds the concept document type (E2.1) decides it by default.

It also says what "run your own Brainstorm" has to mean. This is not disaster recovery for NosFabrica's databases. The
test never rebuilds a relay or a Neo4j graph, and never copies one instance's brain into another. The one thing it
rebuilds is a cache, the linker's view, from the brain it was derived from. What it checks is that a new instance needs
nothing from NosFabrica's brain to interpret a query for its own users:

- **Anyone can run their own Brainstorm** from the published code, the firmware and the relays they choose to read,
  and get a working linker.
- **The view can be thrown away.** Losing Vespa's concept documents costs one job, never meaning.
- **NosFabrica cannot keep meaning back.** Anything another instance needs to interpret a query has to be written down
  as events it can read, not kept as derived structure in NosFabrica's brain.

In Alice's terms: when she searches for "widgets" on her own Brainstorm, its linker reads what widgets means from her
instance's brain, built from the events it chose to read, the header her community uses for widgets among them. Which
definition she picked is something her instance knows about her, and it stays there. Nothing on that path asks
NosFabrica's brain what widgets means.

## Decision

An instance's brain is where truth lives. Everything else is what it read, what it writes down, or a view derived from
the brain.

- **The brain** is the instance's Neo4j graph plus the Tapestry LMDB: what it has read, what it has derived, and what it
  knows about its owner.
- **Derived views** live in LMDB: tapestryJSON sections, derived from the brain by the Duality engine. Each one can be
  derived from scratch, and only the worthwhile ones are kept fresh.
- **Events** are what the instance has read from others and what it writes down for them. Its own strfry is its
  complete source of events. Every other relay, dcosl included, is just another relay: an event read from dcosl counts
  the same as one read anywhere else.
- **The linker's view** is one of those derived sections (D3.2), loaded into Vespa as concept documents by one job
  (D3.3), so it sits beside the event index at query speed. It is a cache, never a second source of truth.

The brain wins when they disagree. Nothing flows from Vespa back into the brain. A wrong view is rebuilt, never patched
by hand; a wrong meaning is fixed in the brain, and by an event where other instances need to see it.

### The rebuild test

> Start a fresh instance: the engine's published code at a tagged version, firmware installed, and the relays it
> chooses to read. It builds its own brain from the firmware and the events it reads, the Duality engine derives the
> linker's view, and one job loads it into Vespa. The test passes when all three hold:
>
> 1. **Nothing from NosFabrica's brain.** No step reads NosFabrica's Neo4j, LMDB or Vespa, the Brainstorm API, or a
>    file, dump or key of NosFabrica's. Events are not part of a brain: the instance may read dcosl, or any relay
>    NosFabrica runs, like any other relay.
> 2. **One job rebuilds the view from the brain.** Drop the concept documents and run the job again: the same brain
>    gives the same documents, and the job reads nothing but the brain.
> 3. **A stale view never changes a result.** Where the part of the view a query needs is missing or behind the brain,
>    the query returns what the raw query returns, because the linker falls back to it (E2.9). A stale view can cost a
>    query its interpretation, never its results.

- **A fresh instance** starts with empty stores: no Neo4j graph, no LMDB, no events in its strfry, nothing in Vespa.
  Firmware is what Tapestry installs at setup, before the instance reads anything.
- **The relays it chooses** are its owner's choice, and the test does not prescribe them. A run records the relays it
  read and a cutoff, so it can be repeated.
- **Reading events** means plain filters. A NIP-50 search on a NosFabrica relay is NosFabrica's linker answering, not
  an event being read, so the test may not use one.
- **NosFabrica's brain** is, on 2026-10-25, the Neo4j and LMDB of NosFabrica's Tapestry instances, NosFabrica's Vespa
  (the event index and any concept documents), and the Brainstorm API (brainstorm_server). Its relays,
  `dcosl.brainstorm.world`, `search.brainstorm.world` and `relay.eventindex.space`, are not part of it.
- **The same documents** means equal once both are sorted. Any difference fails the test; there is no tolerance.
- **Published code** means public repositories under an open licence.

The test runs before every release of the code that derives, loads or reads the linker's view, and its result is
published with the release. A release that fails does not ship. NosFabrica runs it with the relays its own instance
reads; anyone can run it with theirs.

## Where it stands today

**The code passes.** The repositories the rebuild runs on were public and licensed when checked on 2026-10-24:
vespa-relay and vespa-eventstore (MIT), Tapestry and brainstorm_server (AGPL-3.0), and protocols (CC0). Tapestry is
where the LMDB and the Duality engine live.

**The test cannot run yet.** The linker's view (D3.2), the job that loads it (D3.3) and the linker's fallback (E2.9)
are not built.

**The first draft's data finding no longer fails it.** On 2026-10-24, five general relays (`nos.lol`,
`relay.damus.io`, `relay.primal.net`, `nostr.mom` and `purplepag.es`) held none of the 7,984 Food and Drink Places
items or the 11,397 Event Index items, and at most 11 of the 421 list headers
([data audit](../search/audit-2026-10-22.md)). Under the first draft that was a failure. Under this one an instance
reads those events from dcosl, `search.brainstorm.world` and the Event Index's relay like any others. How far
publishers reach beyond them is a question for their own tasks, not for this test.

**What the test asks of data instead** is that everything another instance needs to interpret a query is an event.
That cannot be checked until D3.2 names the view's fields. For each one, D3.2 says whether it comes from events any
instance can read, or from a rule every instance runs over them.

## Consequences

- **Shared meaning is written down as events.** The headers, edges and vocabulary another instance needs to interpret
  a query for its own users are published, not kept as derived structure in NosFabrica's brain. What an instance
  derives for itself, and what it knows about its owner, stays in its brain and never has to be written down.
- **Published or derived is D5's call.** Where a derived edge should be visible to other instances, either the edge is
  published or the rule that derives it is. This ADR requires one or the other, not which.
- **Publishers need not avoid NosFabrica's relays.** The first draft required Mise en Place, the Event Index, the Unbnd
  librarian and header authors to write to relays NosFabrica does not run as well. That requirement is withdrawn.
- **The view is specified once.** D3.2 defines it as a tapestryJSON section first and a Vespa document type second, so
  one derivation serves both, in a canonical order so two runs can be compared.
- **The projection job derives nothing.** D3.3 ships the section from LMDB into Vespa and refreshes it on write.
  Running it again from scratch is the rebuild path. It no longer rebuilds Tapestry's graph from relays, as the first
  draft asked.
- **The linker has to know when its view is behind.** To fall back where the view is stale, the linker needs to tell
  when the part it uses lags the brain. How the view records that belongs to D3.3 and E2.9.
- **Freshness is decided separately.** Which nodes' views are kept fresh on write, and which are derived lazily or not
  at all, is D3.5. This ADR needs only that a stale view is safe.
- **No hand edits to the view.** Corrections go into the brain, and the view is derived again.
- **Out of scope:** where the linker runs (D3.4), and how a reader's trust is computed (D6).
