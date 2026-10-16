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
kinds carry them too. The page itself makes no external read and no relay read of its own. Two
things beside it do, both through what the app already had: the creator's handle is confirmed by
the check the byline already runs (`lib/nip05`), and "More videos" asks for the creator's recent
videos the way their profile does (`useRecentByKinds`).

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
   video, wide (16:9) for landscape or when there is no `dim`. A short starts by itself, muted,
   once it is in view (see Idiom).
3. The title.
4. A facts line: length (`6s`, or `1:05` from a minute up), and for a Vine its loops and likes
   and a "Classic Vine" label. With none of these there is no line.
5. The description.
6. Chips for the hashtags that the title and description do not already carry, twelve at
   most. Each opens the tag's page.
7. "Recorded in the Divine app" or "Recorded in Divine on the web", when Divine's capture check
   is present.
8. "Watch on Divine", when the video is Divine's. Beside it, "Creator on Divine" opens
   `https://divine.video/profile/<npub>`. The creator's NIP-05 handle follows, with its check,
   when it is on `divine.video` or a subdomain of it and that domain confirms it (`Nip05Handle`,
   the check the profile page uses). An unconfirmed handle is left out. So is a handle on any
   other domain: beside Divine's links it would read as Divine's word, and the byline already
   marks a confirmed handle with its check.

Under the comments, "More videos": up to four of the creator's other videos (kinds 21, 22,
34235, 34236) as tiles, newest first, without the one being watched or another version of it.
Each tile is a link to that video's page, named by the video's title, so a new tab and "copy
link" work. Under any other kind the strip is still "More from" the author's notes.

**Profile** (`/p/<npub>`), the Videos block, and the "More videos" strip. Both draw `VideoGrid`:

- The frame follows the videos. Upright shorts stand upright and square videos are square, four
  to a row (two on a phone). Wide videos, and videos with no `dim`, are wide, two to a row. A set
  of mixed shapes shares one square frame, so a row lines up.
- The poster is fitted inside its frame on a dark ground. It is never cut to fill the frame.
- Under each tile: the title, and the posted date from the table above (`published_at`, so a
  restored Vine says when it was first posted).
- On the profile a tile is a button: a tap plays the video in the lightbox, where a short loops.
  "View all" opens the Media tab scoped to the person with its Videos chip chosen
  (`from:<npub> kind:video`, written by `withMediaFacet`). The tab asks for the four video kinds
  alone and its "From <person>" group keeps to them, so the person's photos and picture notes
  are not on that page.

**Links.** An addressable video (34235, 34236) is linked by its address (`/e/<naddr>`, with the
relay hint when one is known), so the link still opens the video after its creator publishes it
again. `ADDRESS_LINK_KINDS` in `lib/shareId.ts` names these kinds. They are apart from
`READER_KINDS`: the address opens this page, never the article reader. Kinds 21 and 22 have no
address and are linked by id.

**Cards, rows and thumbnails in search.** A video event is drawn from the same reading as its
page (`readVideo`), on these surfaces:

| Surface                                                          | What a video event gets                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Media card (`MediaCard`, through `FeedVideo`)                    | A frame in the video's own proportions from `dim`, no taller than 34rem and centred in the card, held before the file loads. Kinds 22 and 34236 loop. Without a `dim` the frame is the one every clip gets, sized by the video once it loads.        |
| All row (`AllResultRow`)                                         | A facts line: the length (`6s`, `1:05` from a minute up, `1:02:05` from an hour up) and, for a classic Vine, its loops with thousands separators (`1,234,567 loops`). Loops of zero and likes are not shown on a row. With neither there is no line. |
| Top page tile (`MediaTile`)                                      | The caption is the title, and the words only when there is no title. The tile keeps the grid's 4:3 shape. An upright or square video is fitted into it whole on a dark ground; a wide one, or one with no `dim`, fills the tile.                     |
| Dates on the All row, the Top row, the card, the tile, the panel | The posted date from the Sources table (`published_at` when it is a believable time, else `created_at`), through `postedAtOf`. The person panel's "Latest" list is ordered by it too. Every other kind keeps `created_at`.                           |

