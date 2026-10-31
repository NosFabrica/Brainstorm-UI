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
  are its `p` tags, already filtered through their web of trust (its `min-rank` tag says how far). It is published by the
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

- **Things:** words and the list's kind. `funchal kind:39999` matches the items whose fields mention Funchal.
- **What people wrote:** `from:` each person, as an npub.
- **Records about things:** `to:` each thing, as its `naddr`. The box asks `#a` for it, which is how a review names its
  place.

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

- A result's `link` is its page on brainstorm.world. For an addressable event it is an `naddr`, and a review's `naddr`
  carries its `d`, which is `place:` followed by the place's address. Decode it to match reviews to places.
- Keep one review per person per thing: the newest. The contract says which reviews stand.

### 6. Answer, and say where it came from

- **Who wrote each result,** by name where the profile gives one, and its npub.
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

## Worked example: "restaurants in Funchal rated by podcasters I trust"

Run on 2026-10-31 through `brainstorm_search` on the live relay, as a teammate signed in (observer `b83a28b7…`). The
counts are that day's, and will change as people write.

### The people: podcasters I trust

`podcaster kind:30392` finds the Trusted Lists for the tag "Podcaster" ("someone who hosts one or more podcasts"). The
person's own is `tl-tag-b83a28b7-e5272de9-podcaster`: their observer, a tag first written by `e5272de9…`, 33 members,
`min-rank` 3, published by the key their kind 10040 names for `30392`. Each teammate has one, and so does the house.

**Missing:** the tools can find this list but not read it. `brainstorm_search` gives the start of its content, not its
33 members, and `tapestry_lists` reads only DLists (A6.13.f).

The fallback: `podcaster kind:0` and `podcast host kind:0` give 88 profiles ranked through the person, podcast hosts
among them. That is what each one says of themselves, so say so when you use it.

Other lists with the word don't help:

- a DList header `podcasters` with no items, whose fields name a person and a podcast but no key;
- NIP-51 follow sets and a follow pack called Podcasters (kinds 30000 and 39089), whose members these tools can't read.

### The things: restaurants in Funchal

Food and Drink Places (`39998:b83a28b7…:food-and-drink-places`) is the list for restaurants. Its items are signed by its
curator, `4bded217…`, and carry `name`, `category`, `address` and `locality`. Three searches,
`funchal kind:39999`, `funchal restaurant kind:39999` and `funchal madeira kind:39999`, give 53 places in and around
Funchal.

**Missing:** each result gives the place's name and page, not its `category`, so telling a restaurant from a café or a
shop is a guess from the name (A6.13.f). Say it is.

### The act: rated by

A rating of a place is a kind 34259 review whose `a` is the place's address. Asked both ways:

| Search                                    | Found                                     |
| ----------------------------------------- | ----------------------------------------- |
| `from:` each of the 88, `kind:34259`      | 21 reviews by one person, none in Funchal |
| `to:` each of the 53 places, `kind:34259` | none, under the person's lens             |
| the same with `include:spam`              | none                                      |

The one reviewer among the 88 was the teammate asking, whose own profile says podcaster: their reviews are of books and
of places elsewhere.

**Missing:** the reviews themselves. The relay held nine reviews of places that day, by three people, and none of a
place in Funchal. No list or tool change can answer the question until people review places there, in Brainstorm's
place view or in Regulars.

### Weaker evidence, labelled as such

- `funchal` with `from:` each of the 88, kinds 1 and 30023: six notes, none naming a restaurant.
- `funchal restaurant`, anyone: notes from a Madeira merchants' account announcing places that take bitcoin, and a
  handful of recommendations. They are talk, not ratings, and none is by a podcaster on the list.

### The answer to give

> No podcaster you trust has rated a place in Funchal on nostr yet. Brainstorm's food list has 53 places in and around
> Funchal ([see them](https://brainstorm.world/?q=funchal%20kind%3A39999)), but the only reviews of places on the
> relay are nine, none there. Your Podcaster Trusted List has 33 people, and I can't read who they are with these tools
> yet; the 88 profiles that call themselves podcasters haven't reviewed any place there. A few notes mention Funchal, none a
> restaurant. Reviews you or your circle write in Brainstorm's place view or in Regulars will show up here.

## Later

When D4 agrees the schema of a question's interpretation, `brainstorm_search` also takes that typed question
(A6.13.e), and this topic will say when to use which.
