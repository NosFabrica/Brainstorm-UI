# Brainstorm Shell

## Overview
Brainstorm Shell is a minimal web application built with React, TypeScript, and Vite, designed to provide a user interface for the Brainstorm platform. It integrates real Nostr login capabilities via NIP-07 browser extensions, enabling secure challenge-response authentication with the Brainstorm backend API. The application focuses on social graph visualization, GrapeRank reputation scoring, and Web of Trust (WoT) concepts, aiming to offer users insights into their social network and influence within the Nostr ecosystem. Key capabilities include profile metadata fetching, social graph exploration, and NIP-85 service provider activation.

## User Preferences
I prefer detailed explanations and clear communication. When making changes, please ask before implementing major architectural decisions. I value an iterative development approach and clear, concise code. I also prefer the use of dark themes and modern UI/UX principles.

## System Architecture
The application is structured around a React 18 frontend with TypeScript, Vite, Tailwind CSS, and shadcn/ui for UI components. Routing is handled by `wouter`, defining distinct paths for landing, login, onboarding, dashboard, search, network, settings, and an educational "What is WoT?" page. The backend utilizes Express.js for API proxying, particularly for Nostr profile fetching and NIP-05 resolution, mitigating CORS issues.

**Key Architectural Decisions:**
- **UI/UX:** Employs a dark-theme aesthetic with glassmorphism elements, gradient texts, and CSS-only animations (avoiding `framer-motion` where possible for performance and simplicity). Features polished designs for login, dashboard, and other core pages, incorporating elements like animated graph backgrounds, custom SVG icons, and interactive data visualizations.
- **Nostr Integration:** Leverages `applesauce-core` for Nostr functionalities like NIP-07 for login and profile helpers, and `nostr-tools` for `nip19` encoding. Authentication follows a challenge-response mechanism with the Brainstorm backend using kind 22242 events.
- **Data Management:** Uses React Query for efficient data fetching, caching, and state management, particularly for user profiles, GrapeRank results, and social graph data.
- **Feature Specifications:**
    - **Authentication:** NIP-07 based challenge-response login, storing session tokens in `localStorage`.
    - **Dashboard:** Displays GrapeRank results, social graph counts (followers, following, etc.), and provides an onboarding panel.
    - **Search Page:** Allows searching by `npub`, hex pubkeys, and NIP-05 handles, displaying detailed trust profiles and social metrics. Includes expandable sections for mutual connections and trust ratios.
    - **Network Page:** A CRM-style social graph explorer, enabling users to view and manage their connections by group with filtering and search capabilities.
    - **What is WoT? Page:** An educational resource with interactive trust scenarios and visualizations.
    - **NIP-85 Service Provider Activation:** A guided process for activating Brainstorm as a NIP-85 service provider, involving kind 10040 event publishing.
    - **Settings Page:** Manages NIP-85 status, GrapeRank calculation triggers, and future trust perspective settings.
- **Performance Optimizations:** Implements 60-second timeouts for server proxy routes and defers profile fetching to the dashboard for quicker login experiences. Uses branded BrainLogo pulse animations for loading states.

## External Dependencies
- **Nostr Protocol:** Utilizes various Nostr relays (e.g., damus, nostr.band, nos.lol, primal, purplepag.es, nostr.info, nostr.wine, snort.social) for fetching kind:0 metadata and publishing events.
- **Brainstorm Backend API:** `https://brainstormserver.nosfabrica.com` for authentication challenges, verification, user data (`/user/self`, `/user/:pubkey`), GrapeRank results (`/graperankResult`), and NIP-05 proxying.
- **Nostr HTTP APIs:** `api.nostr.band` and `purplepag.es` serve as HTTP fallback options for profile fetching.
- **NIP-07 Browser Extension:** Required for Nostr key management and event signing.

## Recent Changes
- Network page gated behind GrapeRank calculation: nav links grayed out on all pages until `calcDone`, NetworkPage shows branded gate screen if accessed directly before completion. Trusted Followers card on Dashboard also disabled until calcDone.
- Settings "Recalculate GrapeRank" button: triggers API, invalidates cache, shows toast, redirects to Dashboard where onboarding panel reappears with polling. Button disabled with spinner when calculation already in progress.
- Onboarding condensed to 2 steps: Calculating (internal_publication_status=success) + Publishing (ta_status=success). Logout clears all React Query cache.
- Contextual onboarding language: `isRecalculation` flag detects returning users (have `last_time_calculated_graperank` or `nip85Activated`). First-time users see "Welcome" onboarding; recalculating users see "Refreshing your trust scores" with reassuring copy. Trust score badge shows "Recalculating…" vs "Awaiting calculation" accordingly.