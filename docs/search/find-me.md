# Answering a find-me question

How an agent answers a question the search box can't take in one search, such as "restaurants in Funchal rated by
podcasters I trust", with the Brainstorm connector's tools: `brainstorm_search` for searches, `tapestry_lists` for lists,
and the guides for what each list and record means. For the language each search is written in, read
[syntax.md](syntax.md) (`ui/search/syntax`).

A question like this is not one search. It names some people, some things, and an act that joins them. The box has no
OR across fields and no join, so the agent runs a few searches and does the join itself. It then says where each result
came from, and says plainly what it couldn't find.

## The method

### 1. Name the parts

Split the question into its people, its things, and the record that joins them:

| Part               | In the example         | Becomes                                       |
| ------------------ | ---------------------- | --------------------------------------------- |
| The people         | podcasters I trust     | a set of pubkeys                              |
| The things         | restaurants in Funchal | a set of addresses (`39999:<curator>:<d>`)    |
| The act that joins | rated by               | an event kind that names a person and a thing |

"I trust" means the person asking. `brainstorm_search` ranks every search through the person signed in, so their web of
trust is already the lens.

### 2. Find the list each word names, before you search words

A word in the question often names a list someone already keeps. Use it before matching the word in text.

- **A kind of person:** the person's own Trusted List for that tag, kind 30392. Search `<tag> kind:30392`. Theirs is the
  one whose `d` starts `tl-tag-<the first 8 hex of their pubkey>-`, as `tl-tag-<observer>-<tagger>-<tag>`. Its members
  are its `p` tags, which its result gives as npubs in `fields.members` (at most 100, with `members_total` past that),
  already filtered through their web of trust (its `min-rank` tag says how far). It is published by the
  key their kind 10040 names for `30392`. Trusted Lists are in the Tapestry protocol's
  `protocols/trusted-lists` and `tapestry/docs/information-for-agents`.
- **A kind of thing:** a DList. `tapestry_lists` with `read: "dictionary"` names the lists Brainstorm shows, and each
  header's `required` and `recommended` tags say which fields its items carry. Restaurants are on Food and Drink Places,
  meetups on Events, books on Books.
- **An act:** the record a list's actions contract names. A rating of a place is a kind 34259 review
  (`dictionary/food-and-drink-places-actions`), a rating of a book is the same kind with `m book`
  (`dictionary/books-actions`). A kind 1111 comment is talk about the thing. It is not a rating, so never count it as
  one.

When no list exists, fall back and say that you did. Profiles whose own words say it (`podcaster kind:0`), ranked
through the person, are the usual fallback. They are weaker: a person's description of themselves, not what the
person's web of trust says about them.

### 3. Write each part as one search

- **Things:** words, the list's kind, and `from:` the key that signs the list's items, since kind 39999 holds every
  list's items. Food and Drink Places' items are signed by `npub1f00dy9eqw53patfe8g96ajw9xq3casvjc25umw78w4963se40djqwxgrq8`
  and Events' by Event Index, `npub1evntrs9lke80t8qrhtkvmnt36985w7nzjehjh7779se7lq8hvmwqg3n44p`. Neither is the key
  that wrote the header. Words match an item's field values (its category, cuisine, town and `t` tags), so
  `from:npub1f00dy… funchal restaurant kind:39999` finds Funchal's restaurants even where the name doesn't say so. Each
  item's result gives its fields in `fields`, as its header names them (a place's `category`, `locality`, `cuisine` and
  `opening-hours`), and `fields.list` names the list.
- **What people wrote:** `from:` each person, as an npub.
- **Records about things:** `to:` each thing, as its `naddr`. The box asks `#a` for it, which is how a review names its
  place.

Put `kind:` in the query rather than in the tool's `kinds`: the `search_link` is built from the query, so a link without
it opens a different search. Quote a word that must match whole (`"bar"`, `"ramen"`): unquoted, the relay forgives
typos, and "bar" finds Barreirinha and "ramen" finds raven. A town is matched as a word in any field, so a book or an
event can carry it too: check it against an item's `fields.locality` or an event's `fields.location` before you count
it.

### 4. Put the join in one search where the grammar allows it

Fields in one filter combine with AND, and values in one field with OR. So several `from:` and several `to:` tokens in
one query ask for "by any of these people, about any of these things":

```
from:npub1aaa… from:npub1bbb… to:naddr1ccc… to:naddr1ddd… kind:34259
```

That is the reviews any of those people wrote of any of those places, in one search of up to 50 results. Split a long
set into several such searches, rather than leaving the join to step 5.

### 5. Join the rest yourself

What the grammar can't join, join from the answers:

- Every addressable result gives its `address`, as `kind:pubkey:d`. A review's `fields.rates` is the address of what it
  rates, so match reviews to places on it. Its `fields.stars` are read as the contract reads them.
- Keep one review per person per thing: the newest. The contract says which reviews stand.

### 6. Answer, and say where it came from

- **Who wrote each result,** by its `author_name`, from their profile, and its npub.
- **Who vouched:** the Trusted List and whose tag it is, the list and its curator, and the observer every ranking went
  through.
- **Links the person can open:** each result's `link`, and each search's `search_link`, so the person can run it in
  the box.
- **What is missing:** each part that came back empty, the search that found nothing, and what would fill it. Never fill
  a gap with a guess presented as a result.

### Rules that save a wrong answer

- **Read records by thing or by person, not by words.** A review's words are the reviewer's own, and the record's kind
  isn't in them: `review kind:34259` finds nothing.
- **An empty join under the person's lens may not be empty.** The lens leaves out authors the person's web of trust
  doesn't reach, and the places contract reads reviews under `include:spam` for that reason. Before saying there are
  none, ask again with `include:spam` in the query, and say whose view each answer is (`ranked_through`).
