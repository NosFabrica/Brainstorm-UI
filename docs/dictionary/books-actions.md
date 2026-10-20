# Books: the actions contract

One list, more than one app. The Books list
(`39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books`, items of kind 39999 signed by the
Unbnd librarian) is shown by Brainstorm's tier-three book view (`client/src/components/items/BookView.tsx`) and by
Unbnd ([unbnd.ink](https://unbnd.ink)), an app built for books.

**The rule: how a book looks is each app's own. What a person does to a book is not.** Anything a person signs about a
book in one app must be read, shown, edited and removed correctly by the other. A person who rates a book on Unbnd
finds that rating on Brainstorm, and the reverse. Neither app leaves the other's record wrong, doubled or stripped.

This document binds both apps. MUST, SHOULD and MAY are used as in RFC 2119. It follows the places contract
([food-and-drink-places-actions.md](food-and-drink-places-actions.md)) wherever a book and a place behave alike, and
says so where they differ. Section 9 says where each app stands today, and section 10 lists what the team still has to
confirm.

## 1. What is shared, and what is free

| Shared: must match in both apps                                        | Free: each app's own                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| How a book is named (its address)                                      | Layout, type, colour, motion                                    |
| The review record: its kind, its tags, its scale of stars              | The order reviews are listed in                                 |
| Which reviews stand: one person, one review of a book                  | How a reviewer is drawn (face, ring, name)                      |
| Where a review is published and read                                   | Enrichment from elsewhere (Open Library, the Internet Archive)  |
| Editing replaces; removing removes                                     | Actions of your own that are not reviews (section 7)            |
| Never destroying a field you do not draw                               | Signals of your own drawn from reviews, within section 8's rule |
| The star value shown for a book, for the same person and the same lens | Whether a star value or a count shows at all                    |
| The credit for the data (Open Library)                                 | Whether words are asked for beside stars (section 10)           |

If something a person can do to a book is not in this document, it belongs here before it ships in either app.

## 2. The book

- A book is named by its address, `39999:<librarian pubkey>:<d>`, where `d` is the Open Library work id in lower
  case with an `ol-` prefix (`ol-ol19722168w`). Everything a person signs about a book names it by this address, never
  by an event id: the librarian signs every book again whenever its record is refreshed, so ids change and the address
  does not.
- A link to a book SHOULD be by address (an `naddr`), for the same reason.

## 3. The review record

A review is an event of **kind 34259**, addressable: one per person per book. It is the "rating of anything" kind
Brainstorm already reads (`client/src/lib/thing.ts`), with the mark `book`, which `thing.ts` already names.

| Tag      | Value                                               | Rule                                                                   |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `d`      | `book:` followed by the book's address              | MUST. One `d` per book, so the person's next review replaces this one. |
| `a`      | the book's address, then the hub as a relay hint    | MUST. The hint, `wss://dcosl.brainstorm.world`, SHOULD be there.       |
| `m`      | `book`                                              | MUST. Says what sort of thing is rated.                                |
| `rating` | the stars out of 5 as a fraction, to three decimals | MUST when stars are given. Two elements only: a third names an aspect. |
| `s`      | the whole stars, `1` to `5`                         | MUST when stars are given. Readers read it first.                      |
| `alt`    | `Review of <book's title>: <n> of 5 stars`          | SHOULD (NIP-31), for an app that does not know the kind.               |

`content` is the person's words, which may be empty.

The relay hint on `a`, and reading the address alone, are as for a place.

Stars are whole, from 1 to 5. A review MAY give none (words alone): it is listed, and enters no rating.

```json
{
  "kind": 34259,
  "content": "Read it in three sittings. The Gracchi chapters are the best part.",
  "tags": [
    ["d", "book:39999:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:ol-ol19722168w"],
    [
      "a",
      "39999:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:ol-ol19722168w",
      "wss://dcosl.brainstorm.world"
    ],
    ["m", "book"],
    ["rating", "0.800"],
    ["s", "4"],
    ["alt", "Review of The storm before the storm: 4 of 5 stars"]
  ]
}
```

### Reading the stars

As for a place: `starsOf` in `client/src/lib/thing.ts`. An `s` from 1 to 5 is the stars; else the first `rating` (an
aspect-free one first), from above 0 up to 1 a fraction of five stars, above 1 and up to 5 stars; anything else, and a
rating of 0, is no stars.

### Reading the words

The words are the content, with the ends trimmed. A record another client wrote with photos (`imeta`) is read as the
places contract reads one: every address an `imeta` names is taken out of the words.

## 4. Which reviews stand

As for a place (places contract, section 4), with `book:` in place of `place:`:

1. Events of kind 34259 whose signature is checked.
2. That name the book: the `a` is the book's address; else the `d` is the address, or `book:` and the address.
3. Not written more than a day ahead of the reader's clock.
4. Of one person's events at one `d`, only the newest stands (on a tie, the lowest id).
5. Then one per person per book.
6. A review taken down by a removal the app has seen is not shown (section 6).

To ask a relay for a book's reviews:

```json
[
  { "kinds": [34259], "#a": ["<address>"] },
  { "kinds": [34259], "#d": ["<address>", "book:<address>"] }
]
```

## 5. Where a review goes, and where it is read

- **Published to:** the reviewer's own write relays (NIP-65), and the index, `wss://search.brainstorm.world`. Both
  MUST. An app MAY add more. Not the list hub, `wss://dcosl.brainstorm.world`, which refuses a review.
- **A reviewer with no relay list.** An app that holds a person's key for them (Unbnd's email accounts) and finds no
  kind 10002 for that person publishes to a default set of its own, which MUST include the index.
- **Read from:** the index, MUST, under `search: "include:spam"`, as each app draws its own line over who counts. An
  app SHOULD also read the other relays reviews are published to.

## 6. Writing, editing, removing

As for a place (places contract, section 6):

- **A person has one review of a book.** When they already have one, the composer opens it to be changed. It never
  adds a second.
- **Editing** is signing the record again at the same `d`, dated `max(now, previous + 1)`, carrying over every tag the
  app does not itself set, unchanged and in its order, except `client` and `nonce`.
- **Removing** is a NIP-09 request (kind 5) that names the review by id (`e`) and by address
  (`a`, `34259:<reviewer pubkey>:<d>`), with `k` `34259`, sent wherever the review was sent. Both apps MUST offer it
  for the person's own review.
- **Reading a removal** is as for a place: only the review's author can remove it; an `e` alone takes it down; through
  an `a`, only versions dated no later than the removal; a removal dated more than a day ahead is ignored.

## 7. What is not a review

- **A comment** (kind 1111, NIP-22) on a book is talk about the book. It is not a review: it is not counted as one,
  and gives no stars to any sum. Kind 1111 comments written as book reviews before this document stand as comments.
- **Brainstorm's recommendation** of a book (a kind 7 `+` on the item) is Brainstorm's own. It is not a review and
  enters no rating.
- **Unbnd's shelves, genre tags, quality signals and curator vouches** are Unbnd's own records. They are not reviews
  and enter no rating.
- **Following a reviewer** changes the person's follow list (kind 3) and is outside this document, as for a place.

## 8. If a star value is shown for a book

An app MAY show none. When it shows one, the same person looking through the same lens MUST see the same value in both
apps. The lens, the weights and the value are those of the places contract, section 8:

- **A reviewer's weight** is their rank in the lens divided by 100, for a rank from 5 to 100. Below 5, or with no rank,
  it is 0: the reviewer is outside the lens. Their review is still shown, apart or last, and is never counted.
- **The value** is the sum of weight × stars over the sum of weights, across the reviews that stand, have stars and
  have a weight above 0, shown to one decimal. **Say whose lens it is.**
- **With nothing counted there is no value.** An app SHOULD say how many reviews there are and that none is yet from
  inside the lens ("8 ratings, none yet from readers the house trusts"), and MUST NOT put a number in its place.
- **A plain average of every review MUST NOT be shown** as a book's rating.
- **Signals of an app's own drawn from reviews** (Unbnd's Hidden gem and Overhyped, which compare the lens's value with
  the wider network's) MUST NOT count a reviewer who has no rank in the lens. A count that takes in every key is the
  easiest number to fake; an account made this morning has no rank. Unbnd's "wider network" is the reviewers with any
  rank above 0, each counted once.

An app that orders books by rating SHOULD use the places contract's ordering number,
`(Σ weight × stars + 1.5 × 3.5) / (Σ weight + 1.5)`, so that one five-star review does not top a list.

## 9. Where each app stands (2026-10-20)

### Brainstorm's book view

To build. It reads and writes kind 1111 comments with a `rating` of `1` to `5` as reviews
(`client/src/lib/commentReviews.ts`, `client/src/services/bookReviews.ts`), shows a plain average ("Rated 4.2 by 5
people", `BookView.tsx`), sends reviews to the hub, and offers no edit or removal. Under this document: read and write
the record of sections 3 to 5, honour removals, offer edit and removal, and show the star value of section 8 or none.
The comment reviews already written stay as comments (section 7), as on the place view.

### Unbnd

To build. It stores a rating as a kind 39999 item under `39998:<librarian>:book-ratings`, with `score` 1 to 5, the
words in `content`, a `["retracted","true"]` replacement in place of a removal, and sends it to its own relay and the
hub. Under this document: write and read the record of sections 3 to 5, remove with kind 5, read reviews from the
index, count only ranks from 5, show no number where nothing is counted, and keep Hidden gem and Overhyped within
section 8. Its 17 earlier ratings (three people, none with words) are moved over by Unbnd, not read as reviews here.

## 10. For the team to confirm

1. **Kind 34259 with `m book`** is the one review record for a book; kind 1111 is a comment.
2. **`book:` and the address** as the `d`, mirroring places.
3. **Stars without words, and words without stars.** Brainstorm's book view counts ratings (stars alone) and reviews
   (stars and words) apart. Unbnd asks for stars and makes words optional. Should both composers require stars, as
   places do, and allow words to be empty?
4. **The words stop at 1,200 characters,** as for places and Brainstorm's composer today (Unbnd allows 2,000 now and
   will lower it).
5. **The line is 5,** as for places, for both apps.
6. **No photos on book reviews** in either composer for now; a record with `imeta` from elsewhere is still read and
   carried over (sections 3 and 6).

## 11. Checks both apps' tests should hold

| #   | Given                                                                                          | Both apps                                                                |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A   | The record of section 3                                                                        | One review, 4 stars, the words.                                          |
| B   | A, then the stars changed to 5 in the other app, where A carried an unknown tag `["x","1"]`    | The new record still has `["x","1"]`, unchanged, and no `client` from A. |
| C   | Two records by one person for one book, a day apart; the older one has the bare address as `d` | One review: the newer.                                                   |
| D   | A real record, and one by the same person dated a year ahead                                   | The real one stands. The other is ignored.                               |
| E   | A kind 1111 comment on the book with `["rating","5"]`, by a third person                       | Not a review. Counts stay as they were.                                  |
| F   | A record, then its removal (kind 5 with `e`, `a`, `k`)                                         | No review.                                                               |
| G   | `s` 4 with `rating` 0.800; `rating` 4 alone; `rating` 0.9 alone; `rating` 0; `rating` 7        | 4 stars; 4 stars; 4.5 stars; no stars; no stars.                         |
| H   | Three reviewers ranked 80, 30 and 4, giving 5, 3 and 1 stars                                   | The value is 4.5. The third is outside, not counted.                     |
| I   | Two reviewers ranked 0 and 3, giving 5 stars each                                              | No value. "2 ratings, none yet from readers the lens trusts" or nothing. |
| J   | A removal through `a`, then a newer record at the same `d`                                     | The newer record stands.                                                 |
| K   | A record dated an hour ahead, then an edit made now                                            | The edit is dated a second after it, and replaces it.                    |

## 12. Not in this document

- **Reviews of places** (the places contract).
- **Unbnd's own records** (section 7), and **following a reviewer**.

## Reference

Brainstorm's side: `client/src/lib/thing.ts` (`starsOf`, kind 34259, `m book`), `client/src/lib/commentReviews.ts`,
`client/src/services/bookReviews.ts`, `client/src/components/items/BookView.tsx`, `client/src/lib/books.ts`,
[ADR 0007](../adr/0007-three-tiers-of-item-rendering.md).

Unbnd's side, in [aburra16/unbnd](https://github.com/aburra16/unbnd): `packages/schemas/src/BookRating.ts` (today's
record), `packages/trust/src/ratings.ts` (the fold and the weights), `apps/api/src/routes/ratings.ts`.

## Changes

- 2026-10-20: first version, after the places contract.
