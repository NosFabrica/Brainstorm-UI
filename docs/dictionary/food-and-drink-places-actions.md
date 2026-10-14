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
today, and section 10 lists what the team still has to confirm.

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
| `a`      | the place's address                                 | MUST.                                                                       |
| `m`      | `place`                                             | MUST. Says what sort of thing is rated.                                     |
| `rating` | the stars out of 5 as a fraction, to three decimals | MUST when stars are given. Two elements only: a third names an aspect.      |
| `s`      | the whole stars, `1` to `5`                         | MUST when stars are given. Readers read it first.                           |
| `alt`    | `Review of <place's name>: <n> of 5 stars`          | SHOULD (NIP-31), for an app that does not know the kind.                    |
| `price`  | `1` to `4`, for $ to $$$$                           | MAY.                                                                        |
| `paid`   | `lightning`, `onchain`, `card` or `cash`            | MAY.                                                                        |
| `imeta`  | `url <https address>` and what else NIP-92 allows   | MAY, one for each photo. The address is in the content too, as NIP-92 asks. |

`content` is the person's words, which may be empty, then each photo's address on a line of its own.

Stars are whole, from 1 to 5. A review MAY give none (words, a price or photos alone): it is listed, and enters no
rating.

```json
{
  "kind": 34259,
  "content": "Get the bolo de caco with garlic butter.\nhttps://blossom.example/abc.jpg",
  "tags": [
    ["d", "place:39999:4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64:osm-node-11330857543"],
    ["a", "39999:4bded2172075221ead393a0baec9c530238ec192c2a9cdbbc7754ba8c3357b64:osm-node-11330857543"],
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
6. A review whose removal the app has seen (section 6) is not shown.

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
- **Editing** is signing the record again at the same `d`, dated now and later than the version it replaces.
  The app MUST carry over, unchanged and in their order, every tag it does not itself set: the other app's `price`,
  `paid` and `imeta`, and tags from apps neither knows. Only what the person changed here changes. A record that two
  apps may replace loses whatever one of them does not copy.
- **Removing** is a NIP-09 request (kind 5) that names the review by id (`e`) and by address
  (`a`, `34259:<reviewer pubkey>:<d>`), with `k` `34259`, sent wherever the review was sent. Both apps MUST offer it
  for the person's own review, and MUST stop showing a review once its removal is seen.

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

1. **Reviews are kind 1111 comments** (`client/src/lib/placeReviews.ts`, `client/src/services/placeReviews.ts`), which
   Regulars does not read, and the view does not read kind 34259. Read and write the record of sections 3 to 5.
2. **A place review has no stars,** and the `rating` it would write is `1` to `5`, a different scale from the one
   `starsOf` reads for this kind. Offer stars, and write `rating` as the fraction with `s`.
3. **A review can be neither changed nor removed.**
4. **Every comment counts,** so one person's five comments are "5 reviews" and five votes for a price.
5. **Published to** the reviewer's write relays and the hub. It must also reach the index (section 5).
6. **A place is linked by event id** (`/e/nevent…`), which the next import makes stale.

The kind 1111 reviews on staging are test data. They are not carried over. After the change they are comments.

### Regulars

1. **An edit drops every tag Regulars does not set** (`src/reviews/write.ts` builds the record from nothing), so a
   price or a photo given on Brainstorm would be lost.
2. **It reads no `price`, `paid` or `imeta`,** and does not take photo addresses out of the words.
3. **It reads no removals from relays.** It relies on relays dropping what was removed, and on what its own tab
   removed.
4. **It does not publish to the hub,** and reads the index and its two public relays only.
5. **The words have no limit of length.** Brainstorm's composer stops at 1,200 characters.

## 10. For the team to confirm

1. Kind 34259 as the one review record for a place, and kind 1111 as comments only.
2. The names and values of the optional tags: `price` (`1` to `4`), `paid`, `imeta`.
3. Whether a review must give stars (Regulars: always; Brainstorm today: never).
4. One limit for the words (1,200 characters is proposed).
5. The relays of section 5, and that the index takes reviews from both apps.
6. Whether Brainstorm's place view shows the weighted star value of section 8, or none.

## 11. Checks both apps' tests should hold

Each is a record or a set of records, and what both apps must make of it.

| #   | Given                                                                                           | Both apps                                                                               |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A   | The record of section 3 without `price`, `paid`, `imeta` (as Regulars writes it)                | One review, 4 stars, the words.                                                         |
| B   | The record of section 3 in full (as Brainstorm will write it)                                   | One review, 4 stars, the words without the photo's address.                             |
| C   | B, then the stars changed to 5 in the other app                                                 | The new record still has `price`, `paid` and `imeta`, unchanged.                        |
| D   | Two records by one person for one place, a day apart; the older one has the bare address as `d` | One review: the newer.                                                                  |
| E   | A real record, and one by the same person dated a year ahead                                    | The real one stands. The other is ignored.                                              |
| F   | A kind 1111 comment on the place, by a third person                                             | Not a review. Counts stay as they were.                                                 |
| G   | A record, then its removal (kind 5 with `e`, `a`, `k`)                                          | No review.                                                                              |
| H   | `s` 4 with `rating` 0.800; `rating` 4 alone; `rating` 0.9 alone; `rating` 0; `rating` 7         | 4 stars; 4 stars; 4.5 stars; no stars; no stars.                                        |
| I   | Three reviewers ranked 80, 30 and 4, giving 5, 3 and 1 stars                                    | The value is 4.5 ((0.8 × 5 + 0.3 × 3) / 1.1 = 4.45). The third is outside, not counted. |

## Reference

Regulars' side, in [aburra16/regulars](https://github.com/aburra16/regulars):

- `src/reviews/review.ts`: reading a review, `starsOf`, which reviews stand.
- `src/reviews/write.ts`: the record a person signs, and its removal.
- `src/score/score.ts` and `src/trust/houseWeights.ts`: the star value and the weights.
- `src/config.ts`: the relays, the line (5) and the ordering prior (1.5 at 3.5).

Brainstorm's side: `client/src/lib/thing.ts` (`starsOf`, kind 34259), `client/src/lib/placeReviews.ts`,
`client/src/services/placeReviews.ts`, `client/src/components/items/PlaceReviews.tsx`,
[ADR 0007](../adr/0007-three-tiers-of-item-rendering.md).

## Changes

- 2026-10-14: first version.
