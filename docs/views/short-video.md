# View brief: short video

A hand-built view for an event kind. It lives in the per-kind mechanism the event page
already has (`components/share/VideoHero.tsx`, chosen in `components/share/EventScreen.tsx`).
[ADR 0004](../adr/0004-renderers-read-the-governing-concept.md) says no concept has code of its
own. That rule is about Decentralized List concepts and their items. A kind renderer draws a
signed event of a known kind from its own tags, so ADR 0004 does not apply to it.

## Category

Event kinds 34236 and 22: NIP-71 short videos. Divine's app publishes 34236, and its restored
classic Vines are 34236 too. The full-length kinds 21 and 34235 share the same hero and the same
reader. They get everything below except the loop.

## Sources

Everything is read from the signed event, by `readVideo` in `lib/nip71.ts`. The content warning
and the expiration have readers of their own (`lib/nip36.ts`, `lib/nip40.ts`), because other
kinds carry them too. There are no external reads and no new relay reads.

| Shown                   | Read from                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video and poster        | See "Video and poster" below the table                                                                                                                                          |
| Frame shape             | `imeta` `dim`, written as digits, `x`, digits (`1080x1920`, either case)                                                                                                        |
| Title                   | `title`                                                                                                                                                                         |
| Posted date             | `published_at` when it is all digits, on or after 2006-01-01 and at most a day ahead of now. Otherwise `created_at`. A restored Vine's `created_at` is the day it was imported. |
| Length                  | `imeta` `duration`, else the `duration` tag. Only a plain number of seconds above zero counts (`6`, `6.033`); an `imeta` value that is not one gives way to the tag.            |
| Description             | `summary`, else `content`. A leading line that is only the title is dropped. For a Vine, the "Original stats: ..." line is dropped.                                             |
| Hashtags                | `t` tags, lowercased, each once. The page offers twelve at most.                                                                                                                |
| Screen reader name      | `alt`, else the title                                                                                                                                                           |
| Content warning         | a `content-warning` tag (its value is the reason), or `l` tags in the `content-warning` namespace (the labels are the reason)                                                   |
| Expiration              | `expiration` (NIP-40), a whole number of seconds                                                                                                                                |
| Classic Vine, its stats | `platform` is `vine`, or an `l` tag is `vine-archive`. Then `loops` and `likes`, whole numbers of zero or more.                                                                 |
| Capture mark            | `verification`: `verified_mobile` or `verified_web`                                                                                                                             |
| Link to Divine          | `https://divine.video/video/<d>` when the `client` tag's first value is `Divine` or `vine-archive-importer`, or the video is hosted on `divine.video` or one of its subdomains  |

**Video and poster.** The existing extractors in `lib/noteContent.ts` decide these, and the
hero does not change them.

- The video is the first `imeta` `url` whose `m` is `video/*` or whose address ends in a video
  extension. After the `imeta` tags comes a video address written in `content`. The last resort
  is the top-level `url` tag.
- The poster is whichever comes first in the event's own tag order: a top-level `image` or
  `thumb` tag, or an `imeta` `image` or `thumb` part. With none of those it is the first picture
  the event names (an `imeta` with an image type, a `url` tag ending in a picture extension, a
  picture address in `content`).

The `proofmode` and `device_attestation` tags are 10 to 20 KB each. They are never parsed and
never printed.

## Surfaces

**Page** (`/e/<naddr or nevent>`), in this order:

1. The author byline. Its date is the posted date above, and the page says it once.
2. The video in a frame that follows `dim`: upright (9:16) for portrait, square for a square
   video, wide (16:9) for landscape or when there is no `dim`.
3. The title.
4. A facts line: length (`6s`, or `1:05` from a minute up), and for a Vine its loops and likes
   and a "Classic Vine" label. With none of these there is no line.
5. The description.
6. Chips for the hashtags that the title and description do not already carry, twelve at
   most. Each opens the tag's page.
7. "Recorded in the Divine app" or "Recorded in Divine on the web", when Divine's capture check
   is present.
