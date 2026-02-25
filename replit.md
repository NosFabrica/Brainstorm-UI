# Brainstorm Shell

## Overview
Minimal Brainstorm shell built with React + TypeScript + Vite. Implements real Nostr login via NIP-07 browser extension with challenge-response authentication against the Brainstorm backend API, plus profile metadata fetching using applesauce-core helpers.

## Recent Changes
- 2026-02-11: Initial shell created with login/dashboard routing and service stubs
- 2026-02-11: Implemented real Nostr login using applesauce-core (NIP-07 + profile fetching)
- 2026-02-11: Added more relays + nostr.band/purplepag.es HTTP API fallbacks for profile fetching
- 2026-02-11: Integrated Brainstorm backend auth (challenge/verify flow with kind 22242 events)
- 2026-02-12: Added GrapeRank result display on dashboard, cleaned up debug logging
- 2026-02-12: Added Network card showing social graph counts (followers, following, muted, reports, influence)
- 2026-02-12: Added Calculate GrapeRank button (POST /user/graperank) to trigger calculations
- 2026-02-12: Replaced LoginPage with polished dark-theme glass-card design (brain SVG logo, gradient text, CSS animations, no framer-motion)
- 2026-02-12: Replaced DashboardPage with polished prototype-inspired design (dark nav bar, avatar dropdown, gradient stat cards, social graph grid, GrapeRank panel with status fields)
- 2026-02-13: Added SearchPage with npub lookup, real API integration (getUserByPubkey), input validation, loading/error/result states, mobile nav drawer, CSS-only animations
- 2026-02-17: Enhanced SearchPage to accept hex pubkeys (64-char hex) and NIP-05 handles (name@domain.com or domain.com) in addition to npub. Added /api/nip05 proxy route for CORS-safe NIP-05 resolution
- 2026-02-13: Added What is WoT? educational page with dark theme, mode toggle (Why/How), trust node visualization, interactive parameter tuning, Show vs Tell scenarios, use cases, FAQ accordion, and CTA section
- 2026-02-13: Added Landing page at / with hero section, Footer component, CSS-only animations (no framer-motion), moved LoginPage to /login
- 2026-02-13: Created ComputingBackground component (dark/light variants, CSS-only) with animated graph nodes, connection lines, floating calculation text
- 2026-02-13: Added OnboardingPage at /onboarding with 3-step guide, ComputingBackground dark variant, sign-in and learn CTA buttons
- 2026-02-13: Upgraded WhatIsWotPage with framer-motion animations, real avatar images (generated + stock), interactive Show vs Tell scenarios with 5 trust contexts, FAQ accordion, CTA section
- 2026-02-13: Merged comprehensive Good UI dashboard: onboarding panel (flashlight effect, 8-slide carousel, progress tracker, queue position), GrapeRank hero card, key metrics grid (trusted followers, network alerts, extended reach with hops slider), recharts PieChart network health, educational strip, supported clients carousel (Amethyst + Nostria), keyboard shortcuts modal (E/H/?), JSON export
- 2026-02-13: Enhanced SearchPage: npub→hex decoding via nip19, parallel profile+graph fetch, trust profile card with avatar/name/NIP-05/about, all 7 social metrics (followers, following, influence, muted_by, reported_by, muting, reporting) with color-coded tiles, trust warning banner
- 2026-02-13: Added NetworkPage at /network: CRM-style social graph explorer with profile cards by group (Followers, Following, Muted By, Muting, Reported By, Reporting), filter chips with counts, search, batch profile fetching (concurrency 5), skeleton loading, click-to-search navigation
- 2026-02-13: Integrated Network nav links across Dashboard (desktop + mobile + View All button), SearchPage (desktop + mobile), standardized mobile drawer layout (Settings at bottom via mt-auto)
- 2026-02-13: Added trust score badges to NetworkPage profile cards (grid + list): batch-fetches influence via getUserByPubkey for visible page items, renders compact SVG ring with percentage, loading spinner while fetching
- 2026-02-17: Added expandable social graph metrics on SearchPage: all 6 metric rows (Followers, Following, Muted By, Reported By, Muting, Reporting) are clickable accordions with lazy profile+trust fetching (concurrency 5), compact profile cards (avatar, name, NIP-05, trust ring), group overlap badges, color-coded left border accents, "show first 10 / load more" pagination, click-to-drill-down navigation with abort guards for stale fetches
- 2026-02-17: Added 3 new search insights: (1) Mutual Follows metric tile (intersection of followed_by/following, teal accent, expandable), (2) Shared Connections banner comparing searched user's network with logged-in user's network (mutual followers/following breakdown), (3) Trust Ratio badge (followers/(followers+muted_by), color-coded emerald/amber/red)
- 2026-02-17: Replaced mock pie chart data with real count_values from GrapeRank API: parses trust tiers (high/medium_high/medium/medium_low/low) × hop distance, aggregates by hop slider range, updates pie chart + bars + extended reach count with real data, dynamic slider max from data, graceful fallback to synthetic data when GrapeRank unavailable
- 2026-02-17: Made Shared Connections banner on SearchPage expandable: click to drill down into Mutual Followers and Mutual Following sub-sections with profile cards, trust rings, overlap badges, and load-more pagination (reuses existing renderExpandedPanel pattern)
- 2026-02-17: Added verified user flags on NetworkPage profile cards: checks if a user's muted_by/reported_by includes verified users (TA >= 0.01) and shows amber/red badges with tooltip explanations
- 2026-02-17: Replaced mock Network Alerts card on Dashboard with real reported_by/muted_by counts from API data, removed "Coming soon" overlay, updated dialog to show real signal summary
- 2026-02-18: Adapted to new API format: graph arrays (followed_by, following, muted_by, etc.) now return `{pubkey, influence}` objects instead of plain strings. Added graphHelpers.ts (toPubkeys, toInfluenceMap), updated all 3 pages. NetworkPage pre-seeds trustCache from embedded influence, uses Set-based group lookups for performance
- 2026-02-25: Optimized login flow for large accounts: removed getSelf() and profile fetch from handleLogin() (deferred to Dashboard via useQuery), added 60s timeouts to /api/auth/self and /api/user/:pubkey server proxy routes, replaced generic loading placeholders with branded BrainLogo pulse animations throughout Dashboard
- 2026-02-25: Added 6 custom neural-node SVG metric icons to WotIcons.tsx (NodeFollowersIcon, NodeFollowingIcon, NodeMutedByIcon, NodeReportedByIcon, NodeMutingIcon, NodeReportingIcon) — node-and-connection style matching BrainLogo aesthetic
- 2026-02-25: Redesigned NetworkPage detail panel: glassmorphism container (gradient bg, backdrop-blur, rounded-2xl, top accent bar), glass metric tiles (rounded-xl, white/70 backdrop-blur), gradient influence bar, branded gradient "View full profile" button, BrainLogo loading spinner
- 2026-02-25: Added NIP-85 Service Provider activation: CTA card on Dashboard (post-onboarding), ActivateBrainstormModal with 3 educational accordion sections, double-confirmation flow (CTA button → modal confirm → NIP-07 sign), kind 10040 event publishing to relays, "Service Provider Active" badge, publishToRelays utility, POST /api/publish server fallback route
- 2026-02-25: Rebuilt Settings page with 3 real sections: (1) Service Provider status card (NIP-85 activation state from localStorage + ta_pubkey/timestamps from /api/auth/self), (2) Trust Calculation card (GrapeRank status/timestamps from /api/auth/graperankResult + recalculate button with confirmation dialog), (3) Trust Perspective "Coming Soon" teaser (Lock badge overlay, disabled preset chips). Removed old mock preset picker, added useQuery/useMutation for live API data
- 2026-02-25: Fixed logout to clear React Query cache (queryClient.clear()), preventing stale data leakage between accounts. Aligned Settings page query shapes with Dashboard (both now cache full API response, accessors use `.data.` path)
- 2026-02-25: Condensed onboarding progress from 3 steps to 2: removed "Setup" step, merged into "Calculating" (done when internal_publication_status=success) + "Publishing" (done when ta_status=success). Updated grid to 2-column layout, simplified progress text and queue badge

