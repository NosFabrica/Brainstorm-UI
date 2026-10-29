# Search eval

A labelled set of search queries, and a runner that measures today's search against it.
The set says what a good answer to each query contains. The runner asks the search relay
what the Top page asks, scores the answer, and writes the numbers down, so a change to
search can be judged by whether the numbers move.

- `queries.json`: the labelled set (v1, 317 entries).
- `../../../scripts/search-eval/baseline.mjs`: the runner. Node 22 or newer, no dependencies.
- `baseline-YYYY-MM-DD.json` and `.md`: a run's results, and what they say.
- `../../../scripts/search-eval/checkSet.mjs`: what the set must keep as it grows, which `npm test` checks.

## The set

The set leans toward the first journeys on the search roadmap, as
[ADR 0008](../../adr/0008-first-search-journeys.md) decided: about 30% places recommendation
(M2) and 20% events (M3). v1 has M1 66, M2 95, M3 61, M4 32, M5 32 and M7 31 entries. Each entry
belongs to one journey and one class.

`npm test` fails when the set drifts (`checkSet.mjs`):

- an id is used twice, or an entry breaks the schema below;
- M2 leaves 25 to 35% of the set, or M3 leaves 15 to 25%;
- a demo city (Chicago, New York, San Francisco, Austin, Funchal, Nashville) has no M2 or no M3
  entry;
- M2 or M3 has no `agent` entry.

| Journey | What it covers                                                                           |
| ------- | ---------------------------------------------------------------------------------------- |
| M1      | Navigational and lookup: a named person, place, book, app or event, or a fact about one. |
| M2      | Recommendation over places: "bars in Funchal".                                           |
| M3      | Events: what is on, where, when.                                                         |
| M4      | Social: what the reader's people think, like or do.                                      |
| M5      | Exploratory: a topic with no single answer ("football", "podcast").                      |
| M7      | Long tail and meaning: words no field holds ("cozy late-night ramen").                   |

| Class            | Meaning                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `recommendation` | Asks for good things of a kind, usually with a place or a time.                                              |
| `exploratory`    | A topic to browse.                                                                                           |
| `social`         | Asks through the reader's network.                                                                           |
| `navigational`   | Wants one known thing: a person, a place, an app.                                                            |
| `lookup`         | Wants a fact or a record: hours, a book, a named event.                                                      |
| `agent`          | Not words: the structured interpretation an agent or a query parser would send. Not run by the baseline yet. |

### Entry schema

```json
{
  "id": "m2-bars-in-funchal",
  "query": "bars in Funchal",
  "class": "recommendation",
  "journey": "M2",
  "expect": {
    "categories": ["places"],
    "filters": { "place": "Funchal", "property": { "category": "bar" } },
    "results": ["39999:<pubkey>:osm-node-10295182582", ["<copy 1>", "<copy 2>"]],
    "absent_categories": ["people"]
  },
  "notes": "Why these ids, and what makes the query hard.",
  "as_of": "2026-10-22",
  "run": false
}
```

| Field                      | Required | Meaning                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | yes      | Stable, unique. Journey prefix and a slug.                                                                                                                                                                                                                                                                |
| `query`                    | yes      | The words as typed. For `agent` entries, an object instead (see below).                                                                                                                                                                                                                                   |
| `class`, `journey`         | yes      | From the tables above.                                                                                                                                                                                                                                                                                    |
| `expect.categories`        | yes      | Where the answer belongs: a Top page section (`people`, `notes`, `articles`, `events`, `live`, `media`, `music`, `shop`), a list kind with a look of its own (`places`, `books`, `github`), or a tab the Top page does not show (`apps`, …).                                                              |
| `expect.filters`           | no       | What the query constrains. `place`: a city, as the data spells it. `time`: one of `today`, `tonight`, `this weekend`, `this week`, `next 7 days`, `this month`, `next 30 days`, `upcoming`. `property`: field and value pairs as stored on the item, such as `{"cuisine": "pizza"}`.                      |
| `expect.results`           | no       | Ids that must appear in the top ten of their category. A string is one id. An array is one thing published more than once (a meetup on three calendars): any one copy counts. Ids are 64-hex pubkeys for people, and `kind:pubkey:d` addresses for list items (39999) and calendar events (31922, 31923). |
| `expect.absent_categories` | no       | Categories that must show nothing: "bars in Funchal" has no People.                                                                                                                                                                                                                                       |
| `notes`                    | yes      | Plain words: why these ids, what is hard, and why `results` is left out when it is.                                                                                                                                                                                                                       |
| `as_of`                    | no       | The day time-relative expectations were checked. Events expire; an entry past its `as_of` needs new ids.                                                                                                                                                                                                  |
| `run`                      | no       | `false` for entries the runner skips (the `agent` entries).                                                                                                                                                                                                                                               |

