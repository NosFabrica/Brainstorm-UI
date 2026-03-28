# Brainstorm Shell

## Overview
Brainstorm Shell is a web application built with React, TypeScript, and Vite, providing a user interface for the Brainstorm platform. It integrates Nostr login via NIP-07, offering social graph visualization, GrapeRank reputation scoring, and Web of Trust (WoT) concepts. The application aims to give users insights into their social network and influence within the Nostr ecosystem, including profile metadata fetching, social graph exploration, and NIP-85 service provider activation.

## User Preferences
I prefer detailed explanations and clear communication. When making changes, please ask before implementing major architectural decisions. I value an iterative development approach and clear, concise code. I also prefer the use of dark themes and modern UI/UX principles.

## System Architecture
The application uses a React 18 frontend with TypeScript, Vite, Tailwind CSS, and shadcn/ui. Routing is managed by `wouter`. An Express.js backend proxies API requests to mitigate CORS issues, especially for Nostr profile fetching and NIP-05 resolution.

**Key Architectural Decisions:**
- **UI/UX:** Features a dark-theme with glassmorphism, gradient texts, and CSS-only animations. Designs emphasize polished user experiences for login, dashboard, and other core pages, including animated graph backgrounds and custom SVG icons.
- **Nostr Integration:** Utilizes `applesauce-core` for NIP-07 login and profile handling, and `nostr-tools` for `nip19` encoding. Authentication uses a challenge-response mechanism with the Brainstorm backend via kind 22242 events.
- **Data Management:** React Query is used for data fetching, caching, and state management for user profiles, GrapeRank results, and social graph data.
- **Feature Specifications:**
    - **Authentication:** NIP-07 based challenge-response login with session tokens stored in `localStorage`. Silent re-authentication on 401 (expired token) via `silentReauth()` in `client/src/services/api.ts` — automatically re-authenticates using NIP-07 extension without user intervention on hard refresh. Falls back to login redirect if extension unavailable. All protected pages guard against error flash during auth redirects via `isAuthRedirecting()`.
    - **Dashboard:** Displays GrapeRank results, social graph counts, and an onboarding panel. Network Health pie chart includes a "Flagged" tier (red `#ef4444`) for users in the `low_and_reported_by_2_or_more_trusted_pubkeys` API field. Supported Clients carousel has 3 slides: Amethyst, Nostria, and a Developer CTA ("Get Your Client Featured") linking to `/faq?tab=developers`.
    - **Search Page:** Provides a lookup tool for `npub`, hex pubkeys, and NIP-05 handles, redirecting to the Profile page upon successful lookup.
    - **Profile Page (`/profile/:npub`):** Shows trust score, social reach, risk assessment, shared connections, and raw API data. Allows drill-down into expanded lists and navigation to other profiles. Risk Assessment section shows a "Flagged" indicator (red styling) when the viewed profile exists in the observer's own flagged list (`low_and_reported_by_2_or_more_trusted_pubkeys` from `/user/self`), since flagged status is relative to the observer's trust graph. Expanded panels for report/mute sections fetch metadata directly from Nostr relays on expand: kind 1984 events for reports (showing report type badge, relative timestamp, reason) and kind 10000 events for mute lists (showing mute list update timestamps). Report type badges use color-coded styles (spam=amber, impersonation=red, nudity=pink, illegal=red, profanity=orange, other=slate).
    - **Network Page:** A CRM-style social graph explorer for managing connections by group with filtering and search. Includes a "Flagged" group (red `#ef4444`) sourced from the API field `low_and_reported_by_2_or_more_trusted_pubkeys`. Detail panel shows a "Flagged" badge when the user is in the observer's flagged list (not from per-profile API data).
    - **FAQ Page (`/faq`):** Product-specific FAQ with two-tab layout ("Using Brainstorm" for end users, "For Developers" for NIP-85 client integration). Supports `?tab=developers` query param deep-linking. Uses accordion Q&A pattern matching WhatIsWotPage style. Accessible to both authenticated and unauthenticated users. Linked from user dropdown menu (above Settings) and mobile navigation (above "What is WoT?") on all pages.
    - **What is WoT? Page:** An educational resource with interactive trust scenarios.
    - **NIP-85 Service Provider Activation/Deactivation:** A guided process for activating Brainstorm as a NIP-85 service provider (Kind 10040 event). Users can also deactivate from the Settings page, which publishes a replacement Kind 10040 event with empty tags to relays, clearing the provider declaration. Deactivation clears `brainstorm_nip85_activated` from localStorage and reloads the page. Functions: `signNip85()` and `signNip85Deactivation()` in `client/src/services/nostr.ts`.
    - **Settings Page:** Manages NIP-85 status (activate/deactivate/republish), GrapeRank calculation triggers, and trust perspective settings. NIP-85 and GrapeRank buttons are disabled when `hasNoFollowing` is true (user has no follows). Trust Perspective presets (Relax/Default/Strict) are functional — each sets a verified threshold (0.00/0.02/0.15) stored in `localStorage` key `brainstorm_trust_preset`, which controls "verified" vs "unverified" display across Dashboard, Network, and Profile pages. Utility module: `client/src/services/trustThreshold.ts`. Includes a "Contact & Support" section at the bottom with two cards: "List Your Client" (developer outreach for NIP-85 client listings) and "Get in Touch" (general support), both linking to `support@nosfabrica.com`.
    - **Dashboard Empty State:** When users have no follows (`hasNoFollowing`), the dashboard hides the Network Health section and recalculation panel, showing only the welcome header with "Set up your trust network" subtitle and the "No follows yet" banner. Trust Signals badge shows step-specific status during calculations: "Calculating…" → "Publishing…" → "Complete".
