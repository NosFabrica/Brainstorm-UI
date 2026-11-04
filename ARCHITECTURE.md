# Brainstorm Shell

## Overview

Brainstorm Shell is a web application built with React, TypeScript, and Vite, providing a user interface for the Brainstorm platform. It integrates Nostr login via NIP-07, offering social graph visualization, GrapeRank reputation scoring, and Web of Trust (WoT) concepts. The application aims to give users insights into their social network and influence within the Nostr ecosystem, including profile metadata fetching, social graph exploration, and NIP-85 service provider activation.

**Anonymous, search-first experience:** Logged-out visitors land on a Google-style search-first home at `/`, and can run searches and view full profile pages using the NosFabrica ("house") trust perspective with no login. Sign-in via NIP-07 stays optional and unlocks the personalized "My WoT" perspective plus account-only pages (Dashboard/Network/Settings/My Panel/Admin/Onboarding), which are hidden from anonymous visitors via a `RequireAuth` wrapper in `client/src/App.tsx` (redirect to `/`, no previews). Routes are code-split: every route except the search-first home, the public profile page (`/p/:id`) and the 404 loads on demand (`client/src/lib/lazyWithReload.ts`, which reloads once if a deploy removed the chunk), behind one `<Suspense>` in `client/src/App.tsx`. The admin guard lives in `client/src/pages/AdminRoute.tsx` and loads the console as its own chunk. Public routes: `/`, `/search`, `/profile/:npub`, `/faq`, `/what-is-wot`. The header on public pages shows a subtle "Sign in" button (`client/src/components/SignInButton.tsx` — NIP-07 + KeySignInModal), and locked features (e.g. follow/mute/report on a profile) show inline sign-in prompts. Anon-viewable data calls (`getUserByPubkey/getUserOverview/getUserStats/getUserConnections`) use `optionalAuthFetch` in `client/src/services/api.ts`: it routes through `authenticatedFetch` only when a session exists (`brainstorm_session_token` OR `nostr_user`), otherwise a plain fetch with NO redirect/storage-wipe side effects — so anon 401s degrade gracefully (e.g. "Profile not found") instead of bouncing to `/`. **Backend gap:** token-less serving of house-POV profile scores (`/user/{pubkey}/overview|stats|connections`) is coordinated separately; until it lands, anonymous profile data 401s and the page shows the graceful empty state.

## System Architecture

The application uses a React 18 frontend with TypeScript, Vite, Tailwind CSS, and shadcn/ui. Routing is managed by `wouter`. An Express.js backend proxies API requests to mitigate CORS issues, especially for Nostr profile fetching and NIP-05 resolution.

**Key Architectural Decisions:**