8. "Watch on Divine", when the video is Divine's.

**Cards, rows and thumbnails.** These keep their existing shape. The one rule this view adds
to them is the content warning, on these surfaces and no others:

| Surface                                                                                                                   | A video its creator marked sensitive                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Media card (`MediaCard`)                                                                                                  | The cover with "Show video" in place of the player                                            |
| A video quoted by event id (`nostr:nevent…`, a `q` or `e` tag), or carried in a repost (kind 6 or 16): `EmbeddedNoteCard` | The cover in place of a clip in its `content`, and a placeholder in place of a picture there  |
| A video quoted by address (`nostr:naddr…`, an `a` tag): `EmbeddedArticleCard`                                             | The "Sensitive" tile in place of the card's cover, which is the event's top-level `image` tag |
| Media tile (`MediaTile`)                                                                                                  | A neutral tile labelled "Sensitive" in place of the picture                                   |
| Profile video tile (`VideoTile`)                                                                                          | The same tile                                                                                 |
| Top row thumbnail (`SerpRow`)                                                                                             | The same tile                                                                                 |
| All row thumbnail (`AllResultRow`), a repost of the video included                                                        | The same tile                                                                                 |
| Person panel "Latest" row (`PanelMedia`)                                                                                  | The same tile                                                                                 |
| Lightbox, opened from any of those tiles                                                                                  | The cover first, then the video                                                               |

A flagged tile is named `Sensitive video: <title>` for a screen reader, where an unflagged one
says "Play".

A flagged video is also kept out of the Top stories strip. The strip draws a picture large and
has no place to ask first, so the video reads as a row, where its thumbnail is the tile.

## Idiom

- A short loops. Nothing on the page starts playing by itself.
- The frame is the video's own shape. A square Vine is never pillarboxed in a wide box.
- Divine is named with its own wordmark (`DivineWordmark` in `lib/brands.tsx`), by its own
  brand rules.
- The capture mark is a squared slate chip with a device icon. Its tooltip reads "Divine's own
  capture check, not a Brainstorm trust score". It is kept visually apart from the trust tier
  chip beside the author's name, so nobody reads it as Brainstorm vouching for the video.
- A Vine's loops and likes are what Vine counted. They are shown as history, with thousands
  separators, next to the "Classic Vine" label.

## Failures

| Case                                          | What the reader sees                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| No `dim`, or a `dim` that is not `WxH`        | The wide frame                                                              |
| No video URL                                  | The poster alone, or an empty frame when there is no poster either          |
| `published_at` missing or not a credible time | The date from `created_at`                                                  |
| No length, no stats, no hashtags              | That part of the page is left out                                           |
| A count that is negative or not a number      | That count is left out                                                      |
| `verification` with any other value           | No capture mark                                                             |
| A video Divine neither published nor hosts    | No "Watch on Divine"                                                        |
| `expiration` in the past, on a video kind     | "This post has expired." where the page would be (`DeletedStub`, `expired`) |
| `expiration` that is not a time               | Ignored. The event shows as usual.                                          |

## Privacy and safety

- **Safe by default, on the surfaces named above.** There, a video with a content warning shows
  no poster and no frame until the reader chooses "Show video". Before that choice the page holds
  no `<video>` element and makes no request for the poster. The cover reads "The creator marked
  this video as sensitive", followed by the reason when the creator gave one. A long reason is
  cut to about 80 characters.
- The choice lasts for that view only. It is not stored, and the cover is back on the next
  visit.
- After "Show video", keyboard focus moves to the video.
- Thumbnails never offer a way through in place. Their tap opens the event page or the
  lightbox, and both show the cover first.
- "Watch on Divine" opens in a new tab with `rel="noopener noreferrer"`.
- The warning is the creator's own label. Brainstorm does not classify videos, and an unlabelled
  video is shown as it is.

### Notes

- On thumbnails and Media cards the rule follows the media. A kind-1 note with a video and a
  content warning is covered on the Media card, the Media tile, the Top and All row thumbnail
  and the panel row. It is still shown on its own page (see the gaps below).
