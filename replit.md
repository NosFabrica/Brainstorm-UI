# Brainstorm Shell

## Overview
Minimal Brainstorm shell built with React + TypeScript + Vite. Designed as a clean foundation for the backend team to integrate applesauce (Nostr library) and connect to the brainstormserver API.

## Recent Changes
- 2026-02-11: Initial shell created with login/dashboard routing and service stubs

## Project Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Routing**: wouter (`/` = Login, `/dashboard` = Dashboard)
- **Backend**: Express (minimal, no custom routes yet)

### Structure
```
client/src/
├── pages/
│   ├── LoginPage.tsx         # "Sign in with Nostr" button -> /dashboard
│   └── DashboardPage.tsx     # Placeholder with integration status
├── services/
│   ├── nostr.ts              # Stub for applesauce/Nostr integration
│   └── api.ts                # Stub for brainstormserver API client
└── App.tsx                   # Routing setup
```

### Integration Points
- `client/src/services/nostr.ts` - Backend adds applesauce for NIP-07 connection and event signing
- `client/src/services/api.ts` - Backend adds API client for https://brainstormserver.nosfabrica.com
- No actual auth logic, API calls, or state management included yet
