---
name: Duplicated search/icon UI across surfaces
description: Several UI pieces exist in more than one place; changing one without the other causes "it didn't work" confusion.
---

Some UI is intentionally duplicated across surfaces rather than shared, so a change can look like it "didn't work" when you edited the wrong copy.

**Known duplicates:**
- The live-search suggestions dropdown exists separately on the home route and on the dedicated search route (two components, not one shared widget).
- Brainstorm "app" icons (Communities, Music, etc.) appear both in the apps launcher menu and in the marketing/about pages.

**Why:** wasted a cycle fixing a dropdown bug in the search-route component when the reported bug was on the home route's own copy.

**How to apply:** before editing or verifying search-dropdown or app-icon UI, confirm which surface the user means (screenshot/test-id prefix), edit that one, and check whether the sibling copy needs the same change. Prefer extracting a shared module when you touch both. For mobile dropdown height capping, measure with `window.visualViewport` (accounts for the on-screen keyboard), not `window.innerHeight`.