A note that carries a clip (kind 1) is not a video event. It gets none of the above: its card
keeps the one frame, does not loop, and is dated by `created_at`.

`videoShapeOf` in `lib/videoFrame.ts` is the one reading of shape: portrait, square (sides
within 5% of each other) or landscape, and nothing when there is no size or it is not one. The
page's frame and the profile's tiles read it too, and draw a video with no size wide.

A video opened in the lightbox from the Top row's thumbnail, the Top page tile or the person
panel's "Latest" row loops when it is a short (22, 34236), as it does from the profile. A
note's clip plays once.

**Asking for videos in search.** The Media tab has two chips that change what the relay is
asked. Photos and Audio, beside them, only sort through the page already loaded.

| Chip          | Token in the query | What is asked                                                                                     |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| Videos        | `kind:video`       | Kinds 21, 22, 34235 and 34236, and nothing else                                                   |
| Classic Vines | `#vine-archive`    | Kind 34236 with `"#l": ["vine-archive"]` on every filter, a whole page, beside any words, `from:` |

- A chosen chip is that one token in the query, so the address holds it
  (`/?q=dog+kind%3Avideo&t=media`, `/?q=dog+%23vine-archive&t=media`), a link or Back
  reproduces it, and the box shows it as a pill. The chip reads as pressed from the query.
- `kind:video` is the one word the `kind:` operator takes. It means the four kinds wherever it
  is typed, and any tab narrows by it as it does by a number. The four numbers typed out read as
  the Videos chip too. Any other word after `kind:` is plain text, and so is the word "video"
  in a sentence.
- With a chip chosen the tab asks for video events alone: the companion ask for notes that
  carry a clip is not made, and the "From <person>" lead group keeps to the same narrowing.
- Choosing a chip takes out a `kind:` typed beside it. One chip at a time.
- On the Media tab a chip's token is left out of Recent searches. Typed on another tab it is
  the reader's own words and is remembered.
- **The `#vine-archive` exception.** A lone hashtag is a topic and goes to `/t/<tag>`.
  `#vine-archive` alone does not: restored Vines carry the word as a NIP-32 label and never as
  a `t` tag, so the topic page had nothing to show. It stays a search and opens the Media tab
  with Classic Vines chosen. That happens only when the address names no tab; a link, Back or a
  tab the reader picked is kept. Every other hashtag, hyphenated or not, goes to its topic page.
  Off the Media tab, and in the Top page's bands, `#vine-archive` is asked as any hashtag is.

**The content warning.** The rule this view adds for a video its creator marked sensitive, on
these surfaces and no others:

| Surface                                                                                                                   | A video its creator marked sensitive                                                          |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Media card (`MediaCard`)                                                                                                  | The cover with "Show video" in place of the player, in the frame the player will take         |
| A video quoted by event id (`nostr:nevent…`, a `q` or `e` tag), or carried in a repost (kind 6 or 16): `EmbeddedNoteCard` | The cover in place of a clip in its `content`, and a placeholder in place of a picture there  |
| A video quoted by address (`nostr:naddr…`, an `a` tag): `EmbeddedArticleCard`                                             | The "Sensitive" tile in place of the card's cover, which is the event's top-level `image` tag |
| Media tile (`MediaTile`)                                                                                                  | A neutral tile labelled "Sensitive" in place of the picture                                   |
| Profile video tile, and a "More videos" tile (`VideoTile`)                                                                | The same tile                                                                                 |
| Top row thumbnail (`SerpRow`)                                                                                             | The same tile                                                                                 |
| All row thumbnail (`AllResultRow`), a repost of the video included                                                        | The same tile                                                                                 |
| Person panel "Latest" row (`PanelMedia`)                                                                                  | The same tile                                                                                 |
| Lightbox, opened from any of those tiles                                                                                  | The cover first, then the video                                                               |

A flagged tile is named `Sensitive video: <title>` for a screen reader. An unflagged tile that
plays the video where it is (a button) says "Play", with the title when there is one. A "More
videos" tile is a link to the video's page and is named by the title alone.