- **UI/UX:** Features a dark-theme with glassmorphism, gradient texts, and CSS-only animations. Designs emphasize polished user experiences for login, dashboard, and other core pages, including animated graph backgrounds and custom SVG icons.
- **Nostr Integration:** Utilizes `applesauce-core` for NIP-07 login and profile handling, and `nostr-tools` for `nip19` encoding. Authentication uses a challenge-response mechanism with the Brainstorm backend via kind 22242 events.
- **Data Management:** React Query is used for data fetching, caching, and state management for user profiles, GrapeRank results, and social graph data.
- **Feature Specifications:**
  - **Authentication:** NIP-07 based challenge-response login with session tokens stored in `localStorage`. Silent re-authentication on 401 (expired token) via `silentReauth()` in `client/src/services/api.ts` — automatically re-authenticates using NIP-07 extension without user intervention on hard refresh. Falls back to login redirect if extension unavailable. A 429 on that re-auth (login rate limit) is an ordinary error: nobody is signed out or redirected. All protected pages guard against error flash during auth redirects via `isAuthRedirecting()`.
  - **Dashboard:** The signed-in home: search, trust status, alerts, and what the network is reading. Supported Clients carousel has 3 slides: Amethyst, Nostria, and a Developer CTA ("Get Your Client Featured") linking to `/faq?tab=developers`. **First screen (2026-10-05):** the greeting is compact (`PageHeader size="compact"`: one line, kicker from `sm` up, no slogan subtitle), the Trust Signals card is a one-line strip for every cohort (state · updated · Recalculate · View insights; the state reads "Active" once the kind-10040 names Brainstorm, "Scores ready" when published, else progress/failure — never a raw score), and the body carries at most ONE prompt as a line under the title — `lib/dashboardPrompt.ts` picks activate › consent re-ask › invite › publish-assistant; the header's Finish-setup pill lists the rest. The Activate panel, the legacy Select-Brainstorm card, the invite card and the expandable "Your network · Active" badge (with its compatible-clients chips and inline assistant nudge) are gone. Below that the page stays stacked full-width: alerts, "Reading from your network", threads (a two-column desktop was tried and turned down). `AlertsBanner` is a single row with a text link. **Search first (2026-10-12):** Brainstorm is a search app, so the signed-in home carries the shared `SearchBox` under the header row (the `AppHeader`'s own box is off on this page) and no longer a network widget: the "Your Network" card is gone, and its reach and trust-health tiles moved to the Network page as `NetworkReachStrip` (`lib/networkReach.ts` folds the run's `count_values` by hop range; the card's invented fallback numbers did not move with it).
  - **Network Alerts:** Accounts in the observer's network that verified people report past the backend's threshold (`GET /networkAlerts`, counts only: reporters, muters, followers, hops, influence). The dashboard shows a banner only when a direct follow is flagged — the count, a "new since you last looked" chip, a quieter line for the wider network, and **Manage alerts** (`components/dashboard/AlertsBanner.tsx`). The list and its actions (ignore, unfollow, mute, report) live on `/alerts` (`pages/AlertsPage.tsx`); opening a row shows the reader's history with the account (`lib/interactionSummary`, from their own follows, mutes, DMs on this device and their own notes/reactions/reposts tagging it — never sent anywhere) and who reported it, grouped as people they follow, verified, unverified (`lib/reporterBreakdown`, reporters from `/user/{pubkey}/connections?kind=reported_by`, asked only when a row opens). Ignore/acted state is per account (`hooks/useAlertPrefs`), synced to the account's NIP-78 list; visiting `/alerts` marks the current set seen.
  - **Search Page:** Provides a lookup tool for `npub`, hex pubkeys, and NIP-05 handles, redirecting to the Profile page upon successful lookup. Free-text profile search goes to the search relay (`VITE_SEARCH_RELAY_URL`) over NIP-50, ranked through an `observer:` — see the search relay notes below. People pickers use `suggestProfiles()` (`client/src/services/search.ts`, house Perspective), like the search box. Admin people search uses `searchNostrProfiles()` (`client/src/services/nostr.ts`), which retries with `include:spam` when the house Perspective finds nobody.
  - **Global Trust Perspective (POV):** The selected POV (NosFabrica "house" vs the logged-in user's "My WoT") is a global app-level setting persisted in `localStorage` key `brainstorm_active_pov`. Source of truth: `useActivePov()` hook in `client/src/hooks/useActivePov.ts` (with `getActivePov`/`setActivePov`/`hasStoredPov` helpers, plus same-tab `brainstorm-pov-changed` CustomEvent and cross-tab `storage` event sync). Availability of "My WoT" is gated by `useHasMywot()` in `client/src/hooks/useHasMywot.ts` (true iff `/user/self` returns a `history.ta_pubkey`). **Login default:** if the user has never picked a perspective (`!hasStoredPov()`) AND already has a calculated trust graph (`hasMywot === true`), `HeaderPovChip` auto-initializes the perspective to `"mywot"`; otherwise it falls back to `"nosfabrica"`. The desktop header no longer renders a standalone POV chip. Instead, a small colored badge is overlaid on the bottom-right of the user avatar (indigo with the NosFabrica logo when POV=nosfabrica, emerald with the user's picture/initial when POV=mywot) — see `<PovBadge user={user} />` from `client/src/components/PovBadge.tsx`. The actual switcher lives inside the avatar dropdown menu as the top section via `<PovMenuSection user={user} scope=... />`, mirroring the MobileMenu pattern so there is only ever one dropdown next to the avatar across every authenticated page (Search, Dashboard, Profile, Network, Settings, Admin, UserPanel, FAQ). The auto-default-to-mywot effect (when `!hasStoredPov && hasMywot`) lives in a single `<PovAutoDefault />` mounted once in `client/src/App.tsx` so it runs regardless of which page is active. When `!hasMywot`, the "My WoT" row in the dropdown is dimmed and shows a "Calculate yours →" deep-link to `/settings` (data-testid `link-calculate-yours`). Mobile users still see a "Trust Perspective" section at the top of the MobileMenu drawer. The Search page's previous inline POV switcher inside the search input has been removed in favor of this single global control. **Backend support gap:** search follows the perspective (the search relay ranks through its `observer:`; My WoT only once `useIsSearchObserver` confirms the relay can, see `useSearchPov`), but `/user/{pubkey}/overview`, `/user/{pubkey}/stats`, and `/user/{pubkey}/connections` take no perspective of their own. So Profile/Dashboard scores are always rendered from the logged-in user's personalized graph regardless of the global POV setting (the Network page and the profile connection lists honour it, by requesting the unauthenticated house view when Brainstorm's perspective is selected). The chip on those pages is passed `scope="page-not-supported"`, which surfaces an honest amber warning inside the dropdown ("Scores on this page always reflect your personalized view. House-perspective scores aren't supported by the backend here yet."). Search passes `scope="global"` because the toggle actually drives data there and defensively normalizes `mywot+!hasMywot` to `nosfabrica` before issuing the request.
  - **Profile Page (`/profile/:npub`):** Shows trust score, social reach, risk assessment, shared connections, and raw API data. Allows drill-down into expanded lists and navigation to other profiles. Risk Assessment section shows a "Flagged" indicator (red styling) when the viewed profile exists in the observer's own flagged list (`low_and_reported_by_2_or_more_trusted_pubkeys` from `/user/self`), since flagged status is relative to the observer's trust graph. **Connection pills (Option B):** Each row in the expanded Followers/Following/Mutual/Shared panels renders at most two clustered relationship pills via `deriveConnectionClusters()` in ProfilePage.tsx — a teal **owner ↔ them** pill (Mutual / Follower / Following with ↔/←/→ icons) reflecting the profile owner's relationship, and an indigo **you ↔ them** pill (Mutual with you / Follows you / You follow) reflecting the logged-in user's relationship. Replaces the previous 4-word-pill layout (Following/Mutual/Shared Follower/Shared Following) which was redundant and confusing. Mute/report pills still render as their own separate badges next to the cluster pills. The current section's own group key is still filtered out (e.g. inside the "shared_followers" panel, the "Follows you" you-cluster pill is suppressed). Test IDs: `pill-owner-<link>-<pk8>`, `pill-you-<link>-<pk8>`. Expanded panels for report/mute sections fetch metadata directly from Nostr relays on expand: kind 1984 events for reports (showing report type badge, relative timestamp, reason) and kind 10000 events for mute lists (showing mute list update timestamps). Report type badges use color-coded styles (spam=amber, impersonation=red, nudity=pink, illegal=red, profanity=orange, other=slate). **POV mitigation (frontend-only — `/user/{pubkey}/overview|stats|connections` take no perspective):** Search → Profile navigation appends `?pov=nosfabrica|mywot` reflecting the user's POV at click time; the Profile page reads the URL POV (preferred) or the global POV via `useActivePov()` to derive `effectivePov`, which is compared against the always-personalized `RENDERED_POV = "mywot"`. When `povMismatch === true`, a dismissable amber banner (`banner-pov-mismatch`) renders at the top of the profile header card explaining the gap and linking to a FAQ entry. The Brainstorm score badge in the header is now a **dual-meter widget (Variant B)**: when a NosFabrica-perspective rank is known (`ProfileSeed.wotRankNosfabrica` from the search seed, else `apiClient.getHouseInfluence`), two side-by-side mini meters render — left = NosFabrica (indigo `#6366f1`, `meter-nosfabrica`), right = You (emerald `#10b981`, `meter-you` from personalized API) — with a small agreement chip below ("Both perspectives agree" / "Slight difference · N pts" / "Perspectives diverge · N pts"). When no NosFabrica rank is known, it gracefully degrades to a single "You" meter (no empty cell). Tier color and confidence banner stay anchored to the personalized score — the mismatch banner carries the perspective story instead of letting colors flicker between Search and Profile.
  - **Network Page:** A CRM-style social graph explorer for managing connections by group with filtering and search. Includes a "Flagged" group (red `#ef4444`) sourced from the API field `low_and_reported_by_2_or_more_trusted_pubkeys`. Detail panel shows a "Flagged" badge when the user is in the observer's flagged list (not from per-profile API data). **Perspective (2026-10-05):** the page follows the Brainstorm / My perspective toggle like the profile connection lists do (`lib/networkPerspective.ts`: the reader's own when signed in, calculated and chosen; else Brainstorm's via `house: true` on `/user/{pubkey}/connections|stats|overview` and `/user/{pubkey}`), and says so in a line under the title with the Verification Score explainer — no second switch there or on the connection lists: the perspective is changed in the account menu alone, and pages state the result. **One trust signal per row:** the avatar's tier ring and the shared `VerificationCoin` (`components/network/NetworkProfileCard.tsx` `trustAvatar`), following the display mode and granularity settings and showing Flagged; the hand-drawn hollow ring beside each row is gone. Group pills and chips read as directions ("Follows you", "You follow", "Muted you", …; `networkGroups.tsx`), and the trust filters are the ladder's rungs (`ladderFor`) in its colours.
  - **FAQ Page (`/faq`):** Product-specific FAQ with two-tab layout ("Using Brainstorm" for end users, "For Developers" for NIP-85 client integration). Supports `?tab=developers` query param deep-linking. Uses accordion Q&A pattern matching WhatIsWotPage style. Accessible to both authenticated and unauthenticated users. Linked from user dropdown menu (above Settings) and mobile navigation (above "What is WoT?") on all pages.
  - **What is WoT? Page:** An educational resource with interactive trust scenarios.
  - **NIP-85 Service Provider Activation/Deactivation:** A guided process for activating Brainstorm as a NIP-85 service provider (Kind 10040 event). Users can also deactivate from the Settings page, which publishes a replacement Kind 10040 event with empty tags to relays, clearing the provider declaration. Deactivation clears `brainstorm_nip85_activated` from localStorage and reloads the page. Functions: `signNip85()` and `signNip85Deactivation()` in `client/src/services/nostr.ts`.
  - **Settings Page:** Manages NIP-85 status (activate/deactivate/republish), GrapeRank calculation triggers, and trust perspective settings. NIP-85 and GrapeRank buttons are disabled when `hasNoFollowing` is true (user has no follows). Trust Perspective presets (Relax/Default/Strict) are functional and **server-persisted**: picking one PUTs `/user/graperank/preset` and invalidates the stats / overview / connections queries (`invalidatePresetDrivenReads` in `client/src/hooks/useTrustPresetSync.ts`) so Dashboard, Network and Profile reload under the new preset. The preset carries three per-relationship cutoffs (follower/muter/reporter) that only the backend knows — the frontend sends no threshold and renders the `verified` / `tier` fields the endpoints return. `localStorage["brainstorm_trust_preset"]` is now just a cache of the server's answer. Utility module: `client/src/services/trustThreshold.ts` (preset ↔ backend-name mapping and the fixed tier bands only). Includes a "Contact & Support" section at the bottom with two cards: "List Your Client" (developer outreach for NIP-85 client listings) and "Get in Touch" (general support), both linking to `support@nosfabrica.com`.
  - **Admin Dashboard (`/admin`):** NosFabrica Macro Admin Dashboard accessible only to whitelisted pubkeys (configured in `client/src/config/adminAccess.ts`). Features: KPI cards strip (Total Pubkeys, Followers, Following, Queue Depth, Reports Filed), tab-based navigation (Overview, Activity, Users, Assistants, System Health), sortable/searchable/paginated user directory from graph data, GrapeRank pipeline status, relay and API health monitoring, infrastructure overview, and activity log. The "Assistants" tab surfaces Brainstorm Assistant publish metrics (total assistants, total publishes, last 24h/7d, last publish time) and a per-user publish history table backed by `/admin/assistants/stats`, `/admin/assistants`, and `/admin/assistants/:pubkey/history`. Unsupported admin API endpoints show "Not Connected" status badges. Admin link appears in profile dropdown menus (amber-styled) and MobileMenu only for whitelisted pubkeys. Non-admin users are redirected to `/dashboard`. Expanding any user row in the Users tab renders a **Nostr Health** card (`client/src/components/admin/NostrHealthCard.tsx`) under the Identity strip with two live-from-relays panels: Trust Provider List (kind 10040) with per-tag checks (event present, `30382:rank`/`30382:followers` tags, inner pubkey matches assigned TA, relay hint matches `VITE_NIP85_RELAY_URL`) using existential ("any matching tag wins") semantics matching `isUsingBrainstorm`, and Profile Metadata (kind 0) with avatar/name/nip05/about plus a Brainstorm Assistant detection badge (green when the `website` field references a known Brainstorm host) and an "Assigned Brainstorm Assistant" sub-section that fetches the assistant's own kind 0 (resolved from admin-assigned `taPubkey`, falling back to `30382:rank`/`30382:followers` inner pubkey from kind 10040; "Self-assigned" badge when the assistant pubkey equals the user). Both panels include collapsible raw-JSON viewers with copy buttons. When a user has multiple `30382:rank` or `30382:followers` tags published in their kind 10040, an "All published tags" disclosure surfaces every tag with per-tag pubkey/relay pass-fail badges (winner = green "Active", non-matching = amber "Stale", non-matching but harmless = neutral "Duplicate"); the overall status pill bumps to amber "Issues found" when stale duplicates exist so admins can detect leftover/old tags from prior activations. Backed by `checkNip85Health()` in `client/src/services/nostr.ts` (`Nip85TagDetail` type, `rankTags`/`followersTags` arrays).
  - **My Panel Page (`/panel`):** Web of Trust management center for logged-in users. Features: Account Overview header strip (pubkey, NIP-85 status, network size, last calc timestamp), Brainstorm Assistant Profile publishing (kind 0 event with website field — calls backend endpoint with graceful "Coming soon" fallback if 404), Invite & Add Users section (shareable invite link + add-by-npub lookup), Network Score Monitor (sortable/searchable table of followed accounts with trust scores, tier badges, and trend indicators comparing to locally cached previous scores), Trust Attestation History (chronological log of TA publish events with timestamps, event kind, relays, success/failure status), and DCoSL Lists scaffold (Coming Soon placeholder). API method: `apiClient.publishBrainstormAssistantProfile()` in `client/src/services/api.ts`.
  - **Dashboard Empty State:** When users have no follows (`hasNoFollowing`), the dashboard hides the Network Health section and recalculation panel, showing only the welcome header with "Set up your trust network" subtitle and the "No follows yet" banner. Trust Signals badge shows step-specific status during calculations: "Calculating…" → "Publishing…" → "Complete".
- **Performance Optimizations:** Includes 60-second timeouts for server proxy routes, fetches the logged-in user's profile metadata (kind 0) immediately at login (fire-and-forget in `completeLogin` in `client/src/services/nostr.ts`) so the avatar/name appear sooner instead of waiting for the dashboard to mount — `setCurrentUser` dispatches the `brainstorm-user-changed` event on profile-field changes (not just pubkey changes) so the header/menu re-render reactively, and the dashboard's `profileQuery` stays gated on missing name/picture so it skips the duplicate fetch once login populates them. **Profile fetch HTTP fast-path:** `fetchProfile()` in `client/src/services/nostr.ts` no longer waits on the websocket relay query alone — it races a CORS-enabled HTTP fast-path (`fetchProfileHttp()`, querying `https://nostrhttp.com/<npub>` and `https://api.nostr.band/v0/stats/profile/<npub>` in parallel) against the existing relay query (`fetchProfileFromRelays()`) via `firstTruthy()` (first source to yield a valid kind 0 wins; falls back to `undefined` only after all settle, so there is no regression if the HTTP gateways are unavailable). `extractKind0Content()` is a recursive JSON scanner that pulls the kind 0 event out of either gateway's envelope (nostrhttp.com returns a bare event array; api.nostr.band wraps it under `profiles[].event`). Requests use only the safelisted `Accept: application/json` header to avoid CORS preflight. Note: there is no Express backend in this project — `npm run dev` runs Vite only and production is a static file server, so all Nostr fetching happens directly from the browser (CORS matters). Uses branded loading animations. Network page search uses on-demand debounced profile fetching (500ms delay, batches of 50, max 500 uncached profiles) instead of eager bulk loading — keeps initial page load fast while enabling name-based search across the full group.

## Relay routing (NIP-65 / outbox model)

`client/src/lib/relayRouting.ts` is the single answer to "which relays". Read an
author from the relays they **write** to; send an event that names someone to
the relays they **read** from; stamp `e`/`a`/`p` tags with a relay hint.
`PROFILE_RELAYS` in `lib/relays.ts` is a floor under both, never the whole
answer. `publishRelaysFor()` composes a publish's destination set, and
`publishToRelays(event, extraRelays)` unions anything a call site adds.

Our search relay (`VITE_SEARCH_RELAY_URL`, `wss://search.brainstorm.world/`) is
in both read floors (`PROFILE_RELAYS`, `CONTENT_RELAYS`): it indexes far more
than the public relays. It refuses a plain read without sign-in, so the pool's
relay adds the NIP-50 `include:spam` token to any filter sent there that has no
`search` of its own (`withSearchToken`, `lib/relayPool.ts`). It is an index, not
a publish target: publishes leave it out.

My-WoT search is offered (once the Account has an assistant, `useHasMywot`'s `taPubkey`) only
when the search relay already ranks through the Active Account: one REQ on the search socket,
`{kinds:[0], limit:1, search:"observer:<Active Account>"}`. The observer gate fails closed, so any
profile back means a projected rank (`isSearchObserverOnRelay`, `services/searchObserver.ts`).
Nothing back, an error or a timeout is "not yet". While the relay is still projecting a new
assistant's cards, ranking can be partial for a few minutes. A "yes" is kept for the session
(re-asked if the Account's 10040 changes); a "no" is re-asked every minute.

A read with many authors goes through `planOutboxReads()` + `requestAllByRelay()`
instead, so each relay is asked only about the authors it serves, under a
connection budget chosen by set cover.

The routing table has to be **loaded** — a kind-10002 the event store never saw
is not a routing decision, it is the fallback wearing one. `loadRelayList()`
does that, bounded to 2.5s with a five-minute miss cache. Rationale, caps, and
what stays default-routed: [docs/adr/0003-nip65-outbox-routing.md](docs/adr/0003-nip65-outbox-routing.md).

## Warming the routing table

Routing is needed when an event is SIGNED, which is the worst moment to look it
up: a lookup then is dead air before the signer prompt, and one that loses its
race publishes to the default relays and misses the recipient's inbox silently.

So: **anything that puts a person or a note on screen warms the relay lists of
the people it names** — `warmRelayLists(pubkeys)` in `lib/relayRouting.ts`,
fire-and-forget and bounded. It is already wired into `fetchProfileMap`,
`fetchProfiles` and `fetchProfileEvent`, which is how every surface showing a
person or a note resolves its authors; a surface that renders people some other
way needs the call adding.

## Durable event cache

The `eventStore` is in-memory, so every reload used to rebuild the routing
table from relays: NIP-65 list, then contact list, then profile — two dependent
round trips before the app knew who you followed.
`client/src/lib/eventCache.ts` keeps the small replaceable kinds (0, 3, 10002,
10040, 10050) in IndexedDB, plus the active account's own mute list (10000), and
hydrates the ACTIVE account's own back into the store at boot, from `main.tsx`,
before the first render.

It is also the address loader's `cacheRequest` — step one of the loading
sequence, ahead of any relay — so other people's profiles and relay lists come
off disk too. Entries are kept until evicted. A hit ends the sequence, so to
keep a relay list seen once from pinning its author forever, an entry older
than its freshness window (30 minutes for routing, an hour for profiles) still
answers but is refreshed from the relays behind the answer.

Three rules it lives by: hydrated events are **signature-verified** (IndexedDB
is writable by anything with script on the origin, and a forged kind-10002
steers where we publish); everything hydrated is **revalidated** against the
relays straight after (the address loader stops at its first hit, so a cache
without a refresh would pin a user to a stale relay list forever); and the
cache is **dropped on sign-out**. Rationale:
[docs/adr/0003-nip65-outbox-routing.md](docs/adr/0003-nip65-outbox-routing.md).

## Where tags are read from

Two sources, by what the surface needs:

- **Search** (the popup's tag rows, the People tab and the Everything strip) reads the
  **search relay**. Each tag is a kind-30392 list of the people who carry it, per
  perspective: `title`, `description`, `observer`, `source-tag` (`[id, tag author, slug]`)
  and, in the content, `members: [{pubkey, endorsements, disputes, score}]`, best first. One
  ask by the words answers in well under a second (`services/searchTags.ts`,
  `hooks/useSearchTags.ts`). A lists-only ask (`kinds:[30392]`) returns every observer's copy,
  so the client keeps the one whose `observer` is the perspective it asked through; asking for
  `kinds:[0,30392]` also returns each list's people right behind it. The relay matches words
  and prefixes, not typos.
- **Browsing and tagging** (the tags page, a tag's page, a profile's tags, the tag picker) read
  the **tag hub** (`services/tags.ts`), because they need every tag and who applied it. That
  is a walk of the whole catalogue and is slow; search must not depend on it.

## Private messages (NIP-17)

`services/dm/` runs one `DmEngine` per Active Account from sign-in: a live
subscription for wraps since the last visit (minus NIP-59's two-day back-dating,
at most a week) and a per-relay history pager below it, driven by on-screen
relay markers (`lib/dm/pager.ts`, ported from Amethyst). Wraps are opened by the
account's signer — in the background only for a local key; extensions and
bunkers wait for Messages to open — and kept sealed with the device key in
IndexedDB (`lib/dm/cache.ts`), dropped on sign-out. The store groups messages
into Chats by participant set; `lib/dm/inbox.ts` shelves them into Chats and
trust-sorted Requests. UI: `pages/MessagesPage.tsx` and `components/messages/`;
inbox relays (kind 10050) and preferences: Settings › Trust & search.
Rationale: [docs/adr/0004-nip17-private-messages.md](docs/adr/0004-nip17-private-messages.md).

## Installed app (PWA)

The app installs to a home screen, dock or Start menu from `client/public/site.webmanifest`
(icons, maskable icons, shortcuts, screenshots, a share target and a `web+nostr:` handler,
both landing on `/open` → `lib/openTarget`). iOS reads its own tags from `index.html`:
`apple-mobile-web-app-*`, the full-bleed `apple-touch-icon.png`, and a launch image per
screen size. `scripts/pwa-assets.mjs` draws all the raster art from `favicon.svg`;
`lib/pwaAssets.test.ts` holds the manifest, the files and `index.html` to each other.

- **Service worker** (`client/src/sw/sw.ts`, served as `/sw.js`): page loads
  network-first with the cached shell as the offline/slow fallback, hashed assets
  cache-first, everything else untouched. Updates wait for the page:
  `lib/serviceWorker` swaps a same-build worker in quietly and shows
  `AppUpdatePrompt` to an older page. Rationale: [docs/adr/0006](docs/adr/0006-service-worker-network-first-shell.md).
- **Notifications** go through the worker (`showAppNotification`); a tapped one
  focuses the open app and navigates (`onOpenUrl`). The unread count is also on the
  app icon (`lib/appBadge`).
- **Coming back** (`lib/appResume` → `services/appResume`): relays skip their
  reconnect backoff (`wakeRelays`; the DM live subscription's retry is woken too),
  a newer build is looked for, and after 10 minutes away the API queries are
  refetched (the app has no pull-to-refresh). The DM outbox retries on return.
- **In the installed app only**: Back in the header on screens reached in-app
  (`HeaderBar`; there is no browser toolbar), persistent storage asked for at
  sign-in (`lib/persistentStorage`), the main screens precached, and on iOS a note
  on `/login` that the app's sign-in is separate from Safari's.
- **Install offer**: "Install the app" in the account menu, opening Chrome's
  prompt (`lib/installPrompt`) or the Share-sheet steps on iOS (`InstallApp`).
- **Status bar**: `theme-color` follows the page's background (`lib/themeColor`).
- **Fonts** are bundled (`@fontsource`), not fetched from Google, so an offline
  launch has them.

Real-device checks before shipping a change here: `docs/agents/pwa-checklist.md`.

## Passkeys

A passkey unlocks a key the app holds (a `LocalAccount`); it is not a Signer and
never the Backup ([ADR 0009](docs/adr/0009-passkey-unlocks-a-held-key.md)). The key
is sealed under the passkey's PRF output (`accounts/passkey.ts`) and kept on the
Account as `LocalSignerData.passkeys`. The same seal goes to the backend
(`/passkeyVault`, Session-gated writes) so a synced passkey can sign in on a new
device: `loginWithPasskey` asks for a server challenge, the system sheet offers
every passkey for this host, and the one picked is handed its seal only for an
assertion over that challenge. The backend cannot open a seal.

Surfaces: the login page's "Sign in with Face ID" (`PasskeySignInButton`, which
prefetches the challenge so Safari's gesture survives), "Create with Face ID" in
`CreateAccountModal`, the passkey pane of `UnlockModal`, the one-time offer after a
password unlock (`PasskeyOffer`), and Settings › Account › Passkeys
(`PasskeySettings`). Everything hides where `passkeySupport()` says the browser
can't do PRF. `rp.id` is `location.hostname`: staging and production passkeys are
separate, and a local UI needs its origin in the backend's `PASSKEY_ORIGINS`.

## External Dependencies

- **Nostr Protocol:** Interacts with various Nostr relays (e.g., damus, nostr.band, nos.lol) for metadata fetching and event publishing.
- **Brainstorm Backend API:** Each deployment talks to one API, named by `VITE_API_URL`: staging's UI to `brainstormserver-staging.nosfabrica.com`, production's to `api.brainstorm.world`. `docker-entrypoint.sh` writes it into `config.js` (`window.__ENV__`) when the container starts. `client/src/lib/runtimeEnv.ts` reads it from there, or from the build while `config.js` still holds the placeholder: that's how `npm run dev` gets it (`docs/agents/run-ui.md`) and how the Android build carries production's. The API calls get it from `getBrainstormApi()` in `client/src/services/api/core.ts`. There is no in-app switch: the staging/production toggle was dropped on 2026-04-21 (`c66e8e2a`), and `core.ts` only clears its old `brainstorm_api_env` key.
- **Nostr HTTP APIs:** `api.nostr.band` and `purplepag.es` serve as HTTP fallback for profile fetching.
- **NIP-07 Browser Extension:** Required for Nostr key management and event signing.

## Shared Components

- **MobileMenu (`client/src/components/MobileMenu.tsx`):** Unified mobile navigation drawer used by all authenticated pages (Dashboard, Settings, Network, Search, Profile, FAQ, Admin, My Panel). Organized into grouped sections: Navigation (Dashboard/Search/Network/My Panel), Help & Info (FAQ/What is WoT?), Account (Settings + Admin for whitelisted pubkeys). Navigation and Account sections are auth-gated (hidden when user is null). Network button disabled when `calcDone` is false. Admin nav only visible when `isAdmin` prop is true. User avatar + Sign Out in footer.
