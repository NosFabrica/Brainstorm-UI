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

**The reference client already does this too — we just didn't know.** Jumble's
own published guide (`jumble-tags.vercel.app`, "How decentralized tags work")
prints its baked-in defaults verbatim:

```
mode=house-ta  minRank=1  maxHops=999  unknown=trusted
```

So both independent integrations of this kit ship `maxHops: 999` against a
`CONFIG.json` that says `20`. That makes this a defect in the shipped config
rather than a Brainstorm workaround, and it means every integrator has to
rediscover it — ours cost a day of an empty chip row before we found it.

Our override neutralises the hops criterion so `rank` does the gating.
Suggested fixes for the kit, in preference order:

1. Treat a **missing** `hops` as unknown rather than as 999. Absence of a
   dimension isn't a failing score on that dimension.
2. Failing that, ship `maxHops: 999` in `CONFIG.json` until the pipeline
   publishes hops, and say why in the `_comment` — this is what both shipping
   clients already run, so the config is simply out of date with reality.
3. At minimum, document it loudly — an integrator has no way to guess that the
   trust source silently inverts.

Worth noting the second-order effect: with hops neutralised and
`unknownPolicy: "trusted"`, trust is currently close to a no-op. Any client
shipping this today is effectively unfiltered, whatever the config implies.

## 2. Most of the hub's assertions are QA output — and `#a` is NOT the filter

Not a bug, but integrators should be told. **This section previously said the
opposite and was wrong; the correction is the useful part.**

Of **2930** profile-tag assertions on `wss://dcosl.brainstorm.world`, only
**25** carry an `a` tag. The other ~2900 reference their tag by `e` alone, and
a large share are harness output
(`profile-tag-wysiwyg-s17-1785898945945-kv0oo3-…`).

Our first read consumed `#a` only, and we wrote here that doing so was
conveniently *also* the noise filter — advice we asked you to put in the docs.
That was wrong twice over. `tags.md` §"Deployed variant" is explicit that until
the `a`-backfill lands, "a reader needing completeness MUST union `#a` lookups
with legacy `#e` lookups against the tag-element's event ids". And when we
implemented that union, it turned out the `e`-only set contains **real tagging
on real profiles at scale** — we had been hiding roughly 99% of the corpus,
including most of what now populates our catalogue. Please don't document the
`#a`-only shortcut; document the union, prominently, because the failure is
silent and looks like "the hub is empty".

**The real noise filter is the tag CREATOR's trust score**, which is what your
own client does — Jumble's guide states that browse surfaces "only list tags
whose creator has a published trust score", with direct links, existing
taggings and the viewer's own tags all still working. It's the only thing we
found that separates harness tags from real ones without a name-shape
blocklist, and every integrator otherwise invents something worse. We did — we
gated on the *tagged* person having a kind-0, which is the wrong axis entirely,
since the spam economics are about minting being free.

**But please document it as a rule about SURFACES, not about tags** — we shipped
the blunt version first and it cost us the second most-used tag on your hub.

*Usage cannot be the filter, and we'd suggest saying so explicitly, because it's
the first thing everyone reaches for.* Measured 2026-08-07 across all 875 tags
with at least one carrier: your harness fakes asserters as well as targets — 35
junk tags carry **5 distinct asserters each** — while genuinely-used tags like
`tunestr-community` (28 people) and `urbit` (7) carry **one**. There is no
threshold that admits the real ones and excludes the fakes.

