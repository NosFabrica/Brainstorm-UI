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
- 2026-02-13: Added What is WoT? educational page with dark theme, mode toggle (Why/How), trust node visualization, interactive parameter tuning, Show vs Tell scenarios, use cases, FAQ accordion, and CTA section
- 2026-02-13: Added Landing page at / with hero section, Footer component, CSS-only animations (no framer-motion), moved LoginPage to /login
- 2026-02-13: Created ComputingBackground component (dark/light variants, CSS-only) with animated graph nodes, connection lines, floating calculation text
- 2026-02-13: Added OnboardingPage at /onboarding with 3-step guide, ComputingBackground dark variant, sign-in and learn CTA buttons

## Project Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Routing**: wouter (`/` = Landing, `/login` = Login, `/onboarding` = Onboarding, `/dashboard` = Dashboard, `/search` = Search, `/settings` = Settings, `/what-is-wot` = What is WoT?)
- **Backend**: Express (profile proxy via WebSocket relays + HTTP APIs)
- **Nostr**: applesauce-core (EventStore, profile helpers) + nostr-tools (nip19 encoding)
- **Auth**: Challenge-response via brainstormserver API, token in localStorage

### Structure
```
client/src/
├── components/
│   ├── ComputingBackground.tsx # Animated graph background (dark/light variants, CSS-only)
│   └── Footer.tsx            # Dark footer with partner logos, WoT link, version (CSS-only)
├── pages/
│   ├── landing.tsx           # Marketing hero page with brain logo, stats, sign-in CTA, ComputingBackground, Footer
│   ├── OnboardingPage.tsx    # 3-step getting started guide with ComputingBackground dark variant
│   ├── LoginPage.tsx         # NIP-07 Nostr login with Brainstorm backend auth
│   ├── DashboardPage.tsx     # User profile card + user data + GrapeRank result
│   ├── SearchPage.tsx        # Npub lookup with real API, validation, results display
│   ├── SettingsPage.tsx      # Trust perspective presets (Relax/Default/Strict) with save/reset
│   └── WhatIsWotPage.tsx     # Educational page: What is Web of Trust? (Why/How mode toggle, trust visualization, FAQ)
├── services/
│   ├── nostr.ts              # handleLogin (challenge-response auth), profile fetch, session mgmt
│   └── api.ts                # Brainstorm API client (getAuthChallenge, verifyAuthChallenge, getSelf, getGrapeRankResult)
└── App.tsx                   # Routing setup
```

### Auth Flow (`nostr.ts` + `api.ts`)
1. Get pubkey from NIP-07 browser extension
2. Request challenge from `GET /authChallenge/:pubkey`
3. Sign kind 22242 event with tags `["t", "brainstorm_login"]` and `["challenge", <challenge>]`
4. Verify signed event via `POST /authChallenge/:pubkey/verify`
5. Store token in localStorage as `brainstorm_session_token`
6. Fetch user data via `GET /user/self` with `access_token` header
7. Fetch Nostr profile metadata from relays for display name/avatar

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

### Key Details
- Event kind for auth: 22242
- Auth header: `access_token` (not Authorization Bearer)
- Session token key: `brainstorm_session_token`
- User profile stored in localStorage as `nostr_user`