## Project Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Routing**: wouter (`/` = Landing, `/login` = Login, `/onboarding` = Onboarding, `/dashboard` = Dashboard, `/search` = Search, `/network` = Network, `/settings` = Settings, `/what-is-wot` = What is WoT?)
- **Backend**: Express (profile proxy via WebSocket relays + HTTP APIs)
- **Nostr**: applesauce-core (EventStore, profile helpers) + nostr-tools (nip19 encoding)
- **Auth**: Challenge-response via brainstormserver API, token in localStorage

### Structure
```
client/src/
├── components/
│   ├── BrainLogo.tsx          # Brain SVG logo component with size/color props
│   ├── ComputingBackground.tsx # Animated graph background (dark/light variants, CSS-only)
│   ├── Footer.tsx             # Dark footer with partner logos, WoT link, version (CSS-only)
│   ├── WotIcons.tsx           # Custom SVG icon components for Web of Trust UI
│   └── ActivateBrainstormModal.tsx # NIP-85 activation modal: educational accordion, kind 10040 signing+publishing
├── pages/
│   ├── landing.tsx           # Marketing hero page with brain logo, stats, sign-in CTA, ComputingBackground, Footer
│   ├── OnboardingPage.tsx    # 3-step getting started guide with ComputingBackground dark variant
│   ├── LoginPage.tsx         # NIP-07 Nostr login with Brainstorm backend auth
│   ├── DashboardPage.tsx     # Full dashboard: onboarding panel, GrapeRank hero, metrics grid, PieChart, educational strip, clients carousel, keyboard shortcuts
│   ├── SearchPage.tsx        # Npub lookup with npub→hex decode, parallel profile+graph fetch, trust profile card, all 7 metrics, warning banner
│   ├── NetworkPage.tsx       # CRM-style social graph explorer: profile cards by group, filter chips, search, batch profile fetch, skeleton loading
│   ├── SettingsPage.tsx      # Settings: Service Provider status (NIP-85), Trust Calculation (GrapeRank), Trust Perspective (coming soon teaser)
│   └── WhatIsWotPage.tsx     # Educational page: What is Web of Trust? (framer-motion, interactive trust scenarios, Show vs Tell, FAQ, CTA)
├── services/
│   ├── nostr.ts              # handleLogin (challenge-response auth), profile fetch, session mgmt, publishToRelays, signAndPublishNip85
│   └── api.ts                # Brainstorm API client (getAuthChallenge, verifyAuthChallenge, getSelf, getGrapeRankResult)
└── App.tsx                   # Routing setup
```

