# Decentralized tagging — locked decisions

Decided **2026-08-05** (Benjamin + agent, via `/grilling`) before any code was
written. These are settled. If you want to reopen one, say so explicitly — don't
quietly drift.

Guidance source: `nous-clawds4/tapestry@generate-nosfabrica-integration-kit` →
`integration-kits/nosfabrica-tagging` (cloned read-only at
`/Users/benjamin/Desktop/tapestry`).

---

## 1. Scope — this is *tagging*, and we build floor B

The feature was requested as "decentralized lists". The kit does not define a
lists feature; it defines a **decentralized, trust-ranked tagging protocol** for
people and notes. A list is what you get when you look at everyone carrying a
tag — so lists are the *payoff* of tagging, not the starting point.

**We build floor B:**

- read tags on public surfaces (anyone, including logged-out visitors), and
- let a signed-in user **tag themselves**.

**Not in v1:** tagging other people (floor C), a `/tags/:author/:slug` list page
(floor D), note tag chips (rung C2).

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

## 3. Role chips and protocol tags coexist — no bridging

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
