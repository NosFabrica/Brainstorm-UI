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

**Rule:** "signed in" = presence of a session token OR a stored nostr user. If either
exists, route through the authenticated path (preserves personalized POV + silent
re-auth + redirect-on-expiry). Only a fully empty auth state does a plain fetch with
no redirect side effects.

**Why:** a visitor with a stored nostr user is treated as signed in (they may be
mid-re-auth with an expired token); silently downgrading them to a plain fetch would
flip them to house POV. Accepted tradeoff: a stale stored-user with an invalid token
can still trigger the redirect/wipe on a public page — that's the existing logged-in
behavior, not an anon regression.

**How to apply:** when adding an endpoint that anon pages can hit, prefer the
optional-auth wrapper. Backend token-less serving of house-POV scores is coordinated
separately; until it lands, anon profile data 401s and the page degrades to an empty
"not found" state (no crash, no redirect).
