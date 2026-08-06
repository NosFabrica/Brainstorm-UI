# Acceptance results — Brainstorm-UI × nosfabrica-tagging

Run 2026-08-06 against the live instances, branch `feat/decentralized-tagging`.
Updated the same day when rung C2 (tagging notes) landed.

Covers **both** kit checklists: `core/ACCEPTANCE.md` (C0–C7 + Hygiene), which
the kit says "still applies verbatim underneath", and the UI overlay's
`ACCEPTANCE.md` Floors A–D.

Kit commit integrated: `8412198053c5916377724a9a2960db8d5bd67407`
(`nous-clawds4/tapestry`, branch `generate-nosfabrica-integration-kit`).

**Summary: 40 pass · 2 fail · 0 not-built.** Both failures are upstream defects
we've filed, not integration gaps — see `KIT-FEEDBACK.md` §1 and §5.

Legend: **PASS** verified this run · **FAIL** verified broken · **N/B** rung not
built · **N/E** not exercisable in this environment, with the reason given.

---

## core/ACCEPTANCE.md

### C0 — Service layer online

- **PASS** SDK vendored and reachable. `client/src/lib/tagging-sdk/**/*.js` is
  byte-identical to `core/sdk` (verified by `diff -rq` this run); the only extra
  files are our hand-written `.d.ts` declarations and a README.
- **PASS** `CONFIG.json` consumed unmodified. `client/src/config/tagging.config.json`
  diffs clean against the kit's `CONFIG.json`.
- **PASS** No 64-hex literals in new source; every pubkey and relay URL is read
  from config (`client/src/config/tagging.ts`).

### C1 — Read tags on pubkeys

- **PASS** *Same tags, net counts matching the reference instance.* Recounted
  `verified-human` straight off `wss://dcosl.brainstorm.world` with the kit's
  rule applied verbatim (distinct asserters per target, net apply−dispute > 0,
  no self exclusion): **14 carriers net-positive, 1 self-only** — exactly what
  `/tags/.../verified-human` renders. Per-person spot-check of all four
  self-taggers on that tag: 3/2/2/1 applications under the spec rule, each
  exactly one higher than our previous (self-excluding) arithmetic. That old
  arithmetic was the divergence; it is fixed.
- **PASS** *Tag names resolve, and repeat reads hit the cache.* Instrumented
  `WebSocket.send` in the running app, loaded two profiles that share tags:
  profile A resolved `verified-human, artist, grantless-applicants,
  grantless-arbiter, lfo, nostr-dev`; profile B then issued **one** element REQ,
  for `["dcosl","web-of-trust-builder","aos-2026-participant","neurologist"]`
  only. The two shared tags never reached the relay.
- **PASS** *Replaceable dedupe.* `normalizeAssertions` keys latest-wins on
  `(tag, target, asserter)` and the recount above tolerates the relay returning
  31 raw assertions for 16 distinct targets without inflating any count.

### C2 — Read tags on events

- **PASS** *An event known to be tagged yields its tags with correct net
  counts.* `/e/:id` renders a "Tagged as" row. Verified anonymously on a note
  carrying `LFO Community`; the chip links back to that tag's page.
- **PASS** *Reads issue batched queries, no per-event REQ storm.* One
  `{kinds:[39999], '#e':[id]}` per note, and the tagging headers behind them
  resolve through a session cache keyed by coordinate, so the second note
  carrying a tag issues no header query.
- **PASS** *Headers resolve; no `unverifiable` for known-good taggings.* The
  count is carried through to `NoteTagsResult.unverifiable` rather than being
  swallowed — an assertion whose header we can't reach is reported, not dropped,
  which is the kit's stated diagnostic for a header fetch that missed a relay.

### C3 — Apply an existing tag

- **PASS** *Apply an existing tag to an **event**.* Wire-checked across all
  three publish sequences without publishing anything: `applyEventTagging` takes
  sign/publish as injected deps, so the real sequence-selection logic ran
  (including live header discovery against the hub) while every event it would
  sign was captured instead. See "Event-tagging wire check" below.