*What the blunt rule costs.* Of those 875, 34 were listed and 841 were not.
Excluding the harness output, that set is essentially one tag: **`lfo`, 54
people, the second most-used on the hub** behind `aos-2026-participant`. Its
creator has no kind-30382, so it was absent from browse, from every search box,
and from the tag picker — where typing "LFO" then offered *"Create tag"* for a
tag 54 people already carry. `resolveOrMintTag` reuses the existing element, so
nothing was corrupted, but the user is told something false. We'd note that
`ACCEPTANCE` line 33 ("existing protocol tags load and search-by-name filters
them") passes on a strict reading while failing in spirit under this rule.

*What we ship now.* Nothing is dropped; tags carry an `unverified` flag.
Surfaces that render an **unrequested list** filter them out. Surfaces that
answer a **typed query** — search, and the picker once you type — include them,
labelled. Junk can flood a page nobody asked for; it cannot flood a name
somebody typed. That also lands closer to `Start.md` Q5's own recommended
default ("full client-side search over all existing protocol tags") than the
list-wide gate did.

*And the reason any of this bites right now is upstream.* Only **3 of 138** tag
creators have a published score, because `trustRelays` still carries the
2026-05-26 snapshot under the retired key while the current TA has published
zero 30382s — the caveat your own `CONFIG` `_comment` records. Until that
pipeline re-runs, "creator has a score" is a much narrower test than it reads
as, and any client adopting the rule verbatim will hide real tags. Worth a
sentence in the kit next to the rule.

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

---

## Added 2026-08-06, after running both acceptance scripts

### 8. Floor A contradicts Q2's own migrate option

`ACCEPTANCE.md` Floor A asserts the host's existing role chips "still render
exactly as before — coexistence, no regression". But `Start.md` Q2 offers
**migrate** — "a one-time, owner-prompted conversion" — as a sanctioned answer,
and an integrator who takes it cannot satisfy that line.

Floor A reads as the check for Q2's *default*. Suggest it say so explicitly
("if you chose coexist"), and add the migrate equivalent: the conversion is
owner-prompted, one-time, and publishes nothing without an explicit action.

We took migrate, on our team's instruction that the role chips were the
placeholder tags were meant to replace.

### 9. `core/ACCEPTANCE.md` Hygiene asks for something no doc tells you to build

"The tag-relay list is editable where INTEGRATION.md §3 put it (Settings if the
host has one) and persists" is the only checkbox that requires UI the walkthrough
never mentions. `CONFIG.json`'s `_tagRelays` comment says the same thing, and
both are easy to read as advisory.

Worth promoting to the build steps — it's a genuine feature (it's how we
exercised C7's "tag relays unreachable" box without touching code), and it's
the first box a reviewer will find missing.

### 10. Please state whether the subject's own assertion counts

`INTEGRATION.md` C6 says "count per `p` target (trust-filtered, net
apply−dispute > 0)" and never mentions self-assertions. We initially excluded
them — a self-declaration isn't corroboration — and that put us one behind the
reference instance on every self-tagged person, which C1's "net counts matching"
check is exactly designed to catch.

We now count them, and label them separately in the UI. But the docs don't say
which is intended, and it's a silent one-off divergence for anyone who reads it
the way we first did. One sentence in C6 would settle it.

Related: if self-assertions count, clients should be told not to render the
subject in their own "vouched by" list. "Added by <the person themselves>"
claims corroboration that doesn't exist.

### 11. The cache expectation in C1 deserves a pointer

C1 asks that "repeat reads hit the cache, not the relay". Nothing in the SDK
caches tag-elements — `filterTagElements` and friends are pure — so this is
entirely the integrator's to build, and it isn't mentioned in the walkthrough.
Ours re-fetched the same element once per profile until we read this box.

A line in §3 saying the host owns element caching, keyed by a-coordinate and by
element id, would make it obvious.

### 12. Event-tagging assertions carry no relay hints, so tagged notes go missing

`buildEventTaggingAssertion` supports a NIP-01 relay hint on the `e` tag, and
its own comment explains exactly why it matters: it "lets read paths fetch an
EXTERNAL target note on-demand from where it actually lives, instead of
persisting other people's notes into the local relay".

Nothing on the hub uses it. We checked all 15 `lfo-community` taggings on
2026-08-05: **0 of 15 carry a hint**. The hub holds assertions about notes and
never the notes themselves, so a reader whose relay set doesn't happen to
include the note's home has no way to resolve it — and no way to tell that apart
from the note having been deleted.

We hit this immediately: our tag page rendered 14 of 15 tagged notes on first
load, with no signal that one was missing. We now report the tagged count rather
than the fetched count, and say how many we couldn't reach.

Suggestions, in preference order:

1. Have the reference publisher emit the hint — the SDK already accepts it, so
   this is a caller change, not a protocol one. Ours does.
2. Failing that, say in the docs that consumers must expect unresolvable targets
   and should report them rather than silently shortening the list.

