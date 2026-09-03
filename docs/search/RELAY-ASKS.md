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
6. **Index release artifacts (kind 1063) for the app pages.** Zap Store
   releases (kind 30063) reference their APK file-metadata events by
   `e` tag, but those kind-1063 events are not in the index — fetching
   the referenced ids returns nothing (probed 2026-09-02 with Primal's
   latest release). Indexing them would let the app page show file
   size, min SDK, and the APK hash — the "what exactly am I
   installing?" trust details. (App reviews — kind-1111 comments with
   `#a` on the listing address — ARE indexed and already power the
   page's Reviews section.)
7. **`GET /api/unfurl?url=` proxy (server, not relay).** The SERP's news
   cards currently parse metadata the news bots embed in note content —
   which works shockingly well but only for bot-shaped notes. A tiny
   OG-tag proxy (CORS forbids fetching them browser-side) would light up
   title/description/image cards for EVERY shared link, sitewide
   (`components/share/LinkPreview.tsx` was built awaiting exactly this).

## Explicitly NOT asked

- Rank numbers in-band — the UI's per-author score fetch works and keeps
  frames standard NIP-01.
- Personalized re-ranking beyond `observer:` — the observer lens is the
  product; client-side touches (visited-profile pinning) stay on-device
  and labeled.
