---
name: Home search perspective (effectivePov) fallback rule
description: How the logged-in home (/) trust-perspective toggle resolves which POV actually drives search, and its silent fallbacks.
---

# Home search perspective toggle (landing.tsx)

The home `/` (landing.tsx) has a logged-in trust-perspective toggle (NosFabrica
"house" vs "My results"/mywot). The *stored* POV (`useActivePov`) is NOT always
the one used. The page computes an `effectivePov` and that is what drives search
and the active highlight.

**Rule:**
- logged-out (`!user`) → always `nosfabrica` (house). The toggle is not rendered;
  a non-interactive "Not Personalized" hint shows instead.
- logged-in + stored `mywot` + no calculated graph (`!hasMywot`) → silently falls
  back to `nosfabrica`. The mywot button is `disabled`, and a
  "Calculate yours →" link to `/settings` appears.
- otherwise → the stored POV is honored.

**Why:** "My results" is meaningless without a calculated WoT graph, so it must
degrade to house rather than issue a broken personalized query.

**How to apply:** when touching the toggle or search wiring, keep the active
highlight (`aria-pressed`) and the issued query both keyed on `effectivePov`, not
the raw stored `pov`. A change to POV re-runs the active search via an effect
keyed on `effectivePov` (guarded by a `prevPovRef`).

Guarded by `scripts/home-pov-toggle.test.ts` (validation step `home-pov-toggle`),
a static AST/source test — there is no DOM runner in this repo.