- **A review's mark has no token.** `kind:34259` brings reviews of books and profiles too. Asking by place (`to:`) keeps
  only places.
- **Few records, then list them all.** When an act is rare, as place reviews are, `kind:34259 include:spam` lists every
  one there is in a search or two. Matching each one's `fields.rates` to your places' addresses is cheaper than a `to:` search per
  place.
- **When the join is empty, still give the things.** Say first that nobody in the person's network did the act, then
  offer what the list has, labelled as not from their network.
- **`at_limit` means there may be more.** The tool gives no next page, so narrow the query, by words, a person or a
  kind, until the answer no longer says it.

### Time

`since:` and `until:` filter on when an event was written, not when it starts, so they can't answer "this weekend".
The tool can't filter by start yet, so search the place and filter what comes back:

- **Event Index items** give their `start`, `end` and `location` in `fields`, and their date written out in `when`,
  which is searched as words: `"31 Oct 2026"`
  picks one day, and `nashville "Oct 2026" -"26 Oct 2026" -"27 Oct 2026"` leaves the rest of a month out.
- **A calendar event** (kinds 31922 and 31923) gives `fields.title`, `start`, `end`, `start_tzid` and `location`, a
  timed one's times as ISO UTC. Search `chicago kind:31922 kind:31923`, keep those whose start and end fall in the
  window in the event's own time zone, and say how many you read when the answer is `at_limit`.

"My network" needs an act. For places the act is a review. Ranking alone changes nothing for a list item, which one
curator signs. For events the act is an RSVP (kind 31925): its `fields.event` is the event's address, and
`fields.status` is `accepted`, `tentative` or `declined`. So `from:` each person with `kind:31925` gives what they
answered, and matching `fields.event` to events' addresses gives the ones they are going to.

### What a result carries

A result gives an author's npub and, from their profile, `author_name`; a kind, a day, an excerpt, a link, and an
addressable event's `address`. For the
kinds an agent joins on it gives `fields`:

- a Trusted List's `members`;
- a list item's fields and `list`;
- a review's `rates`, `mark` and `stars`;
- a calendar event's `title`, times and `location`;
- an RSVP's `event` and `status`.

A result with no `author_name` has a profile that is missing or gives no name: say so rather than invent one. Opening
hours come in OpenStreetMap's syntax
(`Mo-Sa 11:00-24:00`): read them against the time in the place's own time zone, and say that you did. A word no field
holds, like "cozy", is only in reviews and notes: with none, say it is unchecked.

## Worked example: "restaurants in Funchal rated by podcasters I trust"

Run on 2026-10-31 through `brainstorm_search` on the live relay, as a teammate signed in (observer `b83a28b7…`). The
counts are that day's, and will change as people write.

### The people: podcasters I trust

`podcaster kind:30392` finds the Trusted Lists for the tag "Podcaster" ("someone who hosts one or more podcasts"). The
person's own is `tl-tag-b83a28b7-e5272de9-podcaster`: their observer, a tag first written by `e5272de9…`, 33 members,
`min-rank` 3, published by the key their kind 10040 names for `30392`. Each teammate has one, and so does the house.

Its result gives the 33 members as npubs in `fields.members`. With no Trusted List, the fallback would be
`podcaster kind:0`: 88 profiles, ranked through the person, that call themselves podcasters. That is each one's own
word, so say so when you use it.

Other lists with the word don't help:

- a DList header `podcasters` with no items, whose fields name a person and a podcast but no key;
- NIP-51 follow sets and a follow pack called Podcasters (kinds 30000 and 39089), whose members these tools can't read.

### The things: restaurants in Funchal

Food and Drink Places (`39998:b83a28b7…:food-and-drink-places`) is the list for restaurants. Its items are signed by
`npub1f00dy…`. `from:npub1f00dy… funchal kind:39999`, and the same with `restaurant` and with `madeira`, give 51
places, every one with `fields.locality` Funchal. Their `fields.category` says 26 are restaurants, and the rest are
cafés, bakeries, bars and shops.

### The act: rated by

A rating of a place is a kind 34259 review whose `a` is the place's address. Asked both ways:

| Search                                                             | Found                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| `from:` each of the 33 members, `kind:34259`                       | 21 reviews by three of them, seven of places, none in Funchal |
| `kind:34259 include:spam`, every review, matched on `fields.rates` | none of the 51 places                                         |

The three include the teammate asking, who is on their own list.

**Missing:** the reviews themselves. The relay held nine reviews of places that day, by three people, and none of a
place in Funchal. No list or tool change can answer the question until people review places there, in Brainstorm's
place view or in Regulars.

### Weaker evidence, labelled as such

- `funchal` with `from:` each of the 33, kinds 1 and 30023: five notes, none naming a restaurant.
- `funchal restaurant`, anyone: notes from a Madeira merchants' account announcing places that take bitcoin, and a
  handful of recommendations. They are talk, not ratings, and none is by a podcaster on the list.

### The answer to give

> No podcaster you trust has rated a place in Funchal on nostr yet. Your Podcaster list has 33 people; three of them
> have written reviews, none of a place in Funchal. Brainstorm's food list has 26 restaurants in Funchal
> ([see them](https://brainstorm.world/?q=from%3Anpub1f00dy9eqw53patfe8g96ajw9xq3casvjc25umw78w4963se40djqwxgrq8%20funchal%20restaurant%20kind%3A39999)),
> and the only reviews of places on the relay are nine, none there. A few of their notes mention Funchal, none a
> restaurant. Reviews you or your circle write in Brainstorm's place view or in Regulars will show up here.

## Later

When D4 agrees the schema of a question's interpretation, `brainstorm_search` also takes that typed question
(A6.13.e), and this topic will say when to use which.
