---
name: Anonymous-viewable data fetching
description: How public (anon) data calls must avoid the auth redirect/wipe side effect, and what counts as "signed in".
---

# Anonymous-viewable data fetching

Public pages (`/search`, `/profile/:npub`, search-first home `/`) serve the NosFabrica
"house" perspective to logged-out visitors. Any data call reachable while anonymous
must NOT go through `authenticatedFetch` in `client/src/services/api.ts`, because on 401
that path calls `handleUnauthorized()` which wipes localStorage and forces
`window.location.href = "/"` — catastrophic for an anon browsing experience.

Use `optionalAuthFetch` for anon-viewable endpoints (`getUserByPubkey`,
`getUserOverview`, `getUserStats`, `getUserConnections`).

**Rule:** "signed in" = presence of `brainstorm_session_token` OR `nostr_user` in
localStorage. If either exists, route through `authenticatedFetch` (preserves
personalized POV + silent re-auth + redirect-on-expiry). Only a truly empty auth
state (neither key) does a plain `fetch` with no redirect side effects.

**Why:** a visitor with `nostr_user` is considered signed in (they may just be
mid-re-auth with an expired token); downgrading them to a plain fetch would silently
flip them to house POV. So we keep them on the authenticated path. The tradeoff: a
stale `nostr_user` with an invalid token can still trigger the redirect/wipe on a
public page — accepted, since that is the existing logged-in behavior, not an anon case.

**How to apply:** when adding a new endpoint that anon pages can hit, prefer
`optionalAuthFetch`. Backend token-less serving of house-POV scores is coordinated
separately; until it lands, anon profile data 401s and the page degrades to a
"Profile not found" state (no crash, no redirect).