### Auth Flow (`nostr.ts` + `api.ts`)
1. Get pubkey from NIP-07 browser extension
2. Request challenge from `GET /authChallenge/:pubkey`
3. Sign kind 22242 event with tags `["t", "brainstorm_login"]` and `["challenge", <challenge>]`
4. Verify signed event via `POST /authChallenge/:pubkey/verify`
5. Store token in localStorage as `brainstorm_session_token`
6. Navigate to Dashboard immediately (minimal user: pubkey + npub only)
7. Dashboard lazily fetches `/user/self` (social graph) and `/api/profile/:pubkey` (avatar/name) via useQuery
8. Profile data updates localStorage and UI state when it arrives

### API Client (`api.ts`)
- `getAuthChallenge(pubkey)` - Gets challenge string from brainstormserver
- `verifyAuthChallenge(pubkey, signedEvent)` - Verifies signed event, returns token
- `getSelf()` - Fetches authenticated user data with stored token
- `getUserByPubkey(pubkey)` - Fetches user social graph data (followers, following, mutes, reports, influence)
- `getGrapeRankResult()` - Fetches latest GrapeRank reputation score
- All endpoints proxied through Express server to avoid CORS issues
- External API: https://brainstormserver.nosfabrica.com

### Profile Fetching (server-side `routes.ts`)
- `GET /api/profile/:pubkey` - Fetches kind:0 metadata from 8 WebSocket relays + 2 HTTP APIs
- Uses Promise.any for fast response (returns first successful result)
- Relays: damus, nostr.band, nos.lol, primal, purplepag.es, nostr.info, nostr.wine, snort.social
- HTTP fallbacks: api.nostr.band, purplepag.es

### NIP-85 Service Provider Activation (`nostr.ts` + `ActivateBrainstormModal.tsx`)
1. CTA card appears on Dashboard after GrapeRank completes (ta_status="success")
2. User clicks "Select Brainstorm" → modal opens (1st confirmation)
3. User reads educational content, clicks "Select Brainstorm as my Service Provider" (2nd confirmation)
4. NIP-07 extension prompts for signature (3rd layer from browser extension)
5. Kind 10040 event published to relays with tag `["30382:rank", ta_pubkey, relay_hint]`
6. Activation persisted in localStorage as `brainstorm_nip85_activated`
7. "Service Provider Active" badge shown on Dashboard post-activation
- `publishToRelays(signedEvent, relays?)` — publishes signed event to 5 default relays via WebSocket, Promise.any pattern, falls back to `POST /api/publish` server route
- `signAndPublishNip85(serviceKey, relayHint?)` — builds kind 10040 event, signs via NIP-07, publishes via publishToRelays

### Key Details
- Event kind for auth: 22242
- Event kind for NIP-85 service provider declaration: 10040
- Auth header: `access_token` (not Authorization Bearer)
- Session token key: `brainstorm_session_token`
- User profile stored in localStorage as `nostr_user`
