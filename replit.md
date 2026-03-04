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
    - **Authentication:** NIP-07 based challenge-response login with session tokens stored in `localStorage`.
    - **Dashboard:** Displays GrapeRank results, social graph counts, and an onboarding panel.
    - **Search Page:** Provides a lookup tool for `npub`, hex pubkeys, and NIP-05 handles, redirecting to the Profile page upon successful lookup.
    - **Profile Page (`/profile/:npub`):** Shows trust score, social reach, risk assessment, shared connections, and raw API data. Allows drill-down into expanded lists and navigation to other profiles.
    - **Network Page:** A CRM-style social graph explorer for managing connections by group with filtering and search.
    - **What is WoT? Page:** An educational resource with interactive trust scenarios.
    - **NIP-85 Service Provider Activation:** A guided process for activating Brainstorm as a NIP-85 service provider.
    - **Settings Page:** Manages NIP-85 status, GrapeRank calculation triggers, and trust perspective settings.
- **Performance Optimizations:** Includes 60-second timeouts for server proxy routes, defers profile fetching to the dashboard, and uses branded loading animations. Network page search uses on-demand debounced profile fetching (500ms delay, batches of 50, max 500 uncached profiles) instead of eager bulk loading — keeps initial page load fast while enabling name-based search across the full group.

## External Dependencies
- **Nostr Protocol:** Interacts with various Nostr relays (e.g., damus, nostr.band, nos.lol) for metadata fetching and event publishing.
- **Brainstorm Backend API:** `https://brainstormserver.nosfabrica.com` for authentication, user data, GrapeRank results, and NIP-05 proxying.
- **Nostr HTTP APIs:** `api.nostr.band` and `purplepag.es` serve as HTTP fallback for profile fetching.
- **NIP-07 Browser Extension:** Required for Nostr key management and event signing.