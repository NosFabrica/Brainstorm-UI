# Score display modes — decisions

User feedback: giving people a numbered score feels wrong. The response is a
viewer-side display choice, decided by grilling on 2026-08-19. Branch:
`feat/score-display-modes`, based on `feat/decentralized-tagging` (rebase onto
main once PR #44 lands).

## The decisions

**1. It is a viewer preference, not a subject opt-out.** "I don't want to see
people as numbers" is deliverable — we control every pixel we render. "I don't
want to BE a number" is not: scores are published NIP-85 events and any client
computes and shows them regardless. We will not imply a promise the protocol
can't keep.

**2. Three modes: Number / Level / Tier.** Benjamin's call, overriding a
two-mode recommendation — users get a middle position.

**3. Level mode is five pips that count the TIER, not the score.** This is what
redeems the middle mode: Unverified=1 … Highly verified=5, filled pips in the
tier's hue. All three modes are then three renderings of ONE ladder —
digits, pips, words — with thresholds staying in `trustThreshold.ts` as the
single source. Never derive pips from score01 directly; a 5-segment rescale of
the number is the number.

**4. The control lives in Settings → Trust & search**, beside the Trust
Perspective card that already owns "how trust renders for me". Persistence is
localStorage per account (the PoV toggle's precedent — key
`brainstorm_score_display:<pubkey>`, values `number | level | tier`), with
cross-device sync via NIP-78 prefs as a later upgrade that doesn't move the
control.

**5. Default = Number.** The digits are currently the product's face; changing
the default on feedback of unknown prevalence would decide a brand question
inside a settings feature. Ship the choice, watch adoption, let the team move
the default deliberately.

**6. The toggle hides ALL numbers, your own included.** Benjamin's call,
overriding a keep-your-own-digits recommendation: one rule, no exceptions.
Accepted cost, to be designed for rather than suffered: Insights' calculation
history loses numeric deltas in Level/Tier modes — rows show the tier (pips or
word) per run, with a movement marker only when the tier changed between runs.
The "how it moved and why" promise weakens to "whether it moved tiers"; copy on
that page must follow the mode.

## Implementation shape

- `useScoreDisplayMode()` — localStorage per-account + custom event for
  cross-component sync, mirroring `useActivePov`.
- `VerificationCoin` renders per mode: digits / a 5-pip arc inside the coin
  (falling back to plain hue below the size where pips are legible) / plain
  hue. The accessible label ALWAYS carries the tier word, and carries the value
  only in Number mode.
- The ~10 surfaces that print raw numbers follow the mode: Number → today;
  Level → pips; Tier → the `TIER_LABELS` word, or nothing where a word can't
  fit. Exempt: admin surfaces (operators need numbers) and the explainer
  page's simulation (it exists to teach the number).
- Share/OG cards follow the sharer's mode at generation time.
- Settings control: three-option segmented row titled plainly (e.g. "How
  people's verification is shown": Number / Level / Tier), rendered from one
  MODES list so the labels can't drift from the store's values.

## Not in scope

Publishing the preference to relays, per-subject opt-outs, changing what the
backend computes or publishes, and any change to tier thresholds.
