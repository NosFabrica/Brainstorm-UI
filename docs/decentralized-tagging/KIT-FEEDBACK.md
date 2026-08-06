# Feedback on the nosfabrica-tagging integration kit

From integrating the kit into Brainstorm-UI on 2026-08-05 (floors B/C/D + C4,
built in one session). For Vinny / whoever maintains the kit.

Kit commit integrated: `8412198053c5916377724a9a2960db8d5bd67407`
(`nous-clawds4/tapestry`, branch `generate-nosfabrica-integration-kit`).

**Headline: one defect will silently break every client that integrates this the
way we did.** Details below, most urgent first.

---

## 1. The trust filter is inverted against the live corpus — `hops` is never published

**Severity: high. Silent, and it fails in the direction of trusting nobody.**

`sdk/trust.js` reads a missing `hops` tag as `999` ("unreachable") and then
tests `hops <= maxHops`. `CONFIG.json` ships `maxHops: 20`.

We surveyed the house relay (`wss://tags.brainstorm.world/relay`) on 2026-08-05:
**500 of 500 sampled kind-30382 events carry `d`, `rank` and `followers`. Not one
carries `hops`.**

So every asserter who *has* a published trust score is rejected, while everyone
with no score at all passes via `unknownPolicy: "trusted"`. Exactly backwards.
Concretely: david@bitcoinpark has `rank: 100` — the maximum — and read as
untrusted. Our chip row rendered empty on every profile until we found it.

Our workaround is a config-level override neutralising the hops criterion so
`rank` does the gating. Suggested fixes for the kit, in preference order:

1. Treat a **missing** `hops` as unknown rather than as 999. Absence of a
   dimension isn't a failing score on that dimension.
2. Failing that, ship `maxHops: 999` in `CONFIG.json` until the pipeline
   publishes hops, and say why in the `_comment`.
3. At minimum, document it loudly — an integrator has no way to guess that the
   trust source silently inverts.

Worth noting the second-order effect: with hops neutralised and
`unknownPolicy: "trusted"`, trust is currently close to a no-op. Any client
shipping this today is effectively unfiltered, whatever the config implies.

## 2. Most of the hub's assertions are QA output — and `#a` is the filter

Not a bug, but integrators should be told.

Of **2928** profile-tag assertions on `wss://dcosl.brainstorm.world`, only **23**
carry an `a` tag. The other ~2900 are harness output
(`profile-tag-wysiwyg-s17-1785898945945-kv0oo3-…`) aimed at pubkeys with no
kind-0 at all. The 23 are the real ones — `author`, `verified-human`, `dcosl` —
on real people.

Consuming identity by `#a`, as the protocol says, is therefore *also* the noise
filter. We nearly added an `e`-tag fallback "for robustness"; it would have
surfaced the garbage and bought nothing. Please say so in the docs.

**Related trap:** a plain `limit` on that read is misleading. The QA events are a
recent burst, so a newest-first page of 2000 contains ~6 real assertions. Our
first tag catalogue under-reported because of it (claimed 2 people for a tag with
4). Anything that aggregates across the corpus has to paginate backwards through
`until`. A note in the kit would save the next integrator the same bug.

## 3. Duplicate tags: what's the intended client behaviour?

A genuine question, not a defect.

The protocol allows two authors to mint the same name, and the stated model is
that WoT surfaces the most relevant. But the *write* side has no guidance: when
a user types "Bitcoin" and two `bitcoin` elements exist, should a client

- reuse the best-supported existing element (what we do — counts converge on one
  identity), or
- mint freely and let readers rank (simpler, but counts fragment across
  identities that look identical to a user)?

We chose reuse-the-best-supported, oldest as tiebreak so independent clients
converge without coordinating. If that's the intended citizenship it belongs in
the kit; if it isn't, we'd like to know before more clients ship.

