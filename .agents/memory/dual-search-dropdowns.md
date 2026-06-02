---
name: Two separate search-suggestion dropdowns
description: Home and /search each have their own live-suggestion UI; changes must target the right file.
---

The home route `/` is rendered by `client/src/pages/landing.tsx`; `/search` is `client/src/pages/SearchPage.tsx`. Each has its **own** copy of the live-suggestions dropdown logic and layout — they are not shared.

**Why:** a dropdown-clipping fix was applied only to SearchPage, but the reported bug was on the home page, so it appeared "not working." Test-ids disambiguate: home uses `*-home-*` (e.g. `input-home-search`, `container-home-suggestions`, `home-suggestion-see-all`, `list-home-suggestions`); SearchPage uses the unprefixed equivalents.

**How to apply:** before changing or verifying search-dropdown behavior, confirm which surface the user means (screenshot/test-ids), edit that file, and remember the other copy may need the same change for consistency. For mobile height capping prefer `window.visualViewport` (handles the on-screen keyboard) over `window.innerHeight`.