- **PASS** Apply to a **pubkey** → the C1 read includes it, and the asserter's
  own stance is present immediately via the `mine` channel
  (`fetchProfileTags` records `mine` *before* the trust filter, so a tag you
  just applied can't vanish under a POV that doesn't count you).
- **PASS** Wire check on the profile-tag shape: `d` =
  `profile-tag-<slug>-<target8>-<asserter8>`, `p` = target, `a` =
  `39999:<tagAuthor>:<slug>`, `e` = element id, `z` × namespace, `polarity`.
  Verified on relay during earlier sessions with throwaway keypairs.
- **PASS** Applying the same tag twice does not duplicate — the `d` tag is
  deterministic for the triple, so the relay holds one assertion.
- **PASS** *Applicability separation available to any picker.* Wired this run:
  `fetchApplicability()` reads the house's kind-30394 lists and, when they're
  empty or unreachable, derives the same HINT ∪ USAGE union client-side via
  `deriveApplicabilityMembers` + `applicabilityHintFilter` — the fallback the
  kit prescribes. `fetchPickerTags()` bands on the result: profile-applicable
  leads, content-applicable renders under "Usually used on posts".
  **Scope note, deliberate:** the picker does not advertise hint-only tags
  nobody has applied, because the house's published pubkey list contains
  `jumble-qa-profile-1784946392` and `test account` (KIT-FEEDBACK §5). The
  classification is wired and correct; we just don't surface harness output.
- **N/E** *As B, reading the same targets.* Needs a second signer identity;
  logged-out verification can't cover it. The read path is identity-independent
  (relays only, no per-viewer filtering beyond `mine`), so the risk is low, but
  it is genuinely unverified.

### C4 — Dispute / stance toggle

- **PASS** Dispute drops the net count, and the disputer still sees their own
  stance via `mine` even where the net-≤0 rule hides the tag.
- **PASS** Stance REPLACES rather than appending — same deterministic `d`, later
  `created_at` wins. Verified on relay in an earlier session (apply → dispute →
  apply, one assertion throughout).
- **PASS** Same replace semantics on a profile-tag stance.

### C5 — Create a new tag on the fly

- **PASS** *Mint-and-apply a new tag to an **event** in one flow.* Sequence (c)
  in the wire check: tag-element carrying the `tag-for-nostr-event` hint z, then
  the tagging header, then the assertion — all three shapes correct.
- **PASS** *As B, apply A's new tag to a different event → exactly ONE publish.*
  Sequence (a): with a header already on the hub, only the assertion is built,
  and its descriptor names the EXISTING header's author rather than minting a
  second one.
- **PASS** Mint-and-apply a new tag to a **pubkey** in one flow → tag-element
  carrying the `tag-for-nostr-pubkey` hint z, plus the assertion. Both shapes
  correct.
- **PASS** Reuse rather than re-mint: `resolveOrMintTag` looks up an existing
  element by name first (best-supported wins, oldest breaks ties), so applying
  someone else's tag publishes exactly one event — the assertion.
- **PASS** Partial-failure honesty. `applyProfileTagging` returns
  `{published, failedAt}` and we surface a failure rather than claiming success
  when the element lands but the assertion doesn't.

### C6 — Tag → targets

- **PASS** Forward read returns tagged **pubkeys**, grouped by target, with
  most-recently-tagged available as a sort (`/tags/:author/:slug`).
- **PASS** Forward read returns tagged **events**. Recounted `lfo-community`
  straight off the hub with the kit's discipline (latest-wins per `(pubkey, d)`,
  then net apply−dispute > 0): **15 notes**. The tag page renders 15.
- **PASS** A target disputed below net-0 is absent from the forward read
  (`netPositive`, applied per carrier).
- **PASS** Cold-start via the hub works — `verified-human` returns 14 people on
  a machine with no local state.

### C7 — Trust hardening + degraded mode

- **PASS** *30382 REQs are batched `authors + '#d'` only.* Captured live: one
  REQ, `{kinds:[30382], authors:[2], "#d":[4]}`, no other keys, zero
  open-ended `kinds:[30382]` subscriptions.
- **PASS** *…and they go to `trustRelays`.* `fetchTrustEvents` targets
  `TRUST_RELAYS` (`wss://tags.brainstorm.world/relay`), deliberately not the hub.
