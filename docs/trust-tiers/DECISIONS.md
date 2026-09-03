# Three-bucket trust display — decisions

Grilled 2026-08-21 from the team meeting (Jon, Vitor, Enes, Benjamin, Claude).
Branch: `feat/three-tier-trust`, based on `feat/score-display-modes` (which
carries the display-mode store, Settings control and demo switcher this needs).

## The ask

Simplify the five-tier ladder (Highly verified · Verified · Neutral · Limited ·
Unverified, plus the Flagged state) to three buckets — **verified / unknown /
flagged** — because "what am I going to do with someone who's verified but not
highly verified?" (Jon). Give users actionable information, not gradations.

## Decisions

1. **The middle bucket is "below the verified line", not "no data".** Verified =
   score at or above the preset-driven verified line (`DEFAULT_VERIFIED_LINE`
   0.02 = "score 2", moved by Relax/Default/Strict server-side). Unknown =
   everything below it, including brand-new accounts. Flagged wins over both.
   No new threshold — the existing line is the boundary, so Strict shrinks
   Verified and grows Unknown on its own (Enes's question).
2. **One flag, one source.** Flagged = the backend's
   `verifiedReporterCount >= reporterThreshold` wherever a response can answer.
   The client heuristic in `lib/trustFlags.ts` (`reporters > 5 + followers/750`)
   is demoted to the fallback for bare-score surfaces with no observer context
   (note cards, search rows, OG images) — the same principle the verified line
   already follows.
3. **Names: Verified · Unknown · Flagged.** "Mystery" rejected (not serious);
   "Network supported" rejected (describes the verified bucket, not the middle).
   Unknown gets a one-line explainer wherever there's room: *"No one in your
   network has vouched for this account yet."*
4. **Colors reuse three existing constants; color never carries it alone.**
   Verified → Aurora Cyan `#13d2e5` (today's `trusted`), Unknown → brand grey
   `#8c929e` (today's `unverified`), Flagged → `#ef4444` (today's `flagged`).
   Each bucket also has a glyph — check / question mark / flag — so the three
   read in greyscale. Colorblind presets (Enes) deferred to the roadmap: the
   glyphs make the default legible without them.
5. **Anti-spoofing (Vitor):** the bucket badge straddles the avatar border,
   half over the photo and half outside, with a page-surface gap between badge
   and photo (the 2px white/slate step the perspective ring already uses). The
   gap can't be painted from inside an image. The glyph is inside the badge.
   Rings (tier/word display modes) are reinforcement only, never the sole proof.
6. **Two independent settings, not a sixth display mode.** *Tiers* is a data
   choice — **Simple (3)** or **Detailed (6: five tiers + Flagged)**. *Display
   mode* (number / level / tier / word / off) is a rendering choice and works
   under either ladder: Number colors digits by bucket; Level's pips become
   ladder-aware (Simple: Flagged 1 · Unknown 2 · Verified 3); Tier and Word
   draw ring/chip in bucket color plus the straddling glyph badge in every mode
   except Off; Off stays off, flag banner stays.
7. **Everything a user sees follows the Tiers setting, from one source** —
   per-person marks, the Network Composition pie, the WoT bar, Insights
   history, and the Network/connection-list tier filters. The admin user panel
   stays Detailed always. Whole-page color schemes per bucket: rejected.
8. **Placement and default.** Tiers control sits beside the display-mode row
   in Settings → Trust Perspective, two chips; stored per-account on the device
   and broadcast like the display mode; the demo switcher gets the same two
   chips. **Simple is the default for everyone, existing users included.**

## Implementation shape

- `lib/trustLadder.ts` — `Bucket = "verified" | "unknown" | "flagged"`;
  `bucketFor(score01, flagged)`; `ladderFor(granularity)` returning the active
  rungs (3 or 6) with label, color, glyph and rung index; `rungOf(...)`.
- `hooks/useTierGranularity.ts` — `"simple" | "detailed"`, same store pattern
  as `useScoreDisplayMode` (per-account key, custom event, `storage` listener),
  default `"simple"`.
- `VerificationCoin` reads the active ladder: bucket color + glyph under
  Simple; pips count = ladder length; aria carries the bucket word.
- Rings (`useTierRing`), chips (`TierWordChip`), `TrustScoreBadge`,
  `WotStrengthCard`, `NetworkProfileCard`, Insights history rows, Network
  Composition, WoT bar, tier filters — read the ladder, not `TIER_STEP`/5.
- Settings: two-chip Tiers row; demo switcher: same.
- Backend untouched: the five tiers and thresholds stay exactly as computed;
  this is a reading of them.

## Not in scope

Colorblind presets; any change to backend tiers or thresholds; whole-page
tinting; renaming the Relax/Default/Strict presets.

## Build notes (2026-08-21)

- **Filters that can't express a union.** The connection-list page sends one
  backend `tier` bucket at a time, so "Verified = every tier above the line"
  isn't expressible there; under Simple its five-shade chips are hidden (the
  rows' coins already show the bucket). The Network page CAN express it: a
  Simple "Verified" chip maps to the server's `verified_only`, which resolves
  against the same preset cutoff, so list and header count agree. Its Simple
  set is All · Verified · Unknown · Flagged.
- **Composition chart** folds client-side: Verified = high + medium_high +
  medium + medium_low (the `medium_low` bucket's lower bound IS the verified
  line), Unknown = low, Flagged unchanged.
- **Store scoping bug fixed on the way.** Both viewer stores (display mode,
  granularity) keyed on the legacy `nostr_user` entry, which the accounts
  rework no longer writes — every signed-in user was sharing the `:anon` slot.
  They now key on the Active Account, with `nostr_user` as a migration fallback.
- Admin user panel untouched (decision 7).

## Team review addendum (Aug 21, after staging)

Defaults confirmed and tightened: **Simple** stays the ladder default, and the
display-mode default flips from Number to **Word** (ring + tier label) — the
ring on the photo with the tier word beside the name is the product's face;
the 0–100 score is the opt-in. Rings are to appear consistently wherever
profile pictures show **and a score is available**; sites with no score in
scope stay unringed (unrated) until a backend bulk-scores endpoint (pubkey
list → influence map) exists — recorded as the backend ask.
