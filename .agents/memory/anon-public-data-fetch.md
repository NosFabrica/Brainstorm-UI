---
name: Anonymous-viewable data fetching policy
description: Why public/anon data calls must avoid the auth redirect+storage-wipe side effect, and what counts as "signed in".
---

# Anonymous-viewable data fetching policy

Public pages serve the NosFabrica "house" perspective to logged-out visitors. Any
data call reachable while anonymous must NOT go through the authenticated fetch path,
because on 401 that path wipes local auth storage and forces a redirect to the home
page — catastrophic for an anon browsing experience. Use the optional-auth fetch
wrapper for anon-viewable endpoints instead.

**Two distinct gates — do not conflate them:**

1. *Optional-auth data fetch* (anon-viewable endpoints, e.g. house-POV profile/overview/
   stats/connections): "attempt authenticated" = session token OR stored nostr user. If
   either exists, route through the authenticated path (personalized POV + silent re-auth);
   a fully empty auth state does a plain fetch with no redirect side effects.

2. *Strictly-authenticated calls that always wipe+redirect on 401* (anything going through
   `authenticatedFetch` directly — notably `getSelf()`/`/user/self`): gate these on a REAL
   session token only (`hasSessionToken()` in services/api.ts), never on `nostr_user` alone.
   `getCurrentUser()` returns truthy from a stale stored `nostr_user` with no token, so
   `enabled: !!user` is NOT safe on public pages (Search, Profile, the global PovAutoDefault
   via `useHasMywot`). A stale stored-user would otherwise 401 → wipe storage → hard-redirect
   to "/", hijacking anonymous browsing.

**Why:** the "treat stored-user as signed in even for getSelf" tradeoff was a real anon
regression — logged-out-ish visitors got bounced off `/search` and `/profile/:npub`. Anon
flows must never trigger the auth redirect.

**How to apply:** new anon-viewable endpoint → use the optional-auth wrapper. New call that
must use `authenticatedFetch` but lives on a public page (or a globally-mounted component) →
gate with `hasSessionToken()`, not just `getCurrentUser()`. Account-only routes redirect
anonymous visitors to `/login?next=<path>` (via `RequireAuth`), not to "/".