- **Performance Optimizations:** Includes 60-second timeouts for server proxy routes, defers profile fetching to the dashboard, and uses branded loading animations. Network page search uses on-demand debounced profile fetching (500ms delay, batches of 50, max 500 uncached profiles) instead of eager bulk loading — keeps initial page load fast while enabling name-based search across the full group.

## External Dependencies
- **Nostr Protocol:** Interacts with various Nostr relays (e.g., damus, nostr.band, nos.lol) for metadata fetching and event publishing.
- **Brainstorm Backend API:** `https://brainstormserver-staging.nosfabrica.com` (staging) for authentication, user data, GrapeRank results, and NIP-05 proxying. Configurable via `VITE_API_URL` env var.
- **Nostr HTTP APIs:** `api.nostr.band` and `purplepag.es` serve as HTTP fallback for profile fetching.
- **NIP-07 Browser Extension:** Required for Nostr key management and event signing.

## Shared Components
- **MobileMenu (`client/src/components/MobileMenu.tsx`):** Unified mobile navigation drawer used by all 7 authenticated pages (Dashboard, Settings, Network, Search, Profile, FAQ, Lists). Organized into grouped sections: Navigation (Dashboard/Search/Network/Lists), Help & Info (FAQ/What is WoT?), Account (Settings). Navigation and Account sections are auth-gated (hidden when user is null). Network button disabled when `calcDone` is false. User avatar + Sign Out in footer.

