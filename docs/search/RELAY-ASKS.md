# Search relay — ranking asks (proposal)

For the relay/search team. The UI just shipped a composed results page
(Google-anatomy sections) that works around ranking gaps client-side;
these are the server-side improvements that would let the workarounds
retire. Same posture as the billing/support contracts: **proposal, not
spec** — the semantics matter, the shapes are yours.

Live findings these are based on (staging relay, 2026-09-02):

- "liverpool" best-match returned 11/12 top hits from TWO authors'
  recurring events (eight monthly "Bitcoin Liverpool Meet(up)" 31923s,
  three identical "Cars and coffee" 30311s), while `sort:recent` had
  same-day Liverpool FC transfer news in 1.1s — fresh, relevant content
  exists and best-match buries it.
- Typo handling already works ("liverpol" → Liverpool notes). 👏
- Rank arrives as ORDER only (plain NIP-01 frames) — the UI fetches
  per-author scores separately for its rings/coins; fine as-is.

Endorsement findings (2026-09-03, read-only probe for the reviews work):

- **The `observer:` lens is a set filter, not a ranker.** On a filter-only
  query (`kinds:[1111] #a:[<app>]`) Vitor's observer returns 12 of 14
  Amethyst reviews in the SAME created_at order; jack's returns 0 of 14.
  Filtering before the sort is a fine design — but it means a UI that
  wants "trusted first, the rest after" must fetch `include:spam` and
  order on-device (which the UI now does, labeled). If the lens ever
  learned to demote-not-drop, that client sort could retire.
- **Nostr has no rating primitive for apps.** 845 kind-1111 comments carry
  `#k=32267` corpus-wide; none carries a rating tag (`rating`/`l`/`L`/
  `stars`). Reviews carry `v` (the version reviewed) — useful.
- **Zaps to apps hang off the address and the 1063 file-metadata id**, not
  the 30063 release (`#e` on releases → 0), and each version has two
  competing 30063 events from different publishers — so zap→release joins
  are impossible; the UI keys zaps by `#a` only.
- **Kinds 3 and 1984 are not indexed** (relay-wide zero), so follower and
  report signals come from the Brainstorm API, not the search relay.
- **Kind-1985 `#p` counts are noise** (`pub.ditto.trends` bulk lists +
  ISO-639-1 language labels), not reputation.

## Asks, in value order