### 13. `event-taggings` has no "is this tag note-taggable yet" answer for pickers

`filterTaggingHeadersForTag` tells you whether a tag has a tagging header, which
is the same question as "can this tag be applied to a note without minting an
extra event". But there's no batched form — it's one filter per (tag, TA), so a
picker offering 39 tags would need 78 queries to know which are one publish and
which are two.

We don't ask: the picker offers every tag and lets the SDK mint the header when
needed, which is correct but means some picks quietly cost an extra signature.
A `#a`-batched variant (all headers for a LIST of tag coordinates) would let a
client show that difference, or at least warn before a three-signature flow.

### 14. Pinning is specified, forbidden, and half-shipped — please pick one

`core/protocol/tags.md` §Pins fully specifies a personal curated set: the
kind-39999 pin event, its dual `e`+`a` reference, the `curation-method` payload,
and NIP-09 unpinning. `core/INTEGRATION.md` §8 then lists "Tag pinning /
Trusted-List publication from the client" under **do not build**. The SDK splits
the same way: `taggings.js` ships `projectionFor` and `curateNotes` — the read
and snapshot halves — and no pin builder at all.

That's an awkward place for an integrator to stand. "How do I manage my tags?"
is the first question a user asks after their second tag, and the protocol has
the answer while the kit says not to implement it.

We built it (Benjamin's call, 2026-08-06) behind `TAG_PINS_ENABLED`, defaulting
**off**, so an acceptance run still sees only what the kit describes. Two asks:

1. **Can pinning move into scope for Brainstorm?** §8 says a per-target kit may
   pull items back in explicitly; ours doesn't. If the answer is yes, shipping a
   `buildTagPin` beside the other builders would stop every client inventing the
   shape independently.
2. **Confirm the `tag-pinning` concept handle.** `handles.js` composes `tag`,
   `nostr-event-tag` and `tagging-with-specific-tag`; there is no `tag-pinning`
   composer. We compose `39998:<ta>:tag-pinning` by analogy with the documented
   family — but worksheet **W1 (cross-deployment concept identity)** is open on
   exactly this, so it's a guess we'd rather not be making in a signed event.

### 15. The spec's unpin mechanism can't run against the relay that stores pins

Same shape as §6, and found the same way — by reading the hub's own NIP-11
document before publishing anything:

> "This is a strfry instance. It stores kinds **9998, 9999, 39998, 39999** events
> in support of the NostrHub.io Custom NIP: Decentralized Lists. Also supports
> **kind 7** for the WoT aspects of DL."

Kind **5 is not on that list**. But `tags.md` §Unpinning says:

> "Unpinning is a standard NIP-09 kind-`5` deletion of the pin event. Reader
> semantics are existence-based: a live pin event means pinned; its absence (or
> deletion) means not pinned."

So a pin published to the hub — where §Pins says it belongs — can never be
unpinned there. Existence-based reader semantics make that worse than a missing
feature: a client reading the hub alone sees the pin forever, with no signal
that the user removed it.

**Confirmed on the wire, not just inferred from the allow-list.** We published a
real pin and then unpinned it with a throwaway key on 2026-08-06:

| event | hub | general relays |
|---|---|---|
| the pin (kind 39999) | **accepted**, still there | — |
| the unpin (kind 5) | **0 — rejected** | accepted, correctly referencing the pin id |

So the pin is now permanently on `dcosl.brainstorm.world` with no way to remove
it there, while the deletion that says otherwise lives somewhere else entirely.

Our workaround: publish the kind-5 to the app's general relays and union
deletions from both relay sets on read. That works for us and for anyone reading
the same way, and is wrong for everyone else — a client reading the hub alone
sees a pin its owner deleted, with nothing to indicate it.

Options, in preference order:

1. Add kind 5 to the hub's allow-list, scoped to deleting the author's own
   DList events. Unpinning then works where the spec says it should.
2. Failing that, specify unpinning as something the hub *can* store — a
   replaceable pin carrying an explicit `["status","unpinned"]`, say — rather
   than a deletion the storage layer rejects.
3. At minimum, document the split so nobody ships an unpin button that silently
   does nothing.