## DCoSL Integration (Decentralized Curation of Simple Lists)
- **Relay:** `wss://dcosl.brainstorm.world` — DCoSL relay for curated lists
- **Service functions:** Added to `client/src/services/nostr.ts` — `fetchDListHeaders()` (kinds 9998/39998), `fetchDListItems(parentATag)` (kinds 9999/39999 via `#z` filter), `clearDcoslCache()`, types `DListHeader`/`DListItem`
- **ListsPage (`client/src/pages/ListsPage.tsx`):** Card grid of community-curated lists fetched from DCoSL relay, showing name, description, author profile, item count, age, and property tags. Route: `/lists`
- **ListDetailPage (`client/src/pages/ListDetailPage.tsx`):** Full detail view for a single list with trust-weighted reactions. Route: `/lists/:listId` (URL-encoded a-tag). Features:
  - Tapestry-aligned table layout with 5 columns: Item (with profile avatar for pubkey items), Author (who submitted), 👍 (upvote count), 👎 (downvote count), Trust Score (±X.XXX color-coded)
  - Reaction summary bar above table: shows total upvotes (green), total downvotes (red), and total count with voter count
  - Kind 7 reactions fetched from DCoSL relay (`fetchDListReactions`), parsed as +/- votes per NIP-25
  - 4 trust weighting methods selectable via dropdown: Trust Everyone (weight=1), Follow List (kind 3 follows = weight 1, else 0), Trusted List (kind 30392 = weight 1, else 0), GrapeRank (kind 30382 scores via 10040 Treasure Map)
  - PoV (Point of View) switching: indicator bar shows current PoV user, "Switch" button to enter npub/hex pubkey, "Reset to me" to revert; PoV pubkey persisted to `localStorage` key `brainstorm_trust_pov`
  - **Dwarves demo PoV override:** When viewing the dwarves list, PoV auto-sets to the Nous/Tapestry demo pubkey (`NOUS_DEMO_PUBKEY` = `15f7dafc...` in nostr.ts) so GrapeRank scores flow from the NIP-85 relay. Shows "Nous (demo)" with an amber "demo" badge. Users can manually switch PoV and "Reset to demo" to restore. Override is local to the page — no localStorage side effects.
  - Trust method persisted to `localStorage` key `brainstorm_trust_method`
  - Expanded row detail: Trust Score breakdown (weighted up/down), individual voter list with avatars, weights, timestamps
  - Profile resolution: `ItemProfileAvatar` resolves profile pictures for items with pubkey content; `AuthorBadge` resolves and shows item submitter profiles
  - Expandable rows showing individual upvoters/downvoters with profile avatars, trust weights, and reaction timestamps
  - Search/filter toolbar for items
  - Profile display for pubkey items: when list item content is a valid hex pubkey, resolves and shows Nostr profile (avatar, name, NIP-05)
  - Voter deduplication: latest `createdAt` wins per voter per item
  - Reaction target validation: only counts reactions targeting known item a-tags/event IDs
- **Navigation:** "Lists" button added to desktop nav bar on all authenticated pages (Dashboard, Search, Network, Profile, Settings, FAQ, Lists, ListDetail) and mobile drawer
- **Cache:** Session-level caching via `dcoslListCache`, `dcoslItemCache`, and `dcoslReactionCache` Maps in nostr.ts; `clearDcoslCache()` exported for manual refresh
- **Trust weight services:** `fetchFollowList(pubkey)` returns kind 3 follow set; `fetchTrustedList(pubkey)` returns kind 30392 trusted pubkey set; `fetchGrapeRankScores(povPubkey, targetPubkeys)` fetches kind 30382 trust assertions via 10040 Treasure Map lookup
- **TrustContext (`client/src/contexts/TrustContext.tsx`):** React context provider for trust method and PoV pubkey state (available for future PoV switching features)
- **a-tag pattern:** Replaceable events (39998/39999) use `${kind}:${pubkey}:${dTag}`; non-replaceable (9998/9999) use `event.id`
- **Configurable relay:** DCoSL relay URL stored in `localStorage` key `brainstorm_dcosl_relay`, defaults to `wss://dcosl.brainstorm.world`. Functions: `getDcoslRelay()`, `setDcoslRelay(url)`, `getDcoslRelayDefault()`. All DCoSL fetchers use dynamic relay URL.
- **Settings DCoSL card:** New "DCoSL Relay" settings card with text input, save/reset buttons, URL validation (must start with `wss://` or `ws://`). Resets cache on relay change.
- **Dashboard DCoSL card:** Summary card showing all available DCoSL lists with item counts and quick-link navigation to each list detail page.
- **Profile List Activity:** Expandable "List Activity" section in Profile page showing which DCoSL lists a pubkey appears on and which items they've voted on. Lazy-fetched on expand. Service: `fetchDListReactionsByPubkey(pubkey)`.
- **Chain indicator:** Visual trust chain indicator on ListDetailPage when "Trusted List" method is selected, showing trust flow arrow: "[Trusted List Name] → [Current List Name]"