# Food and Drink Places: the actions contract

One list, more than one app. The Food and Drink Places list
(`39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:food-and-drink-places`, items of kind 39999
signed by the curator) is shown by Brainstorm's tier-three place view (`client/src/components/items/PlaceView.tsx`) and
by Regulars ([askregulars.world](https://askregulars.world),
[aburra16/regulars](https://github.com/aburra16/regulars)), an app built only for this list.

**The rule: how a place looks is each app's own. What a person does to a place is not.** Anything a person signs about
a place in one app must be read, shown, edited and removed correctly by the other. A person who rates a place in
Regulars finds that rating on Brainstorm, and the reverse. Neither app leaves the other's record wrong, doubled or
stripped.

This document binds both apps. MUST, SHOULD and MAY are used as in RFC 2119. Section 9 says where each app stands
today, and section 10 lists what the team still has to confirm. Reviews of anything but a place, books among them, are
outside it (section 12).

## 1. What is shared, and what is free

| Shared: must match in both apps                                         | Free: each app's own                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| How a place is named (its address)                                      | Layout, type, colour, motion                          |
| The review record: its kind, its tags, its scale of stars               | The map and its tiles                                 |
| Which reviews stand: one person, one review of a place                  | The order reviews are listed in                       |
| Where a review is published and read                                    | How a reviewer is drawn (face, ring, name)            |
| Editing replaces; removing removes                                      | Which optional fields are drawn (price, photos)       |
| Never destroying a field you do not draw                                | The wording of hours, "open now", what is nearby      |
| The star value shown for a place, for the same person and the same lens | Actions of your own that are not reviews (section 7)  |
| The credit for the data (OpenStreetMap contributors, BTC Map; ODbL)     | Whether a star value, a price or a count shows at all |

If something a person can do to a place is not in this document, it belongs here before it ships in either app.

## 2. The place

- A place is named by its address, `39999:<curator pubkey>:<d>`. Everything a person signs about a place names it by
  this address, never by an event id: the curator signs every place again at each import, so ids change and the
  address does not.
- A link to a place SHOULD be by address (an `naddr`), for the same reason.

## 3. The review record

A review is an event of **kind 34259**, addressable: one per person per place. It is the "rating of anything" kind
Brainstorm already reads (`client/src/lib/thing.ts`), with the mark `place`.

| Tag      | Value                                               | Rule                                                                        |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `d`      | `place:` followed by the place's address            | MUST. One `d` per place, so the person's next review replaces this one.     |
| `a`      | the place's address, then the hub as a relay hint   | MUST. The hint, `wss://dcosl.brainstorm.world`, SHOULD be there (below).    |
| `m`      | `place`                                             | MUST. Says what sort of thing is rated.                                     |
| `rating` | the stars out of 5 as a fraction, to three decimals | MUST when stars are given. Two elements only: a third names an aspect.      |
| `s`      | the whole stars, `1` to `5`                         | MUST when stars are given. Readers read it first.                           |
| `alt`    | `Review of <place's name>: <n> of 5 stars`          | SHOULD (NIP-31), for an app that does not know the kind.                    |
| `price`  | `1` to `4`, for $ to $$$$                           | MAY.                                                                        |
| `paid`   | `lightning`, `onchain`, `card` or `cash`            | MAY.                                                                        |
| `imeta`  | `url <https address>` and what else NIP-92 allows   | MAY, one for each photo. The address is in the content too, as NIP-92 asks. |

`content` is the person's words, which may be empty, then each photo's address on a line of its own.

The relay hint on `a` is where the place is found, as NIP-01 lets an `a` say. A client that does not know the list,
and looks for the place by its author's relay list (Amethyst, for one), can then fetch it. Readers read only the
address: a record without the hint is read the same.

Stars are whole, from 1 to 5. A review MAY give none (words, a price or photos alone): it is listed, and enters no
rating.

```json
{
  "kind": 34259,
  "content": "Get the bolo de caco with garlic butter.\nhttps://blossom.example/abc.jpg",
  "tags": [
    ["d", "place:39999:4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64:osm-node-11330857543"],
    [
      "a",
      "39999:4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64:osm-node-11330857543",
      "wss://dcosl.brainstorm.world"
    ],
    ["m", "place"],
    ["rating", "0.800"],
    ["s", "4"],
    ["alt", "Review of Jacafé: 4 of 5 stars"],
    ["price", "2"],
    ["paid", "lightning"],
    ["imeta", "url https://blossom.example/abc.jpg"]
  ]
}
```

### Reading the stars

Both apps read stars by one rule, the one `starsOf` in `client/src/lib/thing.ts` already has:

1. An `s` that is a whole number from 1 to 5 is the stars.
2. Else take the first `rating` with no third element, or failing that the first `rating`, read with `Number()`.
   From above 0 up to 1 it is a fraction of five stars (`0.9` is 4.5, `1` is 5). Above 1 and up to 5 it is stars.
   Anything else is no stars.
3. For a place, a rating of 0 is **no stars**, not zero stars: a review gives 1 to 5, and a 0 must not pull a rating
   down.

### Reading the words

The words are the content with every address that an `imeta` tag names taken out, and the ends trimmed. An app that
draws no photos MUST still take the addresses out of the words.

## 4. Which reviews stand

An app shows, counts and scores only the reviews that stand, found in this order:

1. Events of kind 34259 whose signature is checked.
2. That name the place: the `a` is the place's address; else the `d` is the address, or `place:` and the address.
   (Reviews written either way are read; an app writes the form of section 3.)
3. Not written more than a day ahead of the reader's clock (`created_at` at most now + 86,400 s). One from the future
   is ignored altogether: it must not replace the real review it would be newer than.
4. Of one person's events at one `d`, only the newest stands (NIP-01; on a tie, the lowest id).
5. Then one per person per place: the newest, for someone who reviewed a place under two `d` values.
6. A review taken down by a removal the app has seen is not shown (section 6, "Reading a removal").

"3 reviews", a price most people gave, how people paid, and any rating are worked out over the reviews that stand:
one person, one voice.

To ask a relay for a place's reviews:

```json
[
  { "kinds": [34259], "#a": ["<address>"] },
  { "kinds": [34259], "#d": ["<address>", "place:<address>"] }
]
```

## 5. Where a review goes, and where it is read

- **Published to:** the reviewer's own write relays (NIP-65), and the index, `wss://search.brainstorm.world`. Both
  MUST. An app MAY add more: Regulars adds `wss://nos.lol` and `wss://relay.primal.net`; Brainstorm adds the list hub.
- **Read from:** the index, MUST, under the lens that keeps what it takes for spam (`search: "include:spam"`), as each
  app draws its own line over who counts. An app SHOULD also read the other relays reviews are published to, since
  the index can lag or be out.

## 6. Writing, editing, removing

- **Writing** a review is signing the record of section 3.
- **A person has one review of a place.** When they already have one, the composer opens it to be changed. It never
  adds a second.
- **Editing** is signing the record again at the same `d`.
  - **Its date** is the later of now and one second after the version it replaces (`max(now, previous + 1)`). Section 4
    lets a record be dated up to a day ahead, so an edit dated plainly "now" can be older than the version it replaces,
    and lose.
  - **Every tag the app does not itself set is carried over,** unchanged and in its order: the other app's `price`,
    `paid` and `imeta`, and tags from apps neither knows. Only what the person changed here changes. A record that two
    apps may replace loses whatever one of them does not copy.
  - **Except `client` and `nonce`,** which belong to one signing, not to the review: the app that signed that version
    (NIP-89) and its proof of work (NIP-13). Carried over, they would credit the new version to the other app, and a
    signer that adds its own would sign two.
  - **The photos' addresses stay in the words.** An app that does not draw photos still writes, after the person's
    words, each address that a carried-over `imeta` names, on a line of its own, as the version it replaces had them.
    Other clients read photos from the content.
- **Removing** is a NIP-09 request (kind 5) that names the review by id (`e`) and by address
  (`a`, `34259:<reviewer pubkey>:<d>`), with `k` `34259`, sent wherever the review was sent. Both apps MUST offer it
  for the person's own review.
- **Reading a removal.** A removal counts only when its author is the review's author. It takes down the review whose
  id an `e` names, even with no `a` beside it (removals written that way exist). Through an `a`, it takes down only
  the versions dated no later than the removal: a review written after it stands. Both apps MUST stop showing a review
  once a removal that takes it down is seen. A removal dated more than a day ahead of the reader's clock is ignored, as
  a review is (section 4): through an `a` it would otherwise take down every review the person writes there until that
  date.

## 7. What is not a review

- **A comment** (kind 1111, NIP-22) on a place is talk about the place. It is not a review: it is not counted as one,
  and gives no stars, price or payment to any sum.
- **Brainstorm's vouch** for a listing (a kind 7 `+` on the item) is Brainstorm's own. It is not a review and enters
  no rating. Regulars does not read it.
- **Following a reviewer** changes the person's follow list (kind 3), one record for all their apps, and is outside
  this document. An app that offers it from a place owes that record the care Regulars' `src/follow/` takes: read it
  fresh, never guess a list, change one entry, check what was signed.

## 8. If a star value is shown for a place

An app MAY show none. When it shows one, the same person looking through the same lens MUST see the same value in
both apps.

- **A lens** is a scorer's ranks: kind 30382 events with a `rank` from 0 to 100, by the scorer that the lens's owner
  names in their kind 10040 (`30382:rank`).
- **A reviewer's weight** is their rank divided by 100, for a rank from 5 to 100. Below 5, or with no rank, it is 0:
  the reviewer is outside the lens. Their review is still shown, apart or last, and is never counted.
- **The value** is the sum of weight × stars over the sum of weights, across the reviews that stand, have stars and
  have a weight above 0. It is shown to one decimal. With nothing counted there is no value.
- **Say whose lens it is.** Regulars has two: "House picks", the curator's lens, and "My circle", the person's own.
- A plain average of every review MUST NOT be shown as a place's rating.

Regulars orders lists by a second number that is never shown, `(Σ weight × stars + 1.5 × 3.5) / (Σ weight + 1.5)`,
so that one five-star review does not top a list. An app that orders places by rating SHOULD use it.

## 9. Where each app stands (2026-10-14)

### Brainstorm's place view

Done, in [#235](https://github.com/NosFabrica/Brainstorm-UI/pull/235): it reads and writes the record of sections 3
to 5, asks for stars, keeps one review per person and opens it to be changed, removes, carries over the tags it does not
set, dates an edit after the version it replaces, honours removals as section 6 reads them, shows the star value of
section 8, and links a place by its address. Checks A to I pass in `client/src/lib/placeReviews.test.ts`. The kind 1111
reviews written on staging before it are comments now.

Small points added since, for Brainstorm to take up:

1. **A removal dated more than a day ahead** is ignored (section 6). `standingReviews` honours every removal it is given.
2. **`nonce` is not carried over** on an edit (section 6). `placeReviewTemplate` carries it; `client` is already
   replaced by `signAs`.
3. **The hub as the hint on `a`** (section 3). `placeReviewTemplate` writes the address alone.

### Regulars

Done, in [aburra16/regulars@a221e48](https://github.com/aburra16/regulars/commit/a221e48): an edit is
built on the person's review and carries over every tag Regulars does not set but `client` and `nonce`, with the
photos' addresses after the words, at the review's own `d`; the words are shown without the photos' addresses; removals
are read where reviews are and honoured as section 6 reads them; reviews are read from the hub too; the words stop at
1,200 characters. It already dated an edit after the version it replaces. Checks A to M are in
`tests/placeContract.test.ts`. It still draws no price, payment or photo, which section 1 leaves to each app.

## 10. For the team to confirm

Each as both apps now build it, or will:

1. **Kind 34259** is the one review record for a place; kind 1111 is a comment. Built in Brainstorm.
2. **The optional tags** are `price` (`1` to `4`), `paid` and `imeta`, as section 3 names them. Built in Brainstorm.
3. **Stars are required** in both apps' composers. A review without stars from elsewhere is listed, and enters no star
   value.
4. **The words stop at 1,200 characters,** in both apps.
5. **The relays.** Brainstorm publishes to the reviewer's write relays, the hub and the index, and reads the index, the
   hub, `wss://nos.lol` and `wss://relay.primal.net`. Regulars publishes to the reviewer's write relays, the index,
   `wss://nos.lol` and `wss://relay.primal.net`, and reads those three and the hub.
6. **The star value.** Brainstorm shows the reader's own lens when someone they trust gave stars, else the curator's,
   and says which ("From 1 person trusted by Mise En Place"). Regulars shows the lens the person picks: House picks or
   My circle.

## 11. Checks both apps' tests should hold

Each is a record or a set of records, and what both apps must make of it.

| #   | Given                                                                                           | Both apps                                                                                |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A   | The record of section 3 without `price`, `paid`, `imeta` (as Regulars writes it)                | One review, 4 stars, the words.                                                          |
| B   | The record of section 3 in full (as Brainstorm will write it)                                   | One review, 4 stars, the words without the photo's address.                              |
| C   | B, then the stars changed to 5 in the other app                                                 | The new record still has `price`, `paid` and `imeta`, unchanged.                         |
| D   | Two records by one person for one place, a day apart; the older one has the bare address as `d` | One review: the newer.                                                                   |
| E   | A real record, and one by the same person dated a year ahead                                    | The real one stands. The other is ignored.                                               |
| F   | A kind 1111 comment on the place, by a third person                                             | Not a review. Counts stay as they were.                                                  |
| G   | A record, then its removal (kind 5 with `e`, `a`, `k`)                                          | No review.                                                                               |
| H   | `s` 4 with `rating` 0.800; `rating` 4 alone; `rating` 0.9 alone; `rating` 0; `rating` 7         | 4 stars; 4 stars; 4.5 stars; no stars; no stars.                                         |
| I   | Three reviewers ranked 80, 30 and 4, giving 5, 3 and 1 stars                                    | The value is 4.5 ((0.8 × 5 + 0.3 × 3) / 1.1 = 4.45). The third is outside, not counted.  |
| J   | A record, then a removal by its author that names it by `e` alone                               | No review.                                                                               |
| K   | A removal through `a`, then a newer record at the same `d`                                      | The newer record stands.                                                                 |
| L   | A record dated an hour ahead, then an edit made now                                             | The edit is dated a second after it, and replaces it.                                    |
| M   | B, edited in an app that draws no photos                                                        | The new record's words still end with the photo's address, and its `imeta` is unchanged. |

## 12. Not in this document

- **Reviews of books.** Brainstorm's book view reviews with kind 1111 comments and a `rating` of `1` to `5`. If books
  move to kind 34259 with `m book`, that wants a section of its own, and Regulars has no part in it.
- **Following a reviewer** (section 7).

## Reference

Regulars' side, in [aburra16/regulars](https://github.com/aburra16/regulars):

- `src/reviews/review.ts`: reading a review, `starsOf`, which reviews stand.
- `src/reviews/write.ts`: the record a person signs, and its removal.
- `src/reviews/removals.ts`: which removals count, and what they take down.
- `tests/placeContract.test.ts`: checks A to M of section 11.
- `src/score/score.ts` and `src/trust/houseWeights.ts`: the star value and the weights.
- `src/config.ts`: the relays, the line (5) and the ordering prior (1.5 at 3.5).

Brainstorm's side: `client/src/lib/thing.ts` (`starsOf`, kind 34259), `client/src/lib/placeReviews.ts`,
`client/src/services/placeReviews.ts`, `client/src/components/items/PlaceReviews.tsx`,
[ADR 0007](../adr/0007-three-tiers-of-item-rendering.md).

## Changes

- 2026-10-14: first version.
- 2026-10-14: after Brainstorm's side was built (#235): how a removal is read, an edit's date, the photos' addresses
  kept in the words on an edit, section 9 and 10 as built, checks J to M, and books named outside this document.
- 2026-10-14: after Regulars' side was built: `client` and `nonce` are not carried over on an edit, a removal dated
  more than a day ahead is ignored, and section 9 and 10 as both apps now stand.
- 2026-10-15: the hub as a relay hint on a review's `a`, so a client that looks for a place by its author's relay
  list can find it. Regulars writes it.
