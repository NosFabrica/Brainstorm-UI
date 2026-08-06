# Decentralized tagging — locked decisions

Decided **2026-08-05** (Benjamin + agent, via `/grilling`) before any code was
written. These are settled. If you want to reopen one, say so explicitly — don't
quietly drift.

Guidance source: `nous-clawds4/tapestry@generate-nosfabrica-integration-kit` →
`integration-kits/nosfabrica-tagging` (cloned read-only at
`/Users/benjamin/Desktop/tapestry`).

---

## 1. Scope — this is *tagging*

> **Revised 2026-08-05, same day.** Originally scoped to floor B. Benjamin then
> asked for the tag page, and then for tagging other people, so the shipped
> scope grew past floor B. The reasoning below about *what the feature is* still
> stands; only the stopping point moved.
>
> **Corrected 2026-08-06.** That revision claimed "floors B, C and **D**" before
> Floor D was real: it requires note tagging (rung C2) *and* tag pages listing
> both people and notes, and we had people only.
>
> **Earned 2026-08-06, later the same day.** C2 is built — see decision 7 — so
> the claim is now **Floor D**, honestly. `ACCEPTANCE-RESULTS.md` has the
> box-by-box position.

The feature was requested as "decentralized lists". The kit does not define a
lists feature; it defines a **decentralized, trust-ranked tagging protocol** for
people and notes. A list is what you get when you look at everyone carrying a
tag — so lists are the *payoff* of tagging, not the starting point.

**Built:**

- read tags on public surfaces (anyone, including logged-out visitors) — C1
- any signed-in user with a signer can tag **any** profile, their own or
  someone else's — C3 + floor C
- mint a brand-new tag from the picker — C5
- agree / disagree with a tag already on a profile — C4
- `/tags/:author/:slug`, everyone carrying one tag — the pubkey half of floor D
- tag chips on NOTES, and the posts carrying a tag — C2 + the note half of
  floor D

**Still not built:** server-side WoT-weighted tag ranking.

### What opening up floor C costs, and what pays for it

Anyone tagging anyone is the point of a decentralized attribute system, but it
means a stranger can attach a label to your profile. Two things are supposed to
contain that, and only one of them currently works:

1. **The trust filter** — the POV decides whose assertions count. *This is
   presently close to a no-op* (see the field note on `hops` below): unscored
   asserters are counted, so in practice any pubkey's tag shows up. **This is a
   launch gate, not a build gate** — it's the same reason decision 5's own-POV
   switch matters.
2. **Disputes** — the subject (or anyone) can disagree, which is built.

**There is no delete.** An assertion is superseded by re-publishing the same
deterministic `d` tag with the opposite polarity; the original stays on relays
and simply stops counting. So the UI says **"Disagree"**, never "Remove" —
saying "Remove" would be claiming something we don't do.

The old `origin/lists` branch (2026-03-30, info5195 — 289 behind / 122 ahead of
main, `ListDetailPage.tsx` at 1580 lines) is **reference only**. It predates the
rebrand, the design system, and the current kit. Read it for protocol hints;
port nothing wholesale.

## 2. The kit lands two ways

- **Docs, `ACCEPTANCE.md`, protocol notes** → read from the read-only sibling
  clone at `/Users/benjamin/Desktop/tapestry` (push URL disabled on both remotes,
  same guardrail as the three backend clones).
- **`core/sdk/`** → **vendored into this repo** at `client/src/lib/tagging-sdk/`
  and committed.

**Why vendor:** the build must never depend on a sibling checkout existing.
Anyone cloning Brainstorm-UI gets a working build.

The SDK is plain ESM JavaScript with JSDoc; this project is strict TS with
`noEmit`. **Do not rewrite it in TypeScript** — enable `allowJs` or add a thin
`.d.ts` beside the copy. Rewriting forks it from upstream and we lose the ability
to re-vendor.

## 3. Role chips are RETIRED; tags replaced them — still no auto-bridging

