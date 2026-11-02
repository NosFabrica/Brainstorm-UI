# Compiling an interpretation to this estate's index

How each field of an [interpretation](https://github.com/NosFabrica/protocols/blob/main/specs/interpretation.md) —
the typed search question, v0 — becomes a query on Brainstorm's own index. The interpretation spec deliberately does
not say how it is compiled (its § 4); this is that document, for this estate. The portable mapping onto plain NIP-01
and NIP-50, which any relay can serve, is a separate one (D4.3) and loses precision where this one does not.

This document **defines** the rules. It builds no compiler: E2.8 implements them, and § 10 is the list of index work
the rules need and cannot invent.

**Companions.** [`syntax.md`](syntax.md) is the search box's own language and the box-token → filter-field table an
agent needs; [`find-me.md`](find-me.md) is how an agent answers a question that takes several searches;
[`../adr/0008-first-search-journeys.md`](../adr/0008-first-search-journeys.md) picks the two query classes the worked
examples in § 9 are drawn from; [`RELAY-ASKS.md`](RELAY-ASKS.md) is the standing register of asks for the relay team,
and § 10 adds to it rather than restating it. The grammar itself is `client/src/lib/searchQuery.ts`, the box's
compiler, which is where the token spellings below come from.

**Verified against the live relay on 2026-11-01**, with read-only NIP-45 COUNTs to `wss://search.brainstorm.world`
(no AUTH, no EVENT, no signing) and read-only searches through `brainstorm_search`. Every count in this document is
from that date; the filter behind each one is beside it. Counts move as people write.

## 0. What a compiled interpretation is

The index is Vespa, and the relay in front of it — [vespa-relay](https://github.com/NosFabrica/vespa-relay), over
[vespa-eventstore](https://github.com/NosFabrica/vespa-eventstore) — is its only door. Nothing in the estate sends
Vespa a query of its own. So:

> **A compiled interpretation is a `REQ` to `wss://search.brainstorm.world`: a list of NIP-01 filter objects, each of
> which may carry a `search` string holding the relay's NIP-50 extension tokens.**

Compiling to the REQ rather than to YQL is what makes this document and D4.3 comparable: both target the same wire
format, and differ only in which tokens they are allowed to use. Where a field has no expression in that wire format,
the rule below says so plainly and § 10 records what the index must gain. A rule never invents a token.

### 0.1 One interpretation, one REQ, one filter per target

Each filter's fields combine with **AND**, the values inside one field with **OR**, and the filters of one REQ with
**OR** — "that is the only OR there is" (`syntax.md`). A union of `targets` is therefore one filter object per target,
and it has to be: a `dlist` target constrains `kinds` and `#z`, an `event-kind` target constrains `kinds` alone, a
`profile` target is `kinds:[0]`. They cannot share a filter object.

Every filter in the REQ carries the observer, because the relay requires one **per filter**, not per REQ: "Each of its
filters must name an `observer:<64-hex>` or waive one with `include:spam`", else the whole subscription is refused
`auth-required` (vespa-relay README). See § 6.

A compiler MUST NOT merge two interpretations of one set into a single REQ. Their filters would OR together, and a
result could then satisfy neither reading's conjunction; worse, nothing would say which reading it answered. It
compiles the first interpretation (spec § 5.7) and MAY compile the rest on demand.

### 0.2 What travels back beside the results

Three of the rules below finish on the client, and one discards information. A compiler MUST therefore return, beside
the events:

- the interpretation it compiled, for E7's chips;
- every target it **dropped**, with which rule dropped it (§ 2.4, § 3.3);
- every **post-filter** still to apply — the place centre and radius (§ 4), the time window (§ 5) — and the fact that
  it was applied after recall rather than by the index;
- that `residual_words` were **not matched** (§ 7).

A compiler that returns only events is wrong even when its query is right: the caller cannot tell a narrow answer from
a narrowed one.

## 1. The field-by-field map

| Interpretation field                              | Becomes                                               | Complete today?                                                               |
| ------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `targets` type `profile`                          | `"kinds":[0]`                                         | yes                                                                           |
| `targets` type `event-kind`                       | `"kinds":[<id>]`                                      | yes                                                                           |
| `targets` type `dlist`                            | `"kinds":[39999]` (or `[9999]`) + `"#z":["<header>"]` | yes                                                                           |
| `targets` type `external`                         | —                                                     | **no** — [G1](#10-what-the-index-must-gain)                                   |
| `filters`                                         | the value as a quoted word in `search`                | **partly** — the property name is dropped, [G2](#10-what-the-index-must-gain) |
| `place`                                           | `"#g":[<covering cells>]` + a distance post-filter    | **partly** — [G3](#10-what-the-index-must-gain) for events                    |
| `time`                                            | nothing on the wire; a window post-filter             | **no** — [G4](#10-what-the-index-must-gain)                                   |
| `pov.observer`                                    | `observer:<64-hex>` in every filter's `search`        | yes                                                                           |
| `pov.scope` mode `default`                        | nothing beyond `observer:`                            | yes, by deferral                                                              |
| `pov.scope` mode `named-group` / `inferred-group` | —                                                     | **no** — [G5](#10-what-the-index-must-gain)                                   |
| `residual_words`                                  | `search` text **only** when nothing else constrains   | **no** — [G6](#10-what-the-index-must-gain)                                   |
| `query`, `place.name`, `time.label`               | never compiled (spec § 5.5)                           | n/a                                                                           |
| `confidence`                                      | never compiled; orders candidates                     | n/a                                                                           |
| `version`                                         | rejected when unknown (spec § 5.1)                    | n/a                                                                           |

## 2. `targets` → the set

### 2.1 `profile`

`{"type":"profile"}` → `"kinds":[0]`.

Worth knowing: the relay follows pointers, so a hit on a Trusted List, a NIP-85 assertion or a NIP-32 label also
serves the record it points at, and "a subject must match the subscription's own filter with the `search` field left
out of the test". A `kinds:[0]` filter therefore admits profiles that arrived as the _subject_ of a list hit and hold
none of the query's words. That is a feature — it is how a search for "podcaster" finds the people a podcaster list
names — but a compiler MUST pass it on as such, because E7 cannot otherwise explain a card whose text matches nothing.

### 2.2 `event-kind`

`{"type":"event-kind","id":"31922"}` → `"kinds":[31922]`. The `id` is the kind number as a string; a compiler parses
it as an integer and rejects a value that is not one.

> `{"kinds":[31922,31923],"search":"include:spam"}` → **51,781** calendar events.

### 2.3 `dlist`

The `id` is a canonical `naddr` (an addressable header) or a canonical `nevent` (an immutable one). Decode it and ask
for the list's **items**, which claim membership with a `z` tag pointing at the header — _child claims parent_
(Content Categories § 1):

- an `naddr` → `#z` holds the header's coordinate `<kind>:<pubkey>:<d>`;
- an `nevent` → `#z` holds the header's event id.

The item kind follows the header kind: a `39998`/`39999` header has `39999` items, a `9998`/`9999` header has `9999`
items (Content Categories § 1.3). A compiler MUST read the kind from the decoded pointer rather than assume the `z`
value begins `39998:` — a header may itself be a declared `39999` (Content Categories § 5).

> `{"kinds":[39999],"#z":["39998:b83a28b7…9450:food-and-drink-places"],"search":"include:spam"}` → **7,984** items.
> (The 2026-10-22 audit counted 7,954 and ADR 0008 counted 7,984 on 2026-10-24; the list is stable and growing.)

This is the whole of "`targets` into list membership": one exact tag match, no extension needed.

**A compiler MUST NOT compile a `dlist` target onto an assertion header** — one carrying `["items","assertion"]`,
whose items are taggings or pinnings rather than things. Content Categories § 5.1 leaves those out of DList search by
default, and a search over them answers with assertions, which is almost never what was asked. Treat it as a producer
error and report the target dropped.

### 2.4 `external` — not compilable today

An `external` target names a NIP-73 **type** (`isbn`, `web`, `podcast:guid`), not an identifier. The box's `site:`,
`isbn:`, `geo:` and `podcast:` tokens all take a _full_ identifier and compile to kind-1111 comments whose `#I`/`#i`
is exactly that id (`syntax.md`). NIP-01 tag filters match exact values, so "every `web:` identifier there is" has no
form. → **G1**.

Until then: **drop the target and report it dropped** (§ 0.2). This is not a corner case. It is the second target of
the first worked example in the interpretation spec, where the external `web` category is what lets a producer widen
a question when the curated list is thin in a city — exactly the condition ADR 0008 measured. The widening the spec
contemplates for a sparse index cannot be compiled here yet.

### 2.5 A union narrows where its parts cannot carry a filter

Because the filters of a REQ are OR'd, a target whose filter matches nothing contributes nothing, and the union
quietly becomes smaller than the reading asked for. That is the mechanism behind § 3.3 and § 11.1.

## 3. `filters` → property matches

### 3.1 There is no property-scoped match

Today the only match available is **the value as a word over everything the item indexes** — its field values and its
name alike. The `property` name has nowhere to go, and the compiler drops it.

> `mexican chicago` with `kinds:[39999]` and the curator as `authors` → 3 places. One is _Pozoleria El Mexicano_,
> whose **name** prefix-matches; the match is not scoped to `cuisine`.

So `{"property":"cuisine","value":"brunch"}` compiles to the word `brunch`, and so does
`{"property":"t","value":"brunch"}`. See § 11.5 for what that costs. → **G2**, the highest-value gap for M2.

### 3.2 Quote a filter value; never quote a residual word

The relay's positive terms are typo- and prefix-tolerant, which is why `mexican` reached a place _named_ "El
Mexicano". Quoting one word is the documented opt-out (vespa-eventstore, search grammar). A filter value is a
constraint the asker meant exactly, so **a compiler quotes it**; a residual word is not a constraint at all, so it is
never quoted — and under § 7 it never reaches the wire anyway.

Several `filters` are a conjunction, and several words in one `search` string are already conjunctive — "every word
must match" — so the conjunction needs nothing but putting them side by side.

### 3.3 A filter against a mixed-type union

`filters` applies to every target (spec § 5.6). The compiler replicates every filter into every per-target filter
object, and **MUST NOT decide for itself that a property does not apply to a target**: spec § 2.2 leaves properties to
the DList header or to the NIP that defines the kind, and the compiler has neither in hand. So a target that cannot
carry the property returns nothing, and by § 2.5 the union narrows to the targets that can.

Of the three things a compiler could do, this is the only correct one:

|                                                | What it does    | Why not                                                                                                                              |
| ---------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| refuse the interpretation                      | answers nothing | the reading is well formed and the other targets are answerable                                                                      |
| drop the filter for that target                | widens it       | returns calendar events that are not brunch, breaking the one invariant every chip rests on: **every result satisfies every filter** |
| **apply it and let the target return nothing** | narrows it      | correct, and the narrowing is reportable                                                                                             |

So the rule is the literal reading of the spec, plus an obligation: **a compiler MUST report every target that
returned nothing while another target of the same union returned rows**, so a front end can say the union narrowed
rather than showing a quietly smaller answer. v0 avoids the whole situation by convention — producers keep mixed-type
unions unfiltered, as the spec's events example does — and § 11.1 is what compiling this found out about that
convention.

## 4. `place` → a geo radius

### 4.1 The rule

1. `geohash` is the **centre**, not the area (spec § 2.3). Decode it (`client/src/lib/geohash.ts`, `decodeGeohash`)
   to a latitude and longitude.
2. Turn `radius_km` into a bounding box around that centre: Δlat = r ⁄ 111.32, Δlon = r ⁄ (111.32 · cos lat).
3. Take the geohash cells that cover the box (`cellsCovering`) and ask for them as `"#g":[…]`. Values in one field
   are OR'd, so one filter asks for the whole area.
4. **Ask for every precision the target's sources use** — see § 4.2, which is where the obvious path breaks.
5. The cells are a **superset** of the circle. Apply the true radius as a distance post-filter on the returned items,
   which carry `lat` and `lon` as their own fields, and pass the centre and radius out so it can be applied (§ 0.2).
   A compiler MUST NOT present the cell set as the constraint.

**An absent `radius_km` means the cell the geohash names, at its own precision** — not a radius the compiler picked.
A producer that means a city sends a radius; in this estate they are ADR 0008's, 25 km for places and 40 km for
events, which is also where the spec's two examples get theirs.

### 4.2 The precisions asked for, which the existing helper gets wrong

Items tag their spot at several precisions at once. A Food and Drink Place carries four `g` values — for example
`["dp3wvjwb3","dp3wvj","dp3wv","dp3w"]`: 9, 6, 5 and 4 characters. **The coarsest a place carries is 4**, though
that is a fact about this one list and not about the index — see the ladders below. A `#g` filter is an exact
tag match, so asking for a 3-character cell matches nothing at all, however well it covers the area:

> `{"kinds":[39999],"#z":[FOOD],"#g":["dp3"],"search":"include:spam"}` → **0**
> `{"kinds":[39999],"#z":[FOOD],"#g":["dp3w"],"search":"include:spam"}` → **32**
> `{"kinds":[39999],"#z":[FOOD],"#g":["dp3wj"],"search":"include:spam"}` → 1

`cellsCovering(view, max)` chooses the finest precision whose cell count fits `max`, and its default `max` is 8. For
Chicago at 25 km — centre `dp3wjzt`, so 41.87782, −87.63039, a box of 41.6532 / −87.9320 / 42.1024 / −87.3288 — the
precision-4 grid needs 12 cells, over that budget, so the helper falls back to precision 3 and returns `["dp3"]`.
**That query returns nothing.** The same at 40 km returns four 3-character cells, and also nothing.

So the rule is not "fit a cell budget". Nor, as the first version of this document said, "clamp to a floor" — a
floor still names one precision, and the ladders below show that no single precision reaches everything. The rule is
**"ask for every precision the target's sources use, as one filter"**. For Food and Drink Places alone, that is
precision 4:

| Radius around `dp3wjzt` | Cells at precision 4                                               | COUNT of Food and Drink Places |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------ |
| 25 km                   | 12 (`dp3k dp3m dp3q dp3r dp3s dp3t dp3u dp3v dp3w dp3x dp3y dp3z`) | **67**                         |
| 40 km                   | 20                                                                 | —                              |

A precision-4 cell is ≈ 19.6 km × 29.1 km at this latitude, so 12 of them hold ≈ 6,800 km² against the circle's
1,963 km². The 67 places that box returns against ADR 0008's **37** within 25 km of the centre is that over-selection
measured: about 1.8× too many, which the distance post-filter of step 5 removes. Twelve or twenty tag values is
nothing to the relay — the 2026-10-22 audit found it drops a filter only around 5,000 — so precision 5 (168 and 414
cells) is possible but pointless once the post-filter runs.

**But a floor is the wrong shape, because sources tag on different ladders.** Calendar events around Chicago, counted
by `g` tag length over the 65 that match `#g:["dp3"]` (2026-11-01):

| `g` tag length      | 2   | 3   | 4   | 5   | 6   | 7   |
| ------------------- | --- | --- | --- | --- | --- | --- |
| events carrying one | 44  | 65  | 44  | 65  | 44  | 65  |

Two populations: 44 events carry every precision from 2 to 7, and **21 carry only the odd ladder** — for example
`["dp3","dp3wt","dp3wt7g"]`, with no 4-character tag at all. Counting only events whose finest `g` decodes inside the
25 km box:

| `#g` asked for                              | cells | events inside the box |
| ------------------------------------------- | ----- | --------------------- |
| `["dp3"]`, what `cellsCovering` sends today | 1     | **45**                |
| the 12 precision-4 cells                    | 12    | **39**                |
| the union of the precision-3 and -4 cells   | 13    | **45**                |

So asking at precision 4 alone **loses six real results** here, and today's coarse single cell does not: it
over-selects — `dp3` spans ≈ 155 km — but step 5's post-filter removes the excess, so recall is right. A compiler
MUST therefore emit the union across precisions and let the post-filter trim, and MUST NOT pick one precision,
however well chosen. Values in one `#g` field are OR'd (step 3), so a union costs one filter, not several.

Which precisions a source writes is **data, not something a compiler can enforce**: `encodeGeohash` in Brainstorm-UI
is module-private, so the client only ever reads `g`. Until the convention is uniform upstream — which is what
[E1.7](https://loom.brainstorm.world/t/E1.7) proposes for the Event Index publisher — a compiler covers the ladders
it has measured and says which it used. Tracked as [Brainstorm-UI#325](https://github.com/NosFabrica/Brainstorm-UI/issues/325).

### 4.3 Events lose recall that places do not

`#g` works for calendar events too:

> `{"kinds":[31922,31923],"#g":["dp3w"],"search":"include:spam"}` → **34**

But only **57.2% of upcoming events carry `g`** at all (ADR 0008), against every place. A `#g` filter on an
`event-kind` target therefore drops about 43% of the events silently, and there is no way round it here: the audit
reached those events by matching their location **text** to cities by heuristic, and spec § 2.3 forbids a compiler
matching `place.name` as text — rightly, since `name` is what the asker said, not what the data holds. The 43% are
simply unreachable by place until the index resolves location text itself. → **G3**.

This is the same evidence ADR 0008 decided on when it put places first, now stated as a compile rule: for an
`event-kind` target a compiler MUST report that the place filter is recall-losing, and how.

### 4.4 `near_observer` alone cannot be compiled

`{"near_observer": true}` with no `geohash` validates against the schema, and no compiler can serve it: the asker's
own location is not in the interpretation, and nothing in the wire format will supply it. A compiler MUST **refuse**
such an interpretation rather than quietly drop the place, under the same reasoning the spec applies to an `npub`
observer — a search that silently stops constraining looks like a working search. A producer that means "near me"
resolves the centre itself and sends a `geohash`; `near_observer` then tells the front end to say "near you". See
§ 11.3.

## 5. `time` → `start_since` / `start_until`

### 5.1 Not `since` / `until`

`time` bounds when the thing **starts**. NIP-01's `since` and `until` bound `created_at`, when the event was
_written_. A compiler **MUST NOT** compile one to the other. The spec says why in one line — "a question about next
weekend's concerts is not a question about notes written next weekend" — and it is the same class of fault as an
`npub` observer: a plausible answer to a different question.

There is no `start` range filter today. `syntax.md`'s `since:`/`until:` are `created_at`; `find-me.md` says flatly
"the tool can't filter by start yet"; and `RELAY-ASKS.md` ask 9, probed 2026-09-03, records 44k calendar events
indexed with no way to range over `start` and no `sort:start`.

### 5.2 So the window is a post-filter, and it is lossy

Today the honest compile is: **put nothing on the wire for `time`, recall as wide as the limit allows, and apply the
window afterwards** on each event's own start — the NIP-52 `start` tag on kinds 31922 and 31923, the `start` field on
Event Index items — resolving date-only starts (kind 31922 and the all-day items) in the event's own timezone, as the
2026-10-22 audit did.

A compiler MUST pass the window out (§ 0.2) and MUST report that it was applied after recall, because recall is
capped: the relay returns at most 5,000 events per REQ and a `limit` caps it lower, newest-first by `created_at`. An
event published long ago for a date inside the window falls off the page before the post-filter ever sees it — the
exact failure RELAY-ASKS 9 names, "an event posted a year ago for next month falls off the page". The post-filter
cannot recover it, and a compiler must not imply otherwise.

### 5.3 The names already agree

RELAY-ASKS 9 asks for "`start_since:` / `start_until:` as epoch" and `sort:start`. The interpretation carries
`time.start_since` and `time.start_until`, in Unix seconds, both inclusive. **The protocol field names and the
standing relay ask are the same names**, arrived at independently. Implementing ask 9 turns this entire section into
two tokens copied straight through, and turns § 9.2's worked example from a wide recall plus client work into one
query. → **G4**, which is ask 9 and not a new ask.

## 6. `pov` → the observer, and the scope

### 6.1 `observer`

`pov.observer` → `observer:<64-hex>` inside the `search` string of **every** filter in the REQ (§ 0.1).

A compiler MUST reject an observer that is not 64 lowercase hex rather than omit the token (spec § 5.2). This is not
defensive tidiness: per `syntax.md`, tested live on 2026-10-30, the relay **accepts** an `npub` and then ranks as
though no observer were given. The schema already rejects it by pattern; the compiler is the second gate.

A filter with no words and no filters still needs the token, so it carries `"search": "observer:<hex>"` alone. That is
the relay's "observer gate": newest first by `created_at`, authors below trust 2 dropped. Note what that means for a
reading with an empty `filters` and empty `residual_words` — the interpretation spec's own events example — in § 9.2.

### 6.2 `scope.mode`

- **`default`** → emit nothing beyond `observer:`. The relay's own default lens (the observer's NIP-85 rank service,
  floor 2) is what `default` resolves to _operationally_, and a compiler MUST NOT read that as a definition of "my
  people": G4.1 owns that question, and spec § 2.5 says a consumer must not assume it means follows. A compiler
  records that it used the deployment default, so that when G4.1 lands the same interpretation compiles differently
  with no schema change — which is the whole reason `scope` is carried as a mode.
- **`named-group` / `inferred-group`** → **no token exists.** `group:<id>` is NIP-29 `#h`, a chat room; compiling a
  DList or a pubkey group to it would be simply wrong, and a compiler MUST NOT. The only mechanism available is to
  read the group's members out — a `30392`'s `p` tags, or a DList's member items — and put them in `authors`, which
  constrains **who wrote the result**. For a DList-item target that does nothing at all: every item of a list is
  signed by one curator key. → **G5**.

### 6.3 Where the trust actually lands: the second query

This follows from § 6.2 and is the part a compiler cannot skip for the first journeys.

For a `dlist` target, `pov` is nearly inert on the items themselves. One key signs all 7,984 Food and Drink Places,
so neither `authors` nor the observer's ranking distinguishes one place from another — "ranking alone changes nothing
for a list item, which one curator signs" (`find-me.md`). But ADR 0008 § 4 requires each card to say _why_ it is
there: who vouched for it, and the trust path to them. So an interpretation over DList items compiles to **two
queries**:

1. **the set** — §§ 2–5 and 7, as above;
2. **the act** that carries the trust, named by the list's actions contract. For Food and Drink Places it is a kind
   34259 review whose `a` is the item's address (`../dictionary/food-and-drink-places-actions.md`), joined on each
   review's `rates`; for events it is a kind 31925 RSVP, joined on its `event` (`find-me.md`).

```jsonc
["REQ", "acts", { "kinds": [34259], "#a": ["<item addresses>"], "search": "observer:<hex> include:spam" }]
```

`include:spam` on the act query is deliberate. The observer lens is "a set filter, not a ranker" (RELAY-ASKS,
2026-09-03), so gating the reviews at the relay hides the very reviewers whose trust path the card exists to show;
trust is applied on the client from per-author scores, as the results page already does, and labelled. With nine place
reviews in the whole index (ADR 0008), the cheaper form is `find-me.md`'s "few records, then list them all": one
`{"kinds":[34259],"search":"observer:<hex> include:spam"}` and match `rates` locally.

A compiler MUST emit both queries, or say it emitted only the first. A set with no reasons is not the journey.

## 7. `residual_words` → inside the set, which is not possible yet

### 7.1 The finding

Spec § 2.6 says a compiler matches residual words "inside the set the other fields select — as text, or by embedding".
On this index, today, neither holds:

- **There are no embeddings.**
- **The text match is conjunctive and mandatory.** Every word must match (`syntax.md`; vespa-eventstore's grammar has
  `zap ⚡` requiring both). A residual word that no item holds does not rank the set — it **empties** it.

Verified on the live relay, 2026-11-01, with the word the spec's own first example puts in `residual_words`:

| Search                                     | Found                  |
| ------------------------------------------ | ---------------------- |
| `from:npub1f00dy… chicago kind:39999`      | places (5, `at_limit`) |
| `from:npub1f00dy… best chicago kind:39999` | **0**                  |

Compiled literally, the interpretation spec's § 6.1 returns nothing.

### 7.2 The rule

> **`residual_words` compile into the `search` string only when nothing else in the interpretation constrains it** —
> `filters` empty, no `place`, no `time`. Then they _are_ the query, and BM25 × web of trust × recency answers it.
> Otherwise they MUST NOT go on the wire as terms. They travel back in the echo as residual chips (§ 0.2, E7), and
> the ranking the engine already applies is what answers them.

The reason is not taste. With structure present a mandatory term can only shrink a set the structure selected
correctly, and the case § 2.6 itself describes — "nothing in the data is called best" — is precisely the case where it
shrinks it to zero. The spec and ADR 0008 agree about where "best" is answered: ranking through the observer's web of
trust is the engine's job, not a filter's.

→ **G6**: an optional, scoring-only term — match it to rank, do not require it — or embeddings. With either, § 2.6
becomes compilable as written. Without, a compiler is choosing between a wrong answer and no answer, and this rule
picks the answer.

### 7.3 Negation is lost, and a compiler cannot see it

The box accepts `-word` and the relay honours it as an exclusion. v0 has nowhere to carry it (spec § 8.3), so a
`-chain` the asker typed arrives as the bare word `chain` in `residual_words`. The rule in § 7.2 then drops it,
turning an exclusion the asker asked for into no constraint at all — and no compiler can tell that `chain` from
`best`.

Dropping it is still the right v0 behaviour: a dropped exclusion widens the answer, where compiling it as a required
word empties it. But a compiler MUST report residual words as unmatched (§ 0.2) precisely because some of them were
constraints. § 8.3 is not cosmetic, and § 11.4 records it for D4.4.

## 8. The fields that are never compiled

`query`, `place.name` and `time.label` are display and diagnostics only, and a compiler MUST NOT derive a constraint
from any of them (spec § 5.5). `confidence` orders candidates within one set and is never compiled (§ 2.7). `version`
is checked, and an unknown one is rejected rather than guessed at (§ 5.1). All four travel back out for E7.

## 9. The two worked examples, compiled

The interpretation spec's § 6 examples, end to end. The list coordinate below is this estate's real Food and Drink
Places header; the spec's `naddr` is illustrative and decodes to a list that does not exist.

### 9.1 "best brunch in chicago" (spec § 6.1, first reading)

```jsonc
[
  "REQ",
  "s",
  {
    "kinds": [39999],
    "#z": ["39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:food-and-drink-places"],
    "#g": ["dp3k", "dp3m", "dp3q", "dp3r", "dp3s", "dp3t", "dp3u", "dp3v", "dp3w", "dp3x", "dp3y", "dp3z"],
    "search": "\"brunch\" observer:7d2a4f6c…e935",
  },
]
// plus the act query of § 6.3, over the addresses this returns
```

What each rule did, and what it cost:

| Field                      | Compiled to              | Lost                                                                                                             |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| target `dlist`             | `kinds` + `#z`           | nothing                                                                                                          |
| target `external: web`     | —                        | **the whole target**, dropped and reported (§ 2.4, G1)                                                           |
| `cuisine` = `brunch`       | the quoted word `brunch` | the property name: this is identical to the second reading's `t` = `brunch` (§ 3.1, G2)                          |
| `place` 25 km              | 12 precision-4 cells     | the circle: 67 places in the box against 37 in the radius, so a distance post-filter runs on `lat`/`lon` (§ 4.2) |
| `pov.default`              | `observer:`              | nothing; `default` stays G4.1's                                                                                  |
| `residual_words: ["best"]` | nothing on the wire      | the word, deliberately — on the wire it returns 0 (§ 7.1)                                                        |

> With the filter: `{"kinds":[39999],"#z":[FOOD],"#g":[the 12 cells],"search":"brunch include:spam"}` → **0**.
> With `mexican` in its place → **10**.

The zero is not the compiler. ADR 0008 counted no place in Chicago with brunch or breakfast on 2026-10-24, and the
compile rules reproduce that honestly instead of hiding it in a looser match. That is what ADR 0008's demo bar — ten
matching places and three reviewed by the asker's network — is there to fix, with curation rather than query work.

### 9.2 "what's on this weekend in chicago" (spec § 6.2)

Three targets of two types, an empty `filters`, empty `residual_words`, a place and a time. One REQ, three
filters. The cells are shown at a single precision for brevity; § 4.2's union rule applies:

```jsonc
["REQ","s",
  {"kinds":[31922], "#g":[the 20 precision-4 cells for 40 km], "search":"observer:7d2a4f6c…e935"},
  {"kinds":[31923], "#g":[the same 20 cells],                  "search":"observer:7d2a4f6c…e935"},
  {"kinds":[39999], "#z":["39998:b83a28b7…9450:events"],       "search":"observer:7d2a4f6c…e935"}
]
// then: keep events whose own start falls in [1794031200, 1794203999], in the event's timezone
```

This one compiles cleanly and still answers badly, for three reasons worth stating plainly:

1. **The time constraint is not in the query at all** (§ 5). The window runs on the client, over a page the relay
   ordered newest-first by `created_at` and capped — so an event published in August for this weekend may never be
   recalled. G4 fixes this and nothing else does.
2. **With no words and no filters, the order is the observer gate's**: newest first by publication, not by relevance
   and not by start time. For "what's on this weekend" that is the wrong order, and no token in the grammar fixes it
   (`sort:start` is part of G4).
3. **The 31922 and 31923 filters drop about 43% of events**, the ones with no `g` (§ 4.3, G3). The `39999` Event Index
   filter does not — those items carry location in their fields — so the union's two halves have different coverage,
   which a compiler must report rather than average.

`filters` is empty here because the spec's own convention keeps a mixed-type union unfiltered. § 11.1 is what happens
when it is not.

## 10. What the index must gain

For E2.8 and the relay team, in the order M2 and M3 need them. Each is index or grammar work in vespa-eventstore and
vespa-relay. **None of it needs a different engine:** Vespa does field-scoped matching, numeric range and vector
search natively, and this estate uses almost none of it.

|        | Gap                                                                                                                             | Needed by         | Without it                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| **G2** | **A property-scoped match** — a filter on a named item field, not a word over all of them                                       | M2, and all of D4 | `property` is dead weight; two readings that differ only by property compile identically (§ 11.5) |
| **G6** | **An optional, scoring-only term** (a term that ranks but is not required), or embeddings                                       | M2                | § 2.6 of the spec is not implementable; residual words are dropped (§ 7)                          |
| **G4** | **A `start` range and `sort:start`** — this is [RELAY-ASKS](RELAY-ASKS.md) ask 9, whose proposed names are already the schema's | M3                | time never reaches the index; a lossy client post-filter over a capped page (§ 5.2)               |
| **G3** | **Location text resolved to geo at index time**                                                                                 | M3                | 43% of events are unreachable by place, and `place.name` may not be matched as text (§ 4.3)       |
| **G1** | **A NIP-73 match by type**, not only by exact identifier                                                                        | D4 widening       | `external` targets are dropped; the spec's sparse-index widening cannot be compiled (§ 2.4)       |
| **G5** | **Scope narrowing** — rank or gate through a named group's members                                                              | G4.1's answer, M6 | `named-group` and `inferred-group` have no compilation (§ 6.2)                                    |

One smaller one, already handled by a client post-filter and not worth an ask on its own: an exact radius rather
than a cell superset (§ 4.2 — items carry `lat`/`lon`, so this costs recall nothing).

And one that is **not** an index gap and **not** handled by a post-filter: which precisions a compiler asks for.
`cellsCovering` picks a single precision, and § 4.2 shows that no single precision reaches every source — a
post-filter can trim over-selection but cannot recover an event the filter never matched. That is a bug in
`client/src/lib/geohash.ts`, tracked as
[#325](https://github.com/NosFabrica/Brainstorm-UI/issues/325); the upstream half, making the convention uniform, is
[E1.7](https://loom.brainstorm.world/t/E1.7).

## 11. What compiling found out about the schema

Recorded for **D4.4**, which owns versioning and breaking changes. **Nothing here changes v0.** Writing a compiler
before freezing the breaking-change rule was the point of doing D4.2 before D4.4, and this is what it bought.

1. **Open question 4 is forced, and the wire format already has the slot the schema lacks.** Compiling a union
   requires one filter object per target (§ 0.1) — not as an optimisation but because the types constrain different
   fields. So **per-target filters are free on the wire**; it is only the schema that has nowhere to say which target
   a filter belongs to. v0's convention — producers keep mixed-type unions unfiltered — is a workaround for a
   limitation the compile target does not have. The v0 rule in § 3.3 keeps the invariant that matters and makes the
   narrowing reportable; a later revision should carry the filter on the target.
2. **§ 2.6 is not compilable as written, and it is not an open question.** It is a normative sentence — residual words
   matched "as text, or by embedding" inside the selected set — that this index cannot honour, because its only text
   match is mandatory (§ 7.1, verified: `best` takes a working query to zero). Either § 2.6 softens to say a consumer
   that cannot match optionally carries the words back instead, or G6 lands. The spec's intent is right, so G6 is the
   better answer — but D4.4 should know that § 2.6 currently promises more than a conforming consumer can deliver.
3. **A `place` with only `near_observer` is schema-valid and uncompilable.** The schema's `anyOf` admits
   `{"near_observer": true}` with no centre, and no compiler can supply the asker's location from the interpretation
   (§ 4.4). Either `near_observer` requires a `geohash` beside it — making it purely the display flag the prose
   already implies — or the spec says the asker's location travels out of band. Not in § 8.
4. **Open question 3 (negation) has a compile cost, not only a semantic one.** A stripped `-word` is indistinguishable
   from a word like `best`, so this compiler silently widens where the asker narrowed (§ 7.3). That raises it above
   "the sense is lost in `residual_words`": the sense is lost _and inverted_.
5. **Two readings can compile identically, which bears on scoring interpreters against each other.** The spec's two
   § 6.1 readings differ only in `filters[0].property`, which this compiler drops (§ 3.1) — so they are the same
   query, offered at confidence 0.78 and 0.41. That is not a schema fault; it is evidence that **G2 is what makes
   `property` mean anything**, and a warning for D4's premise that two interpreters can be scored against each other:
   an index that cannot tell two readings apart cannot score them apart either.

One thing compiling did **not** find: no field of v0 turned out to be missing or misnamed for this index, and the
names it uses line up with what the relay team had already asked for independently (§ 5.3). The schema is the right
shape. It is the index that is behind it.
