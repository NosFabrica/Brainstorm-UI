# Brainstorm Shell

## Overview
Minimal Brainstorm shell built with React + TypeScript + Vite. Implements real Nostr login via NIP-07 browser extension, with profile metadata fetching using applesauce-core helpers.

## Recent Changes
- 2026-02-11: Initial shell created with login/dashboard routing and service stubs
- 2026-02-11: Implemented real Nostr login using applesauce-core (NIP-07 + profile fetching)

## Project Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Routing**: wouter (`/` = Login, `/dashboard` = Dashboard)
- **Backend**: Express (minimal, no custom routes yet)
- **Nostr**: applesauce-core (EventStore, profile helpers) + nostr-tools (nip19 encoding)

### Structure
```
client/src/
├── pages/
│   ├── LoginPage.tsx         # NIP-07 Nostr login with error handling
│   └── DashboardPage.tsx     # User profile card + integration status
├── services/
│   ├── nostr.ts              # NIP-07 connect, profile fetch via EventStore, session management
│   └── api.ts                # Stub for brainstormserver API client
└── App.tsx                   # Routing setup
```

### Nostr Service (`nostr.ts`)
- `connectNostr()` - Connects via window.nostr (NIP-07), fetches profile from relays, stores in applesauce EventStore
- `getCurrentUser()` - Returns cached user from memory or sessionStorage
- `logout()` - Clears user session
- Uses applesauce-core helpers: `getProfileContent`, `getDisplayName`, `getProfilePicture`, `isValidProfile`
- Profile fetched from relays: relay.damus.io, relay.nostr.band, nos.lol, relay.primal.net

### Integration Points
- `client/src/services/api.ts` - Backend adds API client for https://brainstormserver.nosfabrica.com
- EventStore exported from nostr.ts for future use with applesauce models