1. **Freshness-blended best match.** Default ranking currently appears
   to ignore recency; a decayed-recency term in the blend (weight it by
   query nature if possible — Google: "freshness plays a bigger role
   for current topics") would fix most "stale dump" feel at the source.
   The UI meanwhile requests `sort:recent` explicitly for its Latest
   section.
2. **Index-time near-duplicate clustering.** Recurring events / reposted
   content from one author dominating a page. The UI now collapses
   client-side (author + title-token similarity) but can only see the
   page it fetched; the index sees the corpus. A `cluster_id` (or just
   demoting near-dups past the first) would be strictly better.
3. **Per-author result diversity.** Even without clustering, a cap or
   score decay on the Nth result from the same author in one response
   (Google's host-diversity move) prevents single-author takeovers.
4. **Aggregated engagement signals (v2).** Click-throughs as a ranking
   input needs a privacy design (aggregated + anonymized only) — worth
   a conversation before any implementation.
5. **Counts per kind-group (nice-to-have).** A cheap NIP-45-style count
   per vertical would let the UI label tabs ("Notes · 120") without
   extra full REQs. supported_nips already lists 45.
6a. **Open-vs-closed for repo issues/patches.** The repo cards/pages show
   issue and patch counts via NIP-45 COUNT (kinds 1621/1617 by the repo
   `#a`), but those are TOTALS — distinguishing open from resolved needs
   NIP-34 status events (kinds 1630–1633) folded in. A count that
   respected the latest status per issue (or a queryable `#status` index)
   would let the cards say "12 open" honestly instead of "12 issues".

6. **Index release artifacts (kind 1063) for the app pages.** Zap Store
   releases (kind 30063) reference their APK file-metadata events by
   `e` tag, but those kind-1063 events are not in the index — fetching
   the referenced ids returns nothing (probed 2026-09-02 with Primal's
   latest release). Indexing them would let the app page show file
   size, min SDK, and the APK hash — the "what exactly am I
   installing?" trust details. (App reviews — kind-1111 comments with
   `#a` on the listing address — ARE indexed and power the page's
   "What people say" section and the cards' endorsement lines.)
8. **Batch endorsement summary (server or relay).** The results page now
   shows per-app endorsements — review count, zap count, curated-
   collection count — via three NIP-45 COUNTs per card plus one small
   REQ for faces, capped at four in flight. One call taking
   `addresses[]` and returning `{ reviews, zaps, collections }` per
   address (ideally `collections` as DISTINCT curators, and `zaps` as a
   total across relays) would make an Apps tab of a hundred cards a
   single round-trip. Same shape for people: `{ verifiedFollowers,
   flagged }` per pubkey would retire the per-author `/overview` fan-out
   the rings and the flagged chip share today (the standing batch-score
   ask, restated).
7. **`GET /api/unfurl?url=` proxy (server, not relay).** The SERP's news
   cards currently parse metadata the news bots embed in note content —
   which works shockingly well but only for bot-shaped notes. A tiny
   OG-tag proxy (CORS forbids fetching them browser-side) would light up
   title/description/image cards for EVERY shared link, sitewide.
   **The UI side is wired and waiting** (`services/unfurl.ts`, rendered by
   `components/share/LinkPreview.tsx` on SERP rows and note pages): it
   calls `${VITE_API_URL}/api/unfurl?url=<encoded>` and expects
   `{ title, description, image, siteName }` — bare, or wrapped in
   `data` like the other endpoints. A 404/410/501 opens a session-wide
   breaker (one request, then silence), so shipping the endpoint is the
   only step left; no UI release needed.
9. **Calendar events by `start`, not `created_at`.** The Events tab
   (NIP-52 kinds 31922/31923) wants "upcoming, soonest first" and "past,
   newest first" — the `start` tag, not the publish time. Probed
   2026-09-03: 44k calendar events indexed, but `since:`/`until:` and
   `sort:recent` only know `created_at`, and there is no `start` range
   filter. The UI asks for a 300-deep recent page and does the calendar
   work on-device (`lib/eventFilters.ts`), which means an event posted a
   year ago for next month falls off the page. Two extensions would fix
   it: a `#start` range (`start_since:` / `start_until:` as epoch, or
   generic tag-range filters) and `sort:start`. Same for kind-30311
   streams' `starts`.

## Explicitly NOT asked

- Rank numbers in-band — the UI's per-author score fetch works and keeps
  frames standard NIP-01.
- Personalized re-ranking beyond `observer:` — the observer lens is the
  product; client-side touches (visited-profile pinning) stay on-device
  and labeled.

## 10. Kind 31337 is mostly not music — a track filter, or a content-typed index

Probed 2026-09-04: 8,645 kind-31337 events, but the newest are game state
JSON, AntennaPod ad-skip data and encrypted blobs — none with a `title` or a
`media`/`url` tag. Text search over the kind does return real tracks
(Wavlake, Stemstr, Tunestr), so the UI's Music vertical keeps only hits with a
title and a playable URL (`lib/trackEvent.ts`). A relay-side filter for that
shape — or a "has media" facet — would spare every client the same gate and
let `sort:recent` on Music mean recent songs.

## 11. Fountain — resolved client-side, no proxy needed (2026-09-04)

Earlier note said Fountain episodes needed the link-metadata proxy. Wrong:
fountain.fm answers the browser with `access-control-allow-origin: *`, and its
pages carry artwork, show, title, description and the mp3 itself in Open Graph.
`lib/fountain.ts` reads the page once and the card plays in place. Kept here so
nobody re-asks for a proxy Fountain does not need.