> **Revised 2026-08-05, same day.** Originally "coexist". The team's notes call
> the role chips the placeholder that tags were meant to replace, and
> `SharePage`'s own TODO agreed ("the owner-set role chips below stand in").
> Benjamin chose to follow that, so the chips and the "What you do" editor are
> gone.
>
> **The privacy half of this decision stands unchanged and is the important
> half:** nothing from `profile-prefs` is ever auto-published as a tag. Rather
> than delete people's self-declarations, the picker *offers* them back — an
> owner with saved roles sees "You listed these before · Add as tag", and a tap
> publishes. No tap, no event.
>
> `roles` stays in `ProfilePrefs` and `parseProfilePrefs`: `publishProfilePrefs`
> replaces the whole addressable event, so removing the field would erase saved
> roles the next time a user changed any other setting. `ROLES` stays too — it
> seeds the picker.
>
> **Completed 2026-08-06.** This is `Start.md` Q2's **migrate** option, which
> the kit specifies as "a one-time, owner-prompted conversion". We had the
> conversion but not the prompt — the roles were only offered inside the picker,
> so finding them meant opening a menu you had no reason to open.
> `components/share/LegacyRolePrompt.tsx` is the prompt: owner-only, publishes
> nothing until they press it, dismissible once and permanently.
>
> Note for the kit owners: overlay `ACCEPTANCE.md` Floor A asserts role chips
> "still render exactly as before", which contradicts Q2's own migrate option.
> Floor A's line is the check for Q2's *default*; it should say "if you chose
> coexist". Raised in `KIT-FEEDBACK.md`.

The original reasoning, which still explains why the two are different things:

Two things look similar on `/p/:id` and must stay separate:

| | "What you do" roles | Protocol tags |
|---|---|---|
| Storage | our NIP-78 kind-30078, `d` = `brainstorm.world/profile-prefs` | DCoSL events on the tag hub |
| Who can set | only you | you now; anyone later (floor C) |
| Ranking | none — it's a self-declaration | web-of-trust ranked |
| Vocabulary | `ROLES` in `client/src/config/personalization.ts` | open |

The tag picker **seeds its suggestions** from `ROLES` so the two vocabularies
rhyme visually. That is the *only* connection.

**Nothing a user set under "What you do" is ever published as a protocol tag.**
Publishing requires an explicit tag action. Auto-bridging would silently push
personal profile settings to a public hub — a privacy regression, not a feature.

## 4. Local-only until Benjamin says otherwise

Branch `feat/decentralized-tagging`, cut from `main` @ `894ab1c`, **with no
upstream configured**. `git push` stays a deliberate act.

The agreed process: build and polish locally → Benjamin decides it's ready to
show the team → push to GitHub → then push to staging. Do not push, open a PR,
or touch `brainstorm-k8s` without being asked.

## 5. Trust POV — start on the kit's house POV

Ship on `trust.mode: "house-ta"` as `CONFIG.json` provides it: assertions read
from `wss://tags.brainstorm.world/relay`, authored by `nip85AuthorPubkeys`.

**Known caveat, accepted for v1:** the live kind-30382 corpus on the house relay
is a 2026-05-26 snapshot signed by a **retired** key (`bfb6e1e8…`), not the
current assistant key (`a68dbf…`, which has published none yet). Combined with
`unknownPolicy: "trusted"`, expect many asserters to be unscored and therefore
counted. Fine for building and demoing; **not** fine for launch.

**Follow-up (not v1):** switch to NosFabrica's own NIP-85 corpus. That is a
config-only change — `trustRelays` + `nip85AuthorPubkeys` — blocked on getting
our 30382 signing pubkeys from David/Enes.

## 6. Alignment pass — decided 2026-08-06

Benjamin: *"we need to stick to the script of those docs … I dont want to
deviate from what they want me to integrate."* Audited both checklists and
changed what genuinely diverged. Results box-by-box in `ACCEPTANCE-RESULTS.md`.

The rule applied: **the kit specifies the machinery, and delegates the
rendering.** `INTEGRATION.md` §5 — "what the host *renders* with each capability
is the integrator's decision" — and `core/ACCEPTANCE.md` defines "surface" as
"whatever the host renders the data with, even if that's a `console.table`". So
UI additions aren't deviations; arithmetic and wire behaviour are.