- **PASS** *`minRank: 99999` drops every scored asserter.* Set it, reloaded:
  `verified-human` fell from **14 people to 6**. The 6 survivors are carried by
  asserters with no published score, passing via `unknownPolicy: "trusted"` —
  precisely the behaviour the checkbox describes. Config restored after.
- **N/E** *…and the viewer's OWN stance still surfaces via `mine`.* Verified
  logged-out, so there was no viewer stance to observe. The `mine` channel is
  recorded before the trust filter by construction, but this half is untested.
- **PASS** *Tag relays unreachable.* Pointed the tag-relay list at
  `wss://nope.invalid.example` (through the new Settings override, no code
  change). Profile rendered normally, tags simply absent, no crash, no wedged
  loading state, no error boundary.
- **PASS** *Trust relays unreachable → degrade to `unknownPolicy`, no errors
  surfaced.* Pointed `TRUST_RELAYS` at a dead host: `verified-human` returned to
  14 people (unfiltered), no error toast, no error boundary, no spinner. Failed
  chunks are left uncached by the SDK so a later `ensure` retries rather than
  negative-caching. Config restored after.
  **Plus:** the page now says so — *"We couldn't check who's reputable right
  now, so everyone who added a name is counted here."* C7 asks that this degrade
  quietly; quietly is not the same as invisibly, and a list that looks vetted
  when it wasn't is the one failure worth a line of text.

### Hygiene

- **PASS** *The tag-relay list is editable and persists.* Built this run:
  Settings → Trust → Advanced → "Where tags come from"
  (`components/settings/TagRelaysCard.tsx`). Layered
  `localStorage → VITE_TAG_RELAY_URLS → CONFIG.json`, so the shipped default and
  the container override both still work, and `CONFIG.json` stays byte-clean.
  Saving clears the session caches and refetches, because pointing at a
  different instance must not leave the old one's tags on screen.
  Verified by `client/src/config/tagging.test.ts` (8 tests: layering,
  round-trip through storage, junk rejection, trailing-slash normalisation,
  empty-list fallback) rather than through the UI — Settings is auth-gated and a
  faked session gets 401-wiped in preview. The persistence assertion was
  mutation-checked (removing the write turns it red).
- **PASS** Host build clean (`tsc --noEmit`, `vite build`); existing tests pass.

---

## UI overlay — ACCEPTANCE.md Floors

### Floor A — read-only

- **PASS** Tag chips render for logged-out visitors on `/p/:id`.
- **PASS** Zero `/api/*` calls from any tag surface — relays only, by
  construction (`services/tags.ts` imports nothing from `services/api.ts`).
- **PASS** `data-testid="share-tags"` present.
- **PASS** Counts match the reference instance — see C1 above.
- **PASS** An untagged profile renders nothing for an anonymous viewer.
- **DIVERGENCE, declared** *"Role chips still render exactly as before."* They
  don't — we took `Start.md` Q2's **migrate** option, which sanctions converting
  the host's role chips to protocol tags. Floor A's coexistence line is the
  check for Q2's *default*, not a rule against the option we chose. Recorded in
  `DECISIONS.md`; the Floor A wording should say "if you chose coexist", and
  that's raised in `KIT-FEEDBACK.md`.
  Q2's migrate is specified as "a one-time, owner-prompted conversion" — the
  prompt half was missing and is now built
  (`components/share/LegacyRolePrompt.tsx`): owner-only, publishes nothing until
  they press the button, dismissible once and permanently.

### Floor B — stance

- **PASS** Apply, dispute, and withdraw all work from the profile.
- **PASS** After withdrawing, the viewer "still sees their own stance state
  honestly (dimmed/struck, not vanished)" — uncounted tags render faded rather
  than disappearing.

### Floor C — tag anyone

- **PASS** Any signed-in holder of a signer can tag any profile, not just their
  own.
- **PASS** Mint-on-the-fly from the picker, reusing an existing element when the
  name already exists.

### Floor D — tag pages