A flagged video is also kept out of the Top stories strip. The strip draws a picture large and
has no place to ask first, so the video reads as a row, where its thumbnail is the tile.

## Idiom

- A short loops. On its own page it also starts by itself, muted, once it is at least 60% in
  view, and pauses when it leaves. The player's own controls stay, and they are how the reader
  turns the sound on.
- It waits for a press instead when the device asks for reduced motion, or reports a data saver
  or a slow connection (`lib/connection`). A full-length video (21, 34235) always waits.
- The page begins watching a video once: as it appears, or a moment later when the device
  first allows it and the reader has not started the video themselves (a browser's first
  reading of the connection can be wrong on a cold load). The video is muted at that moment and
  never again.
- If the device stops allowing it after the video has begun (reduced motion or a data saver
  turned on, the connection slowing), what is playing is left alone. It still pauses when it
  scrolls out of view or the tab goes to the background, and the page does not start it again
  while that lasts. Once the device allows it again, the video starts the next time it comes
  into view, unless the reader has paused it.
- What the reader does at the controls is kept (`useAutoplayInView` in `lib/feedVideo.ts`, for
  the page's own video only):
  - A pause holds. The video does not start again by itself, however the page is scrolled,
    until the reader presses play.
  - With the sound on it keeps playing when it scrolls out of view. The reader chose to listen.
  - Muted and started by the page, it pauses when the tab goes to the background and plays
    again when the tab is back, if it is still in view and the reader has not paused it. A
    pause that comes to a muted video while the tab is hidden is the browser's, not the
    reader's. With the sound on, a pause in a hidden tab is the reader's (a media key, the
    browser's media controls) and holds like any other. In a tab that opened in the background
    the video waits for the tab to come to the front.
- The page's video is the lead. While it is in view, or playing with the sound on wherever it
  is, a clip in a reply does not start by itself over it.
- The player belongs to the video file. A newer version of the event with the same file leaves
  it playing as it was.
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
- After "Show video", keyboard focus moves to the video. What it does next depends on where
  it is:
  - On the video's own page it waits, paused, for the reader to press play. A flagged video
    never starts by itself there.
  - In the lightbox it starts at once, with its sound, as every clip opened there does.
  - In a Media card, and where a flagged video is quoted or reposted in a note, the clip is the
    one every note's clip gets (`FeedVideo`): it starts muted once it is in view, unless the
    device asks for reduced motion or is on a slow connection.
- Thumbnails never offer a way through in place. Their tap opens the event page or the
  lightbox, and both show the cover first.
- "Watch on Divine" and "Creator on Divine" open in a new tab with `rel="noopener noreferrer"`.
- The warning is the creator's own label. Brainstorm does not classify videos, and an unlabelled
  video is shown as it is.

### Notes

- On thumbnails and Media cards the rule follows the media. A kind-1 note with a video and a
  content warning is covered on the Media card, the Media tile, the Top and All row thumbnail
  and the panel row. It is still shown on its own page (see the gaps below).
- An expired video is stubbed on its own page only. Rows, tiles and embeds still draw it.

### Known gaps

On the video's page:

- **Picture-in-Picture.** The page's watch does not know when its video is in a
  Picture-in-Picture window. `FeedVideo` does (`usePipAwareAutoStop`); the page's player has no
  such handling yet, with the sound on or off.
- **The handle beside Divine's links** is printed as the profile wrote it, less a leading `_@`
  (`Nip05Handle`). It is not lowercased or otherwise tidied.

In search:

- **Restored Vines from the `user-submitted-archive` source.** These carry a `source` tag of
  `user-submitted-archive` and usually no `dim`, duration, `loops` or `published_at` (72 of a
  sample of 300 restored Vines on the search relay, 2026-10-12, and none of the 72 had any of
  the four). They keep the wide frame, show no facts, and are dated by `created_at`, which is
  the day they were imported.
- **The lead group under Classic Vines.** The "From <person>" group reads the person's 40
  newest kind-34236 events and then keeps the ones carrying the archive's label. A creator
  with more than 40 newer shorts of their own shows no Vines there. The results under it are
  asked by label and are not affected.
- **A flagged card with no `dim`** keeps the wide cover, so "Show video" can still change the
  frame's size.

A content warning is still ignored in these places:

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
- `client/src/lib/videoFrame.ts`: `videoShapeOf`, `videoFrameStyle`
- `client/src/lib/eventDate.ts`: `postedAtOf`, the date a row, card or tile shows
- `client/src/lib/mediaFacet.ts`: the Videos and Classic Vines chips as tokens in the query
- `client/src/lib/searchQuery.ts`: `kind:video`; `client/src/lib/topicQuery.ts`: the
  `#vine-archive` exception
- `client/src/lib/resultReaders.ts`: the row facts for kinds 21, 22, 34235 and 34236
- `client/src/services/search.ts`: what Classic Vines asks
- `client/src/components/share/FeedVideo.tsx`: `dim`, `loop`, `feedVideoFrame`
- `client/src/lib/nip36.ts`: `contentWarningOf`
- `client/src/lib/nip40.ts`: `expirationOf`, `isExpired`
- `client/src/lib/resultSummary.ts`: `sensitive` on a row's summary, inherited by a repost
- `client/src/lib/shareId.ts`: `ADDRESS_LINK_KINDS`, `eventPath`
- `client/src/lib/feedVideo.ts`: `useAutoplayInView`, its lead, and what it keeps of the
  reader's own pause and sound
- `client/src/components/share/VideoHero.tsx`: the page hero
- `client/src/components/share/VideoGrid.tsx`: the tiles on the profile and under a video
- `client/src/components/share/VideosBlock.tsx`: the profile's Videos block and its "View all"
- `client/src/components/share/MoreFromAuthor.tsx`: "More videos"
- `client/src/components/Nip05Check.tsx`: `Nip05Handle`, the verified handle
- `client/src/components/share/SensitiveMedia.tsx`: `SensitiveCover`, `SensitiveTile`,
  `sensitiveVideoLabel`
- `client/src/components/share/NoteContent.tsx`: `videoWarning`, passed by `EmbeddedNoteCard` and
  `ShareNoteCard` for video kinds
- `client/src/components/share/EmbeddedArticleCard.tsx`: the cover of a video quoted by address
- `client/src/components/share/EventScreen.tsx`: the byline date and the expired page
- `client/src/components/share/DeletedStub.tsx`: the `expired` variant
- `client/src/components/share/Lightbox.tsx`: `warning` and `loop` on a video item
- `client/src/components/share/VideoTile.tsx`: one tile, in the frame it is given, a button or
  a link
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
- 2026-10-12: Search. A Media card frames a video event by its `dim` and loops a short. The All
  row says its length and a classic Vine's loops. The Top tile is captioned with the title and
  fits an upright or square video whole. Rows, cards, tiles and the person panel date a video by
  `published_at`. The Media tab offers Videos (`kind:video`) and Classic Vines (`#vine-archive`),
  and `#vine-archive` alone opens there in place of its topic page.
- 2026-10-12 (issue #212, the page, profile and links): a short starts muted on its own page.
  The page links to the creator on Divine and shows their confirmed handle. "More videos" under a
  video. Profile tiles follow the videos' shape, cut nothing and carry the posted date, and "View
  all" asks for videos only. The lightbox loops a short. An addressable video is linked by its
  address.
- 2026-10-12, after review, on top of the search change: "View all" writes `kind:video`, so
  the page it opens is videos only. One reading of shape (`videoShapeOf`). A short opened in the
  lightbox from search loops. On the video's page a reader's pause holds, the sound they turned
  on is not cut by a scroll, and a muted video rests while the tab is in the background. The
  player is muted once and survives a republish of the same file. "More videos" tiles are links.
  The handle beside Divine's links is a `divine.video` handle only.
- 2026-10-12, second review: with the sound on, a pause in a hidden tab is the reader's. A
  video already playing is left alone when the device stops allowing autoplay, and is not
  started again while that lasts. A grid of video tiles is buttons or links, never neither.