An `agent` entry's `query` is an object with any of `categories`, `place`, `time`, `property`,
`words` (what is left as text), `by` (`"my network"`) and `open` (an opening-hours constraint).

### Expected results are real, checked ids

Every id in `results` was looked up on `wss://search.brainstorm.world` and seen to exist,
and the runner checks again on every run (`on_relay` in the results file). Never write an
id from memory or invent one to make a query scoreable. When no id can be fixed (too many
right answers, the answer depends on the reader, the data has none), leave `results` out
and say why in `notes`; such entries are scored by category, filters and absences.

## Running the baseline

```sh
node scripts/search-eval/baseline.mjs                    # house observer, writes docs/search/eval/baseline-<today>.json
node scripts/search-eval/baseline.mjs --observer <hex>   # through someone else's web of trust
node scripts/search-eval/baseline.mjs --out /tmp/run.json --only m2-bars-in-funchal,m1-piranesi
node scripts/search-eval/baseline.mjs --print-filters    # show the REQs, send nothing
```

Other options: `--queries <path>`, `--relay <url>`, `--hub <url>`, `--pause <ms>` (1500 between
queries), `--timeout <ms>` (15000 per REQ), `--no-dlist`, `--full` (keep every section's top 10,
for reading a run locally; see below).

With no `--observer`, the runner finds the house observer the way the app does: the `_` name
in `https://brainstorm.world/.well-known/nostr.json` (`services/trustSource.ts`). A full run
takes about five minutes and sends about 130 requests; the results file records the exact
count (`meta.requests_sent`). The list setup reads the search relay and the hub (dcosl) side by
side, on a socket each; the expected-id check asks ten ids per REQ; then the queries go one at a
time on the search relay's socket, a pause apart, with up to three tries on a fresh socket
after an error. It
also reads the house observer once over HTTPS. It only reads: REQ and COUNT, never EVENT. The
search relay is shared with production, so keep the pause.

The results file keeps, for each query, every section's counts and timings, and the top 10
only for the sections the entry names (`expect.categories` and `expect.absent_categories`);
`--full` keeps them all. `meta.app_commit` is the commit of the checkout the runner ran from,
whose Top page it mirrors.

The format check covers these files, so format them before committing:

```sh
npx prettier --write docs/search/eval/
```

Then write the `.md` beside the results by hand: the headline numbers, the table, and the
failures worth reading.

## What the runner mirrors

**The Top page REQ.** One REQ with one filter per section, the same kinds, limits and sorts
as `TOP_SECTIONS` in `components/search/ComposedResults.tsx` and `bandKindsForTab` in
`services/search.ts` (index.html's head start sends the same REQ; the runner warns if it
drifts from it). Words are tidied as `lib/searchQuery` tidies them: a token of punctuation
alone, like `&`, is dropped. Each filter's search is `<words> observer:<hex>`, with
`sort:recent` for notes, events, live and media. Events come back routed by kind.

**The client-side gates.** Happening keeps only upcoming events, soonest first
(`filterEventsByWhen`). Media drops kind-1063 files that are not pictures, video or sound.
The Listen row keeps tracks with a title and a playable URL. The Shop row keeps parsed
listings, two per seller, four in all.