- An expired video is stubbed on its own page only. Rows, tiles and embeds still draw it.

### Known gaps

A content warning is still ignored in these places after this change:

- **Photos.** A kind-20 picture with a content warning is shown everywhere it is drawn: cards,
  tiles, row thumbnails, the profile's Photos block, its own page.
- **Note pages and note cards.** A kind-1 note with a content warning shows its pictures and
  plays its videos on its own page, in feeds, and where it is quoted or embedded
  (`ShareNoteCard`, `EmbeddedNoteCard`).
- **The Top stories strip.** It draws the picture of any untitled event: its `image` tag, a
  picture in its words, or the first frame of a video file it links (`pickTopStories` and
  `TopStoryCard` in `RichSections.tsx`). Flagged video kinds are kept out of the strip. A flagged
  event of any other kind is still drawn there.
- **Inside a flagged video's own words.** Where a flagged video is quoted or reposted, only a
  video file and a picture written in its `content` are covered. A platform embed (YouTube and
  the like), a live stream, a link preview's picture and an audio card's cover art are drawn as
  usual.
- **Articles and other addressable kinds quoted by address.** `EmbeddedArticleCard` covers the
  cover of a video kind only. A flagged article shows its cover.
- **Other kinds on their own page.** A kind that carries a video without being a video kind (a
  kind-1063 file, for one) is covered on cards and thumbnails, and shown on its own page.
- **Dictionary list items.** An item of a Dictionary list is drawn from its list's definition
  (`DListItemHero` and the list item cards and rows). A list item has no warning field, so a
  video or picture listed there is shown.
- **Audio.** Tracks and voice notes, and their cover art, are not covered.
- **Expiration on other kinds.** Only video kinds show the expired stub.

## Reference

- `client/src/lib/nip71.ts`: `readVideo`, `publishedAtOf`
- `client/src/lib/nip36.ts`: `contentWarningOf`
- `client/src/lib/nip40.ts`: `expirationOf`, `isExpired`
- `client/src/lib/resultSummary.ts`: `sensitive` on a row's summary, inherited by a repost
- `client/src/components/share/VideoHero.tsx`: the page hero
- `client/src/components/share/SensitiveMedia.tsx`: `SensitiveCover`, `SensitiveTile`,
  `sensitiveVideoLabel`
- `client/src/components/share/NoteContent.tsx`: `videoWarning`, passed by `EmbeddedNoteCard` and
  `ShareNoteCard` for video kinds
- `client/src/components/share/EmbeddedArticleCard.tsx`: the cover of a video quoted by address
- `client/src/components/share/EventScreen.tsx`: the byline date and the expired page
- `client/src/components/share/DeletedStub.tsx`: the `expired` variant
- `client/src/components/share/Lightbox.tsx`: `warning` on a video item
- `client/src/components/share/VideoTile.tsx` and `client/src/pages/SharePage.tsx`: the profile's
  video tiles
- `client/src/components/search/cards.tsx` (`MediaCard`), `RichSections.tsx` (`MediaTile`),
  `SerpRow.tsx` (`RowThumb`), `AllResultRow.tsx`, `PanelMedia.tsx`

## Changes

- 2026-10-11: First version. The hero reads `dim`, loops shorts, and shows the posted date,
  length, Vine stats, hashtags, the capture mark and the link to Divine. Content warnings gate
  the video on the page, the cards, the thumbnails and the lightbox. Expired events show a stub.
- 2026-10-11, after review: the expired stub is for video kinds only. A repost of a flagged
  video and a flagged video quoted in another post are covered. The date is said once, in the
  byline. Length and `dim` are read strictly. Hashtag chips stop at twelve. The cover clamps a
  long reason and hands focus to the video. This brief names the covered surfaces and lists the
  known gaps.
- 2026-10-11, second review: a flagged video quoted by address shows no cover, and one stays
  out of the Top stories strip. A reveal is for one video: another video drawn in the same place
  asks again.