**Changed to match the kit:**

- **Self-assertions are COUNTED.** We were routing `asserter === target` out of
  the counts. The kit counts distinct trusted asserters with no self exclusion,
  and C1 checks our net against the reference instance's — so we were one behind
  on every self-tagged person. The `selfDeclared` label stays; only the
  arithmetic changed. UI copy says how many *other* people vouched, via
  `lib/tagCounts.ts`.
- **Same-named tags are no longer merged.** Combining two authors' identically
  named tags reported one number where the protocol has two tags — the same
  parity problem. They render separately now; `lib/tagMerge.ts` keeps the merge
  code and its tests unwired against the open question in `KIT-FEEDBACK.md` §3.
- **The has-a-profile gate came off the tag page.** Floor D says "tagged people
  listed (net > 0 only)" and adds no condition. It stays on `/tags`, our own
  browse page, which the kit doesn't specify.
- **Applicability is wired into the picker** (C3), including the
  `deriveApplicabilityMembers` fallback. Bands only — never a sort key; ranking
  by the hint once buried `AOS 2026 Participant` (88 people) under tags with
  three.
- **Tag-elements are cached by coordinate** (C1's "repeat reads hit the cache").
- **The tag-relay list is user-editable and persists** (Hygiene). Layered
  `localStorage → VITE_TAG_RELAY_URLS → CONFIG.json`; `CONFIG.json` untouched.

**Kept, with the reason recorded:**

- **`maxHops` stays neutralised — and it is not a deviation.** Jumble, the
  reference client by the kit's own authors, publishes its defaults in its user
  guide and runs `maxHops=999` too. Both independent integrations corrected the
  same shipped value. Reverting to `CONFIG.json`'s `20` re-breaks
  trust entirely — see decision 5 and `KIT-FEEDBACK.md` §1. Shipping the value
  as written would mean shipping a filter we know is inverted.
- **Tag comments stay built but OFF** (`TAG_COMMENTS_ENABLED`). No kit document
  defines a comment layer, so nothing extra-protocol should be live during an
  acceptance run. The anchor question is `COMMENTS-PROPOSAL.md`.
- **Degraded mode now says so.** C7 asks that a dead trust source degrade
  without erroring; it doesn't ask us to imply the filter ran. When the trust
  source returns nothing, tag pages say the counts weren't checked.

## 7. Tagging notes — decided 2026-08-06

Built so Floor D could be claimed for real rather than aspirationally.

**Note tagging is a different shape, and the difference drove the design.** A
profile assertion names its tag directly (`a` = `39999:<author>:<slug>`); an
event assertion names a **per-tag tagging header** instead, and that header
carries the pointer to the tag. So reading tags on a note is a two-hop
resolution, and the middle hop is what decides legitimacy — a candidate counts
only if its header joins a `tagging-with-specific-tag` namespace we honor.

Consequences we accepted:

- **Applying a tag to a note costs 1, 2 or 3 publishes** — assertion alone,
  header + assertion, or tag + header + assertion. The SDK signs everything
  before publishing anything, so cancelling the signer aborts cleanly.
- **No optimistic chip on notes**, unlike profiles. Three publishes with a
  partial-failure contract means painting a chip before the assertion lands
  would be claiming something we don't know yet.
- **Unverifiable ≠ invalid.** An assertion whose header we can't resolve is
  reported (`NoteTagsResult.unverifiable`), not dropped. A header that hasn't
  propagated looks exactly like one that never existed, and only one of those is
  the reader's business.
- **The affordance lives on `/e/:id`.** Floor D says "wherever the app renders
  notes with actions", and that's the only surface where a note has its own page
  and action row. Feed rows and thread replies render notes without actions.
- **Addressable targets are counted but not rendered.** No tag on the live hub
  uses an `a`-coordinate target, and shipping a card shape we've never seen real
  data for is how you ship something broken.
- **Tag pages report how many posts carry a tag, not how many we could fetch.**
  The hub holds assertions ABOUT notes, never the notes, so a note on relays we
  don't read is unreachable — we say so rather than quietly showing a smaller
  number than another client would. See KIT-FEEDBACK §12: the reference
  publisher attaches no relay hints, which is what makes this bite. Our own
  writes always attach one.

## 8. A "my tags" page, and pinning — decided 2026-08-06

Benjamin asked what the kit says about managing a user's tag list. The answer
split three ways, and the split is the decision:

**There is no management page in the kit.** Tags on you live in the profile chip
row (`Start.md` §3.4's reserved slot) and you manage them there, in place. Tag
pages are `/tags/:author/:slug`. That's the whole specified surface.

**Two thirds of `/tags/mine` is therefore not a deviation.** `INTEGRATION.md` §5
puts rendering with the integrator — "what the host renders with each capability
is the integrator's decision" — so "tags about you" and "what you've said" are
ordinary UI over machinery the kit already sanctions. No flag, no apology.

The second one earns its place on its own terms: assertions are public,
permanent and signed with the user's key, and nothing else in the app answers
*"what have I actually claimed about other people?"*. A client that lets you
make permanent public claims owes you a list of them.

**Pinning is the deviation, and it ships off.** `core/protocol/tags.md` §Pins
specifies a personal curated set; `INTEGRATION.md` §8 lists it under *do not
build*; the SDK ships the read half and no builder. Built behind
`TAG_PINS_ENABLED = false` — same treatment as tag comments — so an acceptance
run sees only what the kit describes. Asks filed as KIT-FEEDBACK §14.

Two things we had to decide for ourselves, both flagged upstream rather than
buried:

- **The `tag-pinning` concept handle isn't in the SDK.** We compose
  `39998:<ta>:tag-pinning` by analogy with the documented family. Worksheet W1
  is open on exactly this, so `lib/tagPins.ts` says so in a comment and the
  tests assert our reading rather than a certainty.
- **Unpinning can't run where pins live.** The hub's NIP-11 document lists kinds
  9998/9999/39998/39999 and 7; kind 5 isn't there, so the spec's NIP-09 unpin is
  rejected by the relay the spec's pins belong on. We publish the deletion to
  general relays and union both sets on read — a workaround, recorded as
  KIT-FEEDBACK §15. Found by reading the relay's own advertisement before
  publishing anything, which is the cheapest verification in this whole build,
  and **confirmed on the wire 2026-08-06**: pin accepted by the hub, unpin
  rejected by it and accepted by `relay.damus.io`.

**The copy rule this page had to respect:** you cannot erase a tag someone else
gave you. The page says that in plain words at the top and never offers a
"Remove" button, because the protocol has no delete and we don't promise what we
don't do.

## 9. Adopting the reference client's rules — decided 2026-08-06

Benjamin shared Jumble's tags page and its user guide. Reading a sibling
implementation of the same kit was the cheapest review we've had, and it settled
three things.

**`maxHops` is not our deviation.** Jumble prints its baked-in defaults in its
own guide: `mode=house-ta minRank=1 maxHops=999 unknown=trusted`. Both
independent integrations corrected `CONFIG.json`'s `20` the same way. That
reframes KIT-FEEDBACK §1 from "our workaround" to "the shipped config is wrong
and everyone has to discover it the hard way".

**Discovery now gates on the tag CREATOR's trust score, not the tagged person's
kind-0.** Ours was the wrong axis: spam economics are about minting being free
and permissionless, so the bar belongs on who mints, not on who gets tagged.
Jumble's rule is better reasoned and better bounded, and it is scoped to browse
only — direct tag links resolve, existing taggings still render on profiles and
notes, and your own tags are never hidden from you.

Measured before and after on the live hub: the catalogue went from 39 entries
including `jumble-qa-profile-…` and `test-account`, to **34 entries with no
harness output at all** and the real counts intact (Musician 162, Author 43,
Artist 32). The honest cost, which Jumble also documents: genuine tags by
unscored creators — `lfo`, `developer`, `relay-operator` — drop out of browse
too, because an unscored key is indistinguishable from a throwaway one. They
reappear on their own when a score is published; nothing needs republishing.

**Net-disputed carriers are hidden, not deleted.** They now sit behind a "Show
N disputed" toggle rather than vanishing. You cannot judge a dispute you are not
allowed to see, and a page that silently drops them looks tidier than the
network actually is. `TagDetail.carriers` stays exactly what Floor D specifies
("net > 0 only") and the disputed set rides alongside in its own field, so the
acceptance box is untouched.

**One thing we did NOT copy.** Jumble's banner says "What you see here is
filtered through a web of trust", while its own guide admits unscored asserters
currently count — which on this corpus means the filter is close to inert. Our
equivalent line says so at the point of use instead: "We couldn't check who's
reputable right now, so everyone who added a name is counted here." Worth
raising with them as a copy fix.

---

## Field notes — what the live data actually looks like

Surveyed 2026-08-05 while building C0/C1. Both findings changed the code, so
they're written down rather than rediscovered.

### The hub's assertions are mostly QA noise, and that's convenient

Of 2000 profile-tag assertions on `dcosl.brainstorm.world`, only **6 carry an
`a` tag** — the coordinate that names which tag is being applied. Those 6 are
the real ones: `author`, `verified-human`, `dcosl` on people with real kind-0
profiles (david@bitcoinpark, Avi Burra, Shawn Yeager, vinney). The other 1994
are automated harness output (`wysiwyg-s17-1785898945945-…`) aimed at pubkeys
with no profile at all.

The protocol says to consume identity by `#a`, and we do. Falling back to the
`e` tag would technically recover the 1994 — and surface pure noise. So the
spec-conformant reader is also the correct one here.

### The trust corpus doesn't publish `hops`, which inverted the trust filter

All 500 sampled kind-30382 events on the house relay carry `d`, `rank` and
`followers`. **None carries `hops`.**

The SDK reads a missing `hops` as 999 ("unreachable") and then tests
`hops <= maxHops`. With the kit's `maxHops: 20`, that rejects every asserter who
*has* a published score, while everyone with no score at all sails through
`unknownPolicy: "trusted"`. david@bitcoinpark — `rank: 100`, the maximum — read
as untrusted, and the chip row rendered empty on every profile.

Fixed in `client/src/config/tagging.ts` by neutralizing the hops criterion and
letting `rank` gate, with `tagging.config.json` left byte-identical to the kit
so re-vendoring diffs stay clean. **Revert it when the house's NIP-85 pipeline
starts publishing hops.**

Note what this means today: with rank gating at 1 and unscored asserters counted,
trust is currently close to a no-op. That's the honest state of the corpus, not a
bug in our reader — and it's the same reason the NosFabrica-own-POV switch
(decision 5) matters before launch.

### Tags must be reused, not re-minted

A tag's identity is `39999:<author>:<slug>`, so two people minting "Author"
create two unrelated tags whose counts never combine. The live data shows the
ecosystem doing it right — `verified-human` is authored once by Avi and asserted
by several different people. `resolveOrMintTag()` therefore looks for an existing
tag-element first and only mints when there genuinely isn't one, choosing the
oldest when several exist (the original definition, and a choice every client can
reach independently).

## Standing constraints that shaped the above

- **Never route tag reads through `authenticatedFetch`.** `/p/:id` is
  anon-viewable and a 401 there wipes auth storage and hard-redirects. See
  `.agents/memory/anon-public-data-fetch.md`. In practice v1 doesn't touch the
  backend at all — tags are client-signed, client-published, client-read, exactly
  like our kind-1984 reports and kind-30078 prefs. Add nothing to
  `services/api.ts`.
- **The public profile is `SharePage.tsx` (`/p/:id`).** `ProfilePage.tsx`
  (`/profile/:npub`) is the members-only analytics view behind `RequireAuth` and
  is *not* our surface.
- The insertion point already exists: `SharePage.tsx` carries a literal TODO
  reserving the chip slot for "the team's WoT-ranked attribute chips", with the
  role chips standing in until tag data ships.