On the read side we merge same-named tags into one chip and union the asserter
**sets** — someone who vouched for both variants must count once. Adding the
counts double-counts them. Cheap mistake to make; worth a line in the docs.

## 4. Warn that host publish helpers may ignore a relay argument

Ours did. `publishToRelays(event, relays)` in our own `services/nostr.ts` takes a
`relays` parameter and **ignores it**, always resolving the author's outbox. A
tag event routed through it would never have reached `tagRelays`, and nothing
would have errored — it would just quietly publish to the wrong place.

We publish directly instead, seeding the outbox lookup with `tagRelays` to get
the union the kit asks for. Suggest the kit's §3.5 explicitly tell integrators to
verify their publish helper actually honours a relay list, because the failure is
invisible.

## 5. The published applicability list carries QA entries

`fetchApplicabilityLists` works and returns data — 13 pubkey-applicable, 27
event-applicable coordinates as of 2026-08-05. Two problems in practice:

- **For a people-picker sourced from usage, the hint is redundant and actively
  harmful as a sort key.** Applicability is HINT ∪ USAGE, and a catalogue built
  from profile taggings is *entirely* applicable-by-usage. Only 9 of our 39
  tags carry the hint, so ordering by it buried `AOS 2026 Participant` (88
  people) beneath tags with three. Worth stating in C3 that the hint is for
  cold-start and cross-context ordering, not for ranking a usage-derived list.
- **The pubkey list includes harness output** — `jumble-qa-profile-1784946392`
  and `test account` are both in it. We tried offering never-used hinted tags as
  the cold-start path the hint exists for, and it put those straight into the
  picker. We dropped that path rather than ship the noise. Worth pruning the
  published list, or documenting that consumers should expect test entries.

## 6. The tag hub rejects every non-DList kind — which splits any comment layer

We built tag comments (NIP-22 kind-1111 anchored on the tag-element address) and
publishing to `wss://dcosl.brainstorm.world` fails outright:

```
blocked: not a supported Decentralized Lists event kind
```

Correct behaviour for a purpose-built hub, and worth stating in the kit because
it constrains everyone: **any discussion layer on tags is inherently split
across two relay sets** — the tag on the hub, the conversation about it on
general relays. Ours publishes and reads comments through the app's normal
relays instead.

Consequences the kit should probably speak to:

- A client reading only `tagRelays` will never see a comment, and won't get an
  error telling it why.
- "Most discussed" as a sort on a tag directory needs a second, unrelated relay
  query — it can't ride along with the catalogue read.
- If the hub is ever meant to carry discussion, the kind allow-list is the
  thing to change; if not, the split should be documented as intended.

See `COMMENTS-PROPOSAL.md` in this folder for the anchor question (tag vs
tagging) that we'd still like settled.

## 7. Smaller notes

- **The SDK runs fine outside a bundler.** We used the vendored
  `profile-tagging.js` from plain Node to build and sign events for a cleanup
  script. Worth advertising — it makes operational tooling trivial.
- **`applyProfileTagging`'s partial-failure contract is good** and we relied on
  it: minting is two publishes and can't be atomic, and `failedAt` let us avoid
  reporting success when the assertion failed after the element landed. Please
  keep it.
- **There's no delete, and clients will get the copy wrong.** An assertion is
  only superseded by republishing the same `d` at opposite polarity. We label the
  action "Disagree", never "Remove", because the original stays on relays. A
  sentence in the kit would stop other clients promising deletion they can't do.
- `CONFIG.json`'s relay URLs have no trailing slash; ours do. We normalise on
  read. Fine, just noting the mismatch is real and bites on set-union.

---

## What we built on it

Floors B, C and D plus the C4 stance toggle: tag chips on the public profile
(anon-viewable), tag anyone with a signer, mint new tags, agree/disagree,
`/tags/:author/:slug` listing everyone carrying a tag, a `/tags` catalogue, and
tag matches in search. See `DECISIONS.md` in this folder for the choices and why.