- **PASS** `/tags/:author/:slug` lists everyone carrying the tag, net > 0 only.
  The has-a-profile gate was removed from this read this run: Floor D specifies
  no such condition, and requiring a kind-0 would hide assertions the reference
  instance shows. The gate remains only on `/tags`, our own browse page, which
  the kit doesn't specify and which is mostly harness output without it.
- **PASS** Tag pages list tagged **notes**, rendered with the app's own
  `EmbeddedNoteCard` — the same component the share page uses for quoted notes,
  which is what "the app's native note components" asks for.
- **PASS** *Note-tagging affordance wherever the app renders notes with
  actions.* That is `/e/:id`, the only surface where a note has its own page and
  action row; feed rows and thread replies render notes without actions, so
  there is nothing to hang it off there.

---

## Floor claim

**Floor D.** Every rung C0–C7 is built, and both halves of a tag page — people
and notes — are live. The one caveat worth stating plainly: addressable targets
(`a`-coordinates) are read and counted but not rendered, because no tag on the
live hub uses one and we won't ship a card shape we've never seen real data for.

## Event-tagging wire check (C3/C5, §6)

Run as a dry run — `applyEventTagging`'s sign/publish deps were replaced with
collectors, so the real logic ran and **nothing was published**. Header
discovery hit the live hub, so the sequence choice is real.

| Sequence | Situation | Publishes | Verified |
|---|---|---|---|
| a | tag + header both exist | 1 | `d` = `event-tag-<slug>-<target8>-<asserter8>`; `e` carries our relay hint; two `nostr-event-tag` z-handles; descriptor z resolves to the **live** header `39999:6db8a13f…:tagging:lfo-community-tagging`; `polarity 1` |
| b | tag exists, no header | 2 | header `d` = `tagging:<slug>-tagging`, its `a` pointing at the tag author's element; assertion's descriptor names the asserter as header author |
| c | brand-new tag | 3 | element carries the `tag-for-nostr-event` hint (not the pubkey one); header; assertion with `polarity -1` |

A `publish` that throws aborts the sequence and returns `failedAt` rather than
reporting success — the partial-failure contract, confirmed in all three runs.

**Not verified:** the live publish round-trip. Doing it means writing a public,
permanent, signed claim about somebody else's note, and there is no delete. Say
the word and it's a two-minute check with a throwaway key.

## The two failures, both upstream

1. **`hops` is never published** (KIT-FEEDBACK §1). 500 of 500 sampled
   kind-30382 events carry `d`, `rank` and `followers`; not one carries `hops`.
   The SDK reads a missing `hops` as 999 and tests `hops <= maxHops`, so
   `CONFIG.json`'s `maxHops: 20` rejects every asserter who *has* a score while
   counting everyone who has none. We neutralise the hops criterion in
   `config/tagging.ts` — outside `CONFIG.json`, so re-vendoring stays clean —
   and let `rank` gate. Shipping the config value as written would mean
   knowingly shipping an inverted filter. Revert when the pipeline publishes
   hops.
2. **The published applicability list carries harness entries**
   (KIT-FEEDBACK §5) — `jumble-qa-profile-1784946392` and `test account` are in
   the house's pubkey list. Consequence recorded under C3 above.

## Extensions beyond the kit, and where they stand

`INTEGRATION.md` §5 puts rendering with the integrator ("what the host *renders*
with each capability is the per-target kit's or the integrator's decision") and
`core/ACCEPTANCE.md` defines "surface" as "whatever the host renders the data
with, even if that's a `console.table`". These are that layer, and none
contradicts a checkbox: vote and add-yourself on the tag page, agree/disagree
controls, voucher attribution with links, badges, sorts, the ≥10-carrier
filters, the `/tags` browse page, tag matches in search, linkified descriptions.

**Tag comments are the exception and are OFF.** No kit document defines a
comment layer, so nothing extra-protocol should be live during an acceptance
run. The code stays behind `TAG_COMMENTS_ENABLED` in `config/tagging.ts`, and
the anchor question is `COMMENTS-PROPOSAL.md`. The finding that came out of
building it — the hub rejects kind-1111 outright, so any discussion layer is
inherently split across two relay sets — is `KIT-FEEDBACK.md` §6, and is worth
more to the kit than the feature was to us.
