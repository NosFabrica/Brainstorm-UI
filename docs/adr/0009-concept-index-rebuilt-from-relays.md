# The concept index is a cache, rebuilt from relays alone

**Status:** proposed, 2026-10-24.

Search reads meaning from a concept index: the concept documents in Vespa that the linker uses at query time to read
"brunch" as a cuisine and "chicago" as a place. That index is projected from the concept graph in Tapestry's Neo4j and
from list headers. Signed events on relays are the source of truth for all of it. Tapestry's graph is derived from
those events, and the index is derived from the graph. This ADR turns that order into a test a deployment can pass or
fail, so that nothing that decides meaning lives only on a NosFabrica machine, and a fresh Brainstorm can compute
meaning from scratch.

## Why

In Alice's terms: once she has picked the definition of "widgets" her community uses, meaning the right list header,
she keeps that pick as a local copy that points at it, her own or one her Assistant signed for her. She can still find
the header, and the list it defines, when NosFabrica's Brainstorm is gone.

This is not disaster recovery for NosFabrica's databases. The test never rebuilds a relay: relays are the source it
reads, and it reads only relays NosFabrica does not run. It exists so that what a word means in search does not depend
on NosFabrica:

- **Anyone can run their own Brainstorm** from public relays and the published code, and get the same concept
  documents NosFabrica serves for the same reader.
- **Anyone can check NosFabrica's.** If an independent build of the house's Dictionary matches NosFabrica's, nobody has
  edited meaning by hand or kept data back.
- **The meaning outlives NosFabrica.** If NosFabrica's servers went away, the lists, the copies that pick them and the
  concepts built from them would still be on relays it does not control.

Rebuilding after a crash of NosFabrica's own stores would also work, but that is a side effect, not the goal.

## Decision

Three layers, one direction:

- **Relays hold the truth:** signed events, meaning list headers and items, edges and relationship types.
- **Tapestry's Neo4j holds the derived concept graph,** built from those events.
- **Vespa's concept documents are the query-time cache,** projected from the graph and the headers.

Nothing flows back. A graph or an index that disagrees with the relays is wrong, and it is rebuilt, never patched by
hand. A wrong concept is fixed by publishing an event.

### The rebuild test

> Take one reader: the house, or any User. Start a deployment with empty stores, the engine's published code at a
> tagged version (Tapestry, the projection job, vespa-relay and vespa-eventstore), and read access only to relays
> NosFabrica does not run. Run the rebuild as one job. It finds the reader's Dictionary by author, with the community
> headers it points at and the items filed under them, and builds concept documents for it. The test passes when they
> match the reference build for the same reader at the same cutoff: the same concept documents, by header coordinate,
> with the same labels, aliases, properties, value vocabularies and edges, counting only events published before the
> cutoff. At no point may the job read a NosFabrica server: no NosFabrica relay, API, database, file or key.

- **A reader's Dictionary** is the concepts they hold local copies of (CONTEXT.md): the copies they and their
  Assistant signed, each pointing with `b` at a community concept, and the community headers those point at. The
  governing definition comes from these, in [ADR 0007](0007-three-tiers-of-item-rendering.md)'s order.
- **The house's Dictionary** is what Brainstorm offers anyone without a copy of their own: the headers its curators put
  forward with a Self-pointer, found from the house's curator taggings, and the house's own local copies of them.
- **Items** are read by their filers. Which filers count for a list is the reader's trust (D6, G1), outside this ADR;
  the test takes that set as given, the same for both builds.
- **NosFabrica servers** are, on 2026-10-24, `dcosl.brainstorm.world`, `search.brainstorm.world`, the Brainstorm API
  (brainstorm_server), and NosFabrica's Neo4j and Vespa instances. `relay.eventindex.space` also counts while
  NosFabrica runs it, since NosFabrica maintains the Event Index. Any server NosFabrica runs later joins the list.
- **The reference build** is made by the same job, for the same reader, from NosFabrica's own relays at the same
  cutoff. The test compares two builds, not a build with a live index that keeps moving.
- **Matches** means equal once both are sorted. Any difference fails the test; there is no tolerance.
- **Published code** means public repositories under an open licence.

#### By author, never by topic

The test never asks whether every header for a word was found. Nobody can know that, and nothing here needs it. It asks
whether the definitions a reader chose can be found without NosFabrica. So every read names its authors: the reader,
their Assistant, the house, the curators the house tagged, and the filers that count. An author's events are on the
relays that author publishes to, so "everything the house's curators signed" has an answer, while "every header for
widgets" has no relay to ask.

The test runs for the house before every release of the code that builds or reads the concept index, and its result is
published with the release. Until the lists below are mirrored, a failing result is recorded and the release goes
ahead. After that, a release that fails does not ship. Any User can run it for their own Dictionary.

## Today it fails, on data

The code passes. Every repository the rebuild needs is public and licensed: vespa-relay and vespa-eventstore (MIT),
Tapestry and brainstorm_server (AGPL-3.0), and protocols (CC0).

The data fails. On 2026-10-24, read-only REQs to relays NosFabrica does not run (`nos.lol`, `relay.damus.io`,
`relay.primal.net`, `nostr.mom` and `purplepag.es`) found:

| Kind 39998 and 39999 events | On NosFabrica's relays  | On any one of those relays |
| --------------------------- | ----------------------- | -------------------------- |
| List headers                | 421 (audit, 2026-10-22) | 11 at most                 |
| Food and Drink Places items | 7,984                   | 0                          |
| Event Index items           | 11,397 (audit, 10-22)   | 0                          |

The two lists the first journeys stand on ([ADR 0008](0008-first-search-journeys.md)) exist only on NosFabrica's
relays. Mise en Place publishes the places list to `dcosl` and `search.brainstorm.world` and nowhere else. The Event
Index publishes its items to its own relay, `relay.eventindex.space`, and to NosFabrica's, but not to general relays
(`PUBLISH_TO_GENERAL_RELAYS` is off by default). A deployment without NosFabrica's servers would have no places and no
events to build concepts from.
Counts for the lists are from the [data audit](../search/audit-2026-10-22.md) where marked.

## Consequences

- **Publishers write to relays NosFabrica does not run, as well as to its own.** That covers Mise en Place, the Event
  Index, the Unbnd librarian, the house and its curators, and anyone who files a header or keeps a local copy of one.
  Which relays, and whether public relays keep lists this size (8,000 to 11,000 items, refreshed monthly and daily),
  belongs to the publishers' own tasks; a community-run mirror is one answer. This ADR requires only that the test can
  pass.
- **The projection job reads only relay events and Tapestry's graph,** and the same job rebuilds Tapestry's graph from
  relays when the stores are empty.
- **No hand edits to the graph or the index.** Corrections are events.
- **A concept document is the same for anyone who builds it.** It comes from one header and the events about it. What
  differs between readers is which documents their Dictionary holds; serving more than the house's is a question for D6
  as much as for this ADR.
- **How a reader chooses is out of scope.** Which candidate Alice picks for "widgets", and how Brainstorm helps her sift
  the candidates, comes from her web of trust, computed per asker (D6, G1). That side needs the same bar in its own
  decision: trust built from events on relays, by a provider she chooses rather than one NosFabrica imposes.
- **How a pick is stored is decided separately.** Whether Brainstorm's Assistant writes a User's local copies for them,
  as Tapestry's Dictionary does, and by what rule, is its own decision. This test needs only that a pick is a signed
  event, found by its author.
