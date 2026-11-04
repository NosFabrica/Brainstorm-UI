# Search syntax

What can be typed into Brainstorm's search box, and what an agent has to do to ask the search relay the same thing. For a person searching brainstorm.world and for an agent building a search for one.

The box's half is the sheet behind the `?` button beside Filters on the results page (or `?` pressed anywhere outside the box): `client/src/components/search/SearchSyntaxSheet.tsx`. This file is its written twin, and `SearchSyntaxSheet.test.tsx` fails when the two list different tokens. The grammar itself lives in `client/src/lib/searchQuery.ts`, a port of the relay's own operator field.

## Searching your own notes

Type `from:` and your name, pick yourself from the list (the box writes your npub), add any words, then open the Notes tab. The profile menu on your own page does the same with "Search your posts".

## In the search box

Everything combines, in any order: `#nostr from:npub1… since:2026-01-01 sort:recent`. Every word must match. There is no OR, no `+` and no grouping. The prefixes are filters, not words: the box lifts them out of the query before the text is matched.

### Words

| Type             | What comes back                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Austin Texas`   | Both words, anywhere in the event. Matching reaches inside words and forgives typos, so `lora` also finds "flora"; quote a word to stop that. |
| `"exact phrase"` | Those words, in that order.                                                                                                                   |
| `-word`          | Everything except results with that word.                                                                                                     |

### People

Start typing a name after the colon and pick from the list; the box writes the key.

| Type          | What comes back                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `from:npub1…` | Only what that person wrote.                                                                                                                           |
| `to:npub1…`   | Only events that mention them.                                                                                                                         |
| `to:note1…`   | Only events that cite that event: its replies, its reactions, the labels written on it. An `naddr1…` asks the same about an article, an app or a list. |

### Days

Whole days, in your own timezone.

| Type               | What comes back                              |
| ------------------ | -------------------------------------------- |
| `since:2026-08-06` | Written that day or after.                   |
| `until:2026-08-06` | Written that day or before, the whole of it. |

### Topics, labels and groups

| Type               | What comes back                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `#hashtag`         | Events tagged with that topic, plus the labels and the comments written on it. On the Media tab, `#vine-archive` lists classic Vines. |
| `label:review/app` | The NIP-32 labels carrying that mark: the labels themselves, not what they name. Add a `to:` to read the ones written on one thing.   |
| `group:id`         | A NIP-29 relay group. Type a few letters and pick one.                                                                                |

### Things people commented on

Comments about something that lives outside Nostr, found by what it is (NIP-73).

| Type                         | What comes back                |
| ---------------------------- | ------------------------------ |
| `site:example.com/page`      | A web page.                    |
| `isbn:9780593330005`         | A book.                        |
| `doi:10.1000/182`            | A paper.                       |
| `geo:u4pruyd`                | A place, as a geohash.         |
| `isan:0000-0000-401A-0000-7` | A film.                        |
| `podcast:guid:guid`          | A podcast feed.                |
| `podcast:item:guid:guid`     | One episode of it.             |
| `podcast:publisher:guid`     | Everything from its publisher. |

### Kinds

They narrow whatever tab you are on rather than replacing it.

| Type         | What comes back                                         |
| ------------ | ------------------------------------------------------- |
| `kind:30023` | Only events of that kind.                               |
| `kind:video` | Videos, long and short (kinds 21, 22, 34235 and 34236). |
| `spec:`      | The NIP definitions themselves (kind 30817).            |

### Ranking and order

| Type                 | What it does                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `sort:recent`        | Newest first, ignoring how well anything matched.                                          |
| `sort:rank`          | Most trusted authors first; `sort:rank:asc` turns it upside down.                          |
| `sort:followers`     | Most followed authors first.                                                               |
| `sort:text`          | Text match alone, trust not consulted. With none of these you get the default, best match. |
| `observer:npub1…`    | Rank through that pubkey's web of trust instead of your own. Signing in does this for you. |
| `include:spam`       | Lift the trust floor: also show what your web of trust does not rank.                      |
| `filter:rank:gte:50` | Raise the floor instead: drop authors ranking below that, 0 to 100.                        |

### Only on this page

The relay has no hops and no verification of its own, so these are applied in the page, to what came back.

| Type             | What it does                       |
| ---------------- | ---------------------------------- |
| `trust:verified` | Only authors this page can verify. |
| `reach:follows`  | Only people you follow.            |

## For an agent asking the relay directly

An agent can build a brainstorm.world link (`https://brainstorm.world/?q=…`) and keep the box's syntax whole, since the page does the work below. An agent sending its own `REQ` to `wss://search.brainstorm.world` has to do that work itself, because the relay reads only part of what the box accepts. Both traps below were tested against the live relay on 2026-10-30.

**The prefixes become NIP-01 filter fields, not search text.** Put them in the search text and the relay ignores them as unknown `key:value` words: `from:<npub> bitcoin` came back with nobody's notes filtered out.

| Box token                                              | Filter field the page sends                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `from:npub1…`                                          | `authors`, as hex                                                                           |
| `to:npub1…`                                            | `#p`                                                                                        |
| `to:note1…` / `to:nevent1…`                            | `#e`                                                                                        |
| `to:naddr1…`                                           | `#a`                                                                                        |
| `since:` / `until:`                                    | `since` / `until`: 00:00:00 and 23:59:59 of that day, in the reader's timezone              |
| `#hashtag`                                             | `#t`, plus `#l`, plus kind 1111 comments whose `#I` or `#i` is the tag, each its own filter |
| `label:`                                               | kind 1985 with `#l`                                                                         |
| `group:`                                               | `#h`                                                                                        |
| `site:`, `isbn:`, `doi:`, `geo:`, `isan:`, `podcast:…` | kind 1111 comments whose `#I` or `#i` is that id                                            |
| `kind:`                                                | `kinds`                                                                                     |

**What stays in the `search` string:** words, `"phrases"`, `-words`, `sort:`, `filter:rank:gte:`, `include:spam`, `observer:`, and `language:pt` or `language:es`, a stemming hint the relay accepts that the box does not document.

**Rules the relay keeps:**

- `observer:` takes the 64-hex pubkey. An npub counts as no observer at all. The box converts it for you; the relay does not.
- A search naming neither an `observer:` nor `include:spam`, on a connection not signed in with NIP-42, is refused with `auth-required`.
- `trust:verified` and `reach:follows` mean nothing to the relay.

**Joins:** fields in one filter combine with AND, values in one field with OR (`authors` A or B), and the filters of one `REQ` with OR. That is the only OR there is.

The relay's own references: vespa-relay's README, "The search box's own language" and "Search"; vespa-eventstore's README, "Search grammar".