**The list previews.** A list's preview shows only when its concept is in the Dictionary, which
the runner reads as the app does (`lib/dictionaryConcepts`, mirrored in `mirror.mjs`): the
house's taggings with the curator tag say who curates, and the curators' own headers that point
at themselves are the concepts, read from the tag hub. The house is the server's NIP-05 `_`,
whatever `--observer` says. The results file records what it found (`dlist.dictionary`).

Places, Books and GitHub accounts are then matched in the browser, over two sets of items
(`services/dictionary.ts`, `components/items/ListKindSearch.tsx`). First, what the search relay
returns for the words (`{kinds:[39999,9999], "#z":[…], search:"<words> include:spam", limit:200}`),
which the Top page asks once its people have answered. Then what the page loaded and those don't
repeat: up to 500 items from the search relay and 500 from the tag hub (dcosl), merged, newest
version of each, filed under the governing header and the community header. Words are matched as
`lib/listSearch` matches them: every word left after filler and the list's own name must equal
a whole word in what the card shows (a place's name, category, cuisine and town; a book's
title alone on the Top page; a GitHub handle and description). A property filter matches any
value of a tag an item carries more than once, such as a place's cuisines.

For each expected list item the runner records whether it was in what the page loaded, whether
the relay's matches returned it, whether the words matched it, and, as a counterfactual, where
the relay ranks it through the observer's lens (`search:"<words> observer:<hex>"`). The page
keeps match order rather than the relay's ranking; the probe shows what ranking would buy.

**Left out, on purpose.**

- The verified-line floor, near-duplicate collapsing, and visited-profile pinning: they need
  per-author scores and on-device history.
- The People strip's other sources (tag carriers, handle pointers) and the Listen row's other
  sources (Wavlake, Podcast Index).
- Trust and rating order inside the list previews: the runner keeps match order.
- The head start on a cold page load sends the query as typed rather than tidied. They differ
  only for a token of punctuation alone, like `&`. The runner sends what a search from the box
  sends.
- Per-section time to EOSE: the relay answers one EOSE for the shared REQ, so each section
  reports its first and last event, and the query reports the shared EOSE.

## Metrics

Computed over the entries that ran.

| Metric                            | Definition                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Category hit rate                 | Of all (entry, expected category) pairs, the share where the category shows at least one result. A category the Top page does not show is a miss.                                                                                                                                                    |
| All-categories hit rate           | The share of entries where every expected category shows something.                                                                                                                                                                                                                                  |
| Recall@10                         | Per entry with `results`: the share of expected results found in the top ten of any category. Averaged over those entries.                                                                                                                                                                           |
| Absent-category violations        | Count of (entry, absent category) pairs where the category showed something, out of all such checks.                                                                                                                                                                                                 |
| Filter precision@10               | Where a filter can be read off the top ten: share of places in the named town (`locality`), share of places with the property, share of events whose location names the town, share of events in the time window. Averaged per entry, then over entries. Undefined when the category showed nothing. |
| Time to first event, time to EOSE | Milliseconds from sending the REQ. Reported as p50 and p95 over queries.                                                                                                                                                                                                                             |

Windows use the runner's timezone, as the app uses the reader's; the results file records it.

## Adding a query

1. Pick the journey and class. Keep the weighting near 30% M2 and 20% M3.
2. Find the right answers on the relay. Use `include:spam` to see whether a thing exists at
   all, whoever published it.
3. Put their ids in `results` only if a careful person would say each must be in the top ten.
   Group copies of one thing in an array. Otherwise leave `results` out and use `filters`.
4. Add `absent_categories` only for a category that would be wrong, not just unlikely.
5. Write `notes`: why these ids, and what makes the query hard. Add `as_of` for anything that
   expires.
6. Run it alone with `--only <id> --out /tmp/check.json` and confirm `on_relay` is true for
   every id.
