# The first search journeys: places, then events

**Status:** proposed, 2026-10-24, for the team's R&D call to confirm or change. The call's outcome, and any dissent, is
written in here before it is accepted.

Search is built one journey at a time, and every other search decision is sized by the first one: which lists need
density, which index fields land first, which queries the [labelled set](../search/eval/README.md) leans on. The
proposal is recommendation queries over places and events, like "best brunch in chicago" and "what's on this weekend".
A general web search engine is weakest there, the asker's trusted people are strongest, and the lists already exist:
Food and Drink Places (BTC Map merchants, imported by Mise en Place, reviewed in Brainstorm and Regulars) and Events
(Event Index items and native NIP-52 calendar events).

## What the data says

From the [data audit](../search/audit-2026-10-22.md) of 2026-10-22, except where a column says 2026-10-24. Those were
counted with read-only REQs to `wss://search.brainstorm.world`, by the audit's method and from its city centres.

|          | Food and Drink Places                             | Events in the next 30 days                                 |
| -------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Items    | 7,954, one list, one curator                      | 11,014: 7,474 Event Index items and 3,540 native events    |
| Where    | every item has coordinates and four `g` geohashes | 57.2% carry `g`; the rest need their location text matched |
| Fields   | category 100%, locality 79.4%, cuisine 52.1%      | `start` on every one; location text on 86.5%               |
| Coverage | 3,017 localities; only 3 hold 50 places or more   | city counts follow the feeds imported (see below)          |

By demo city. Places count items within 25 km of the centre. Events use the audit's city assignment, which folds in
suburbs within 40 km.

| City          | Places (10-24) | With a cuisine (10-24) | Brunch or breakfast (10-24) | Place reviews (10-24) | Events |
| ------------- | -------------- | ---------------------- | --------------------------- | --------------------- | ------ |
| Chicago       | 37             | 18                     | 0                           | 1                     | 33     |
| New York      | 23             | 15                     | 0                           | 5                     | 336    |
| San Francisco | 84             | 55                     | 1                           | 0                     | 233    |
| Austin        | 46             | 31                     | 1                           | 1                     | 128    |
| Funchal       | 71             | 27                     | 3                           | 0                     | 19     |
| Nashville     | 14             | 9                      | 0                           | 0                     | 16     |

"Brunch or breakfast" is a place whose `cuisine` or `t` holds either word. "Place reviews" are kind 34259 reviews of a
Food and Drink Places item: the index holds 9 in all, by 3 reviewers, on 8 places.

Search today finds few places: in the [baseline](../search/eval/baseline-2026-10-22.md), 3 of 26 place queries showed
any. The Places tab has searched the whole list since [#267](https://github.com/NosFabrica/Brainstorm-UI/pull/267),
so that number needs a rerun before it is cited again.

## Decision

### 1. Two query classes

- **Recommendation over places.** Good places of a kind, in or near a place, ranked and explained by the asker's
  people: "best brunch in chicago", "ramen near me my friends like". The query constrains a place (a city, or near me)
  and a property of the item (`cuisine`, `category`). Roadmap milestone M2.
- **Recommendation over events.** What is on, where and when: "what's on this weekend in chicago". The query constrains
  a place and a time (`start`). Milestone M3.

Both are the `recommendation` class in the labelled set, and its `journey` field (M2, M3) tells them apart.

### 2. Places first, events second

- **Places need no fallback to be found by place.** Every place has coordinates and geohashes, so a city or a "near me"
  filter works on all of them. 43% of upcoming events have no `g`, so a city filter on events first needs location
  text matched to cities, which the audit could do only by heuristic.
- **Place density is a curation question; event density is an import question.** The places list is one curated
  list. Events per city follow which feeds are imported: Le Havre and Stuttgart are in the top three because of
  Mobilizon imports and one publisher.
- **Places build what events reuse.** The fields M2 filters on (`cuisine`, `category`, `locality`, `g`) are on the items
  today. M3 adds `start` to the same geo filter.
- **A place already has somewhere to keep its reasons.** Brainstorm and Regulars share one review record for a place,
  kind 34259 ([the places actions contract](../dictionary/food-and-drink-places-actions.md)), and a result's reason
  comes from those reviews. Events have no equivalent yet.

So curator attention goes to Food and Drink Places first, and the index gets geo and the place fields before event
time.

**The case against, for the call.** Events are the denser list in large cities: New York has 336 upcoming events and
23 places within 25 km. If the first journey has to look full in a demo, events may do better. The cost is the
geotag gap and density that depends on which feeds are imported.

### 3. The labelled set leans on them

About half the set is these two journeys: about 30% places recommendation (M2) and about 20% events (M3). Set v0
already is, with 28 and 18 of 93 entries. As the set grows to the 300 to 500 queries the roadmap asks for:

- the M2 and M3 shares stay near 30% and 20%;
- every demo city has queries in both;
- both have `agent` entries (the structured interpretation), not only typed words;
- the other journeys (M1, M4, M5, M7) keep their entries, so a gain on the first two cannot hide a loss elsewhere;
- results are reported per journey as well as overall, as the baseline does.

### 4. What the M2 demo must show

- "best brunch in chicago", or the demo city's equivalent, returns places the asker's people go to, and each card says
  why it is there: who vouched for it, and the trust path when the voucher is someone the asker's people trust but
  the asker does not follow.
- Chips show how the query was read (cuisine or category, the city, "from your people"), and one tap narrows it.
- No listicle and no sponsored result: every card carries its reason.
- Interpretation accuracy meets its target on the set's M2 queries, p95 latency is under one second, and the demo is
  recorded.

The data cannot carry that demo yet, and getting it there is part of the work:

- **Density.** No demo city has more than three places with brunch or breakfast within 25 km, and Chicago has none.
  Chicago's 37 places are mostly restaurants and cafes, and their most common cuisine is Mexican (5). The list holds
  places that accept bitcoin, so a city is as dense as its bitcoin merchants until curators add more.
- **Reasons.** The index holds 9 place reviews, by 3 reviewers. A card can only say "4 people you follow go here" when
  people in the demo account's network have reviewed places in the demo city, as themselves.

Proposed bar: the demo query has at least 10 matching places within 25 km of the demo city's centre, and at least 3
of them are reviewed by people in the demo account's network. Either curators and reviewers bring Chicago to that bar
for "best brunch in chicago", or the demo uses a city and a query the list already answers.

## Consequences

- The M2 engine work (the linker, geo and cuisine filters, the result card with its reasons) is sized for places.
  Event time filters follow in M3.
- Curation is on the demo's critical path: one city needs density and real reviews before the demo can be recorded.
- The labelled set is the measure, per journey. A change to search is judged by whether the M2 and M3 numbers move.
- The 2026-10-24 counts are a snapshot. Count them again before the demo city is picked.

## For the call

1. Places first and events second, or the other way round?
2. The demo city, and whether the demo query stays "best brunch in chicago".
3. The density and review bar above.
