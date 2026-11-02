# Versioning the interpretation schema

**Status:** proposed, 2026-11-01, for Loom's D4.4, "Agree and version the schema" (decider: David).

The [interpretation](https://github.com/NosFabrica/protocols/blob/main/specs/interpretation.md) is the typed search
question: one object with `targets`, `filters`, `place`, `time`, `pov`, `residual_words` and `confidence`, several
ranked readings per query. Four things will produce it — a query parser inside the relay, the house agent, a person's
own agent, and a partner's service — and at least three will consume it: the compiler onto this estate's index
([D4.2](https://loom.brainstorm.world/t/D4.2), `../search/compile-to-vespa.md`), the portable compiler onto plain
NIP-01 and NIP-50 ([D4.3](https://loom.brainstorm.world/t/D4.3)), and the front end that renders the reading as chips
([E7](https://loom.brainstorm.world/t/E7)). The whole bet of the D4 lane is that the engine is built once against a
fixed shape while interpretation quality stays pluggable. That bet needs a rule for how the shape changes, and the
spec's § 4 says so plainly: a rule for breaking changes is owed, and until it exists a consumer's only safe behaviour
is the hard rejection in § 1.

Two facts set the price of deciding this now rather than later.

**Nothing has adopted v0 yet.** The spec's own preamble says "Adopted by: nothing yet. This is v0, written before its
first producer." So every change contemplated below costs one edit to two files today, and a coordinated release
across four producers and three consumers at any later date. This is the cheapest this decision will ever be.

**One compiler has already been written against v0, and it found eight things.** [D4.2](https://loom.brainstorm.world/t/D4.2)
was deliberately sequenced before this task so that writing a compiler could discover whether the schema was wrong
_before_ a breaking-change rule froze it. It was: five findings are in `../search/compile-to-vespa.md` § 11, three
more come from writing the schema itself ([D4.1](https://loom.brainstorm.world/t/D4.1), memos 49 and 52). Those eight
are disposed of below, which is the other half of this decision. A version rule written without them would freeze a
schema we already know to be wrong in four places.

## Options weighed

1. **A single integer, as today — `"0"`, then `"1"`, then `"2"`.** Every change is a new version and consumers reject
   anything they do not recognise. Simple, and it is what the schema's `enum: ["0"]` and § 1's hard rejection
   currently describe. Rejected: it gives additive change nowhere to go. Adding an optional display-only field would
   oblige all four producers and all three consumers to ship together, so in practice the schema would either never
   change or change without a version bump — and the second is what actually happens to wire formats governed this
   way. The common case for this schema is additive: the open questions in its own § 8 are four additions and one
   removal.
2. **Full semver, `MAJOR.MINOR.PATCH`.** Rejected: the patch component carries nothing on the wire. A schema has no
   bug fixes distinct from its meaning — a change that fixes a document's interpretation _is_ a change to the
   interpretation — so a third component would only ever be editorial, and editorial changes do not need a number a
   consumer can read.
3. **A capability list instead of a version** — the producer states which fields it emits. Rejected: it moves the
   compatibility question into every document, and a consumer still has to decide what to do with a capability it
   does not know, which is the same question one level down. It is also four producers' worth of new surface for a
   schema whose point is to be small.
4. **`MAJOR.MINOR`, with the breaking/non-breaking line drawn by consumer correctness.** Chosen.

## Decision

### 1. The version field is `MAJOR.MINOR`, as a string

`version` matches `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`. Both components are non-negative integers with no leading
zeros.

**It stays a string, and that is not cosmetic.** As a JSON number, `0.10` and `0.1` are the same value, so minor 10
would collide with minor 1 the first time the schema reaches a tenth revision. A string also keeps the field's type
stable across the change from `enum` to `pattern`.

**The amended v0 is `"0.1"`.** The bare `"0"` was never emitted by any producer, so it is retired rather than
migrated: a consumer MUST reject it, exactly as it rejects any other version it does not know. There is nothing to
deprecate, because there is nobody to deprecate it for.

### 2. What counts as breaking

The line is drawn from the **consumer's** side, because the consumer is the one who has to decide whether to reject a
document it does not fully recognise, and it must be able to decide from the version alone.

> **MAJOR** bumps when a consumer that correctly implements the previous version could return a **wrong answer** from
> a document of the new version.
>
> **MINOR** bumps when such a consumer still returns a **correct answer**, possibly a less precise one.

So the rule in one line: **a minor change may cost precision; it may never cost correctness.** That is the same
principle the spec's § 7 already applies to the two compilers — "the portable one is expected to lose precision rather
than refuse" — turned on the schema itself.

MAJOR, concretely:

| Change                                                        | Why it is breaking                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Removing or renaming a field a consumer reads                 | the constraint silently disappears                                                 |
| Narrowing a type, pattern or value set                        | documents that were valid stop being valid                                         |
| Changing what an existing field **means**                     | the worst kind: both sides keep working and disagree                               |
| Changing an absence rule (§ 2's "absent means unconstrained") | an omission starts meaning something else                                          |
| **Adding a field a consumer MUST honour to be correct**       | an old consumer ignores it and so applies less constraint than the asker asked for |

That last row is the clause worth the most, and it is the one the findings force. Per-target filters are exactly this
shape: add `filters` to a target, and a consumer that does not know the field applies **no** filter where the asker
asked for one, widening the answer. An addition is not automatically a minor change. Whether it is depends entirely on
what an old consumer does when it ignores the field — and "widens the answer" is a wrong answer, not an imprecise one.

MINOR, concretely: adding an optional field an old consumer can safely ignore (a new display-only field, under the
same rule as `place.name`); adding a value to a set whose unknown-value fallback is already safe; loosening a
constraint so that previously invalid documents become valid in a way an old consumer ignores safely; and writing
down consumer behaviour that was previously unspecified, which constrains nobody who was already correct.

**Deprecate before removing.** A field removed in a MAJOR MUST first be marked deprecated in a MINOR of the preceding
major, so there is at least one published version in which both the old and the new consumer are correct. Without
that, "reject an unknown major" means a flag day across four producers.

**A meaning the spec explicitly declines to define is not pinned by this rule.** `pov.scope.mode: "default"` is
carried without a definition on purpose — [G4.1](https://loom.brainstorm.world/t/G4.1) owns what "my people" means —
and the spec forbids a consumer assuming it means the observer's follows. When G4.1 answers, writing that answer down
is **not** a version change to this schema, because no conforming consumer could have relied on a different meaning.
The carve-out is narrow and deliberate: it applies only where the spec says in its own text that the meaning is not
settled. Pinning a meaning the spec _did_ define is the third row of the table above.

### 3. What a consumer does with a version it does not fully know

| The document says               | The consumer MUST                                                               |
| ------------------------------- | ------------------------------------------------------------------------------- |
| an unknown **major**            | **reject**, as § 1 says today. Unchanged.                                       |
| a known major, **higher** minor | **proceed** on the fields it knows, ignore the rest, and **report that it did** |
| a known major, lower minor      | proceed. It knows strictly more than the document uses.                         |
| a malformed `version`           | reject. A version that does not match the pattern is not a version.             |

The middle row is the substantive change to § 1, and it is only safe because of the obligation attached to it. A
consumer that proceeds on an unknown minor MUST say so through the same channel `compile-to-vespa.md` § 0.2 already
requires for dropped targets, post-filters and unmatched residual words. That channel exists precisely so that a
narrow answer can be told apart from a narrowed one, and an ignored field is one more way an answer can be narrower
or broader than the question. No new mechanism; one more thing to put in the existing one.

**This rule and `additionalProperties: false` contradict each other, and the schema wins.** The schema is strict, and
should stay strict — that strictness is what catches an `npub` in the observer field, a silent wrong answer dressed as
a working search. But a `"0.2"` document validated against the `"0.1"` schema fails on the unknown field, which is
precisely the case the middle row says to accept. The resolution: **a consumer validates against the schema of the
version the document declares, not against whichever schema it happens to hold.** A consumer that holds only an older
schema and wants to proceed on a higher minor does so by **reading the fields it knows**, not by validating. Said
plainly because the two rules are otherwise silently inconsistent, and an implementer would discover it as a bug.

### 4. A version freezes when it is adopted, and is amendable in place until then

> **A version is amendable in place — breaking changes included — until a producer or consumer outside this estate's
> own repositories ships against it. At that point it freezes, and every further change takes a new version under
> § 2.**

The trigger has to be observable rather than a judgement, and the spec already carries one: the **"Adopted by"** line
in its preamble, which today reads "nothing yet". Naming an adopter there freezes that version. The freeze is then a
documented fact in the file the rule governs, not a date someone has to remember.

This is what makes the dispositions below affordable. Finding 3 narrows a value set, which § 2 calls MAJOR; in a
frozen v0 it would have to wait for v1. Because v0 is unadopted it is a one-line schema edit with no migration, and
`"0.1"` can carry it. The honest version of this rule is therefore not "v0 is frozen" or "v0 is amendable", but: it is
amendable _now_, the window closes the moment the Conduit pilot or any other outside producer builds against it, and
the four amendments below should land before it does.

### 5. Who decides a bump

Three tiers, kept light, because the task's own framing is that this object changes slowly:

- **Editorial** (prose, examples, typos; no conformance change): a pull request and one reviewer.
- **MINOR**: the spec's owner plus one reviewer, and a note in the spec's changelog section saying what an old
  consumer loses in precision.
- **MAJOR**: the decider, plus a stated position from each of the four producer surfaces — query parser, house agent,
  personal agent, partner — or an explicit note naming which surface was unrepresented and why. "It changes slowly" is
  implemented by that cost, not by a waiting period.

## The eight findings, disposed

Each is an amendment to v0, a v1 item, or a wontfix with a reason. Five come from `../search/compile-to-vespa.md` § 11
(D4.2); three from writing the schema (D4.1, memos 49 and 52). Two more are added here, found while deciding.

| #   | Finding                                                           | Disposition                                              |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Per-target filters are free on the wire (§ 11.1)                  | **split**: v0 writes down the rule; v1 moves the filter  |
| 2   | § 2.6 is not compilable as written (§ 11.2)                       | **amend v0** (minor)                                     |
| 3   | A `place` with only `near_observer` is uncompilable (§ 11.3)      | **amend v0** (major, affordable now)                     |
| 4   | Negation is lost _and inverted_ (§ 11.4)                          | **split**: v0 forbids the inversion; v1 carries polarity |
| 5   | Two readings can compile identically (§ 11.5)                     | **wontfix** — index gap, not a schema fault              |
| 6   | Open question 4 belongs with the version rule (D4.1 memo 52)      | **answered** — it is finding 1                           |
| 7   | The test validator covers only today's keyword set (D4.1 memo 49) | **no change needed** — verified below                    |
| 8   | `scope.mode: "default"` is carried undefined (D4.1 memo 49)       | **no change needed** — § 2's carve-out                   |
| 9   | The schema's `$id` pins to a mutating ref (new)                   | **amend v0** (editorial, but required by § 3)            |
| 10  | § 2.6 fails in two directions, not one (new, measured)            | evidence for finding 2                                   |

### Finding 1 — per-target filters: v0 writes the rule down, v1 moves the filter

Compiling resolved the spec's **open question 4**, and the answer is not the one the question expected. A union of
`targets` compiles to one NIP-01 filter object per target — not as an optimisation but because the types constrain
different fields, so they cannot share one. Since the filters of a `REQ` are OR'd, that per-target filter object _is_
the union. **Per-target filters are therefore free on the wire**; v0's convention that producers keep mixed-type
unions unfiltered is a workaround for a limitation the compile target does not have. Mark open question 4 resolved in
principle: per-target filters are correct, and the wire supports them.

They are nonetheless **a v1 item, not a v0 amendment**, for two reasons. By § 2 above, moving or adding a filter the
consumer must honour is a MAJOR change — the one in the last row of the table — so it cannot ride along as a minor
revision even in an unadopted v0 without being the thing that defines v1. More to the point, it is a redesign of the
two central fields, and one compiler has been written. D4.3 is the second, against a deliberately weaker target, and
it will say whether the portable mapping has the same free slot. Designing `targets[].filters` against Vespa alone,
before the portable compiler exists, is how a schema acquires a field that suits one consumer.

What v0 _does_ gain is the rule D4.2 had to invent because the spec left it unspecified. § 2.2 leaves the mixed-type
case to convention, so `compile-to-vespa.md` § 3.3 had to choose between three behaviours with no guidance. v0 should
say which, in the spec, as a consumer obligation: **replicate every filter into every target; a target that cannot
carry the property returns nothing; and report every target that returned nothing while a sibling returned rows.**
Of the three candidates it is the only correct one — refusing answers nothing when other targets are answerable, and
dropping the filter for one target widens it, breaking the invariant every chip rests on, that _every result satisfies
every filter_. Writing it down constrains nobody who was already correct, so it is a MINOR change.

### Finding 2 — § 2.6 is not compilable: amend v0

§ 2.6 is a normative sentence, not an open question: a compiler matches residual words "inside the set the other
fields select — as text, or by embedding". There are no embeddings on this index, and the only text match available is
conjunctive and mandatory, so a residual word does not rank the selected set.

**Re-measured against the live relay on 2026-11-01** for this decision, rather than taken from D4.2's document.
D4.2's numbers reproduce exactly, and the failure turns out to have a second mode (finding 10):

| Search (`kind:39999`, `include:spam`)  | Found         | What came back                                                                                  |
| -------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `from:npub1f00dy… chicago`             | 5, `at_limit` | Chicago cafés and pubs — the reading, correctly served                                          |
| `from:npub1f00dy… best chicago`        | **0**         | nothing                                                                                         |
| `chicago` (no curator constraint)      | 5, `at_limit` | Chicago events and calendars                                                                    |
| `best chicago` (no curator constraint) | 5             | _The beast of Chicago_, a graphic novel; "West Town **Best** Town", a chamber-of-commerce panel |

So the mandatory residual word does not merely empty a narrow answer. On a wider set it **substitutes a worse one**,
and because the relay's positive terms are typo- and prefix-tolerant (`compile-to-vespa.md` § 3.2), `beast` matches
`best` and the substitution looks like a match. Both modes are the same mechanism, and together they close the escape
route of hoping the selected set is large enough to contain the word: it either empties or it misdirects.

**Amend § 2.6** to say what a conforming consumer actually does: residual words are matched inside the selected set
only by a consumer that can match them optionally — scoring, not requiring. A consumer that cannot MUST NOT put them
on the wire as terms, and MUST carry them back as unmatched. That is `compile-to-vespa.md` § 7.2's rule, lifted into
the spec where it belongs, and it loosens a MUST that no conforming consumer can currently satisfy, so it is MINOR.
The spec's intent is right and the index is what is behind — [G6](../search/compile-to-vespa.md) (an optional,
scoring-only term, or embeddings) makes § 2.6 compilable as originally written, at which point the amended sentence
already permits it.

### Finding 3 — `near_observer` alone: amend v0, and it is the worked example of § 4

The schema's `anyOf` admits `{"near_observer": true}` with no `geohash`, and no compiler can serve it: the asker's own
location is not in the interpretation and nothing in the wire format will supply it. `test/interpretation.test.js`
asserts this case is **accepted** — so the uncompilable state is not merely permitted, it is pinned by a passing test.

**Amend v0:** `place` requires `geohash`, and `near_observer` becomes purely the display flag the prose in § 2.3
already implies ("`near_observer` is `true` when the asker said 'near me' **and the centre is the asker's own
location**" — the centre is already assumed to be there). A producer that means "near me" resolves the centre itself;
the flag tells the front end to say "near you". The alternative — the spec declaring that the asker's location travels
out of band — is worse, because it puts a constraint outside the object whose entire purpose is to carry the whole
question.

By § 2 this is a **MAJOR** change: it narrows a value set, and a document that was valid stops being valid. It is
affordable only because v0 is unadopted, and it is the clearest illustration of why § 4's freeze trigger matters. Left
until after the Conduit pilot ships, this same one-line edit becomes a coordinated release. The test flips from
`accepted` to `rejected` with it.

### Finding 4 — negation: v0 forbids the inversion, v1 carries polarity

The search box accepts `-word` and the relay honours it as an exclusion. v0 has nowhere to carry polarity, so a
`-chain` the asker typed arrives as the bare word `chain` in `residual_words`, where finding 2's rule drops it. No
consumer can tell that `chain` from `best`. The sense is not merely lost, it is **inverted**: the compiler widens
where the asker narrowed, and nothing in the document says so.

Carrying polarity — structure in `residual_words`, or negation in `filters` — is a **v1 item**. Both are shape
changes, and negation in `filters` should be designed together with the operators of open question 2 rather than
piecemeal.

But v0 can stop the inversion for free, and should. **Amend § 2.6:** `residual_words` carry no polarity, so a producer
that read a negation MUST NOT represent it as a residual word. It drops the term and lowers `confidence` instead.
That converts a silent inversion into a visible omission — the one thing a downstream consumer can actually act on —
and it is MINOR, since it constrains producers in a case where no correct behaviour existed.

### Finding 5 — two readings compiling identically: wontfix

The spec's two § 6.1 readings differ only in `filters[0].property` — a curated `cuisine` value against a free `t` tag
— and this index has no property-scoped match, so the value matches as a word over everything the item indexes, its
name included. The two readings are the same query, offered at confidence 0.78 and 0.41.

**Wontfix at the schema level, with the reason stated:** the schema is right and the index is behind it. `property` is
already carried; what is missing is [G2](../search/compile-to-vespa.md), a property-scoped match, the highest-value
index gap for M2. No version of this schema fixes it.

It does carry a warning for the D4 lane's own premise, which belongs on the record rather than in the schema: an index
that cannot tell two readings apart cannot score two interpreters apart either. Any plan to measure one producer
against another — which § 2.7 says requires scored outcomes, since confidences are not comparable across producers —
waits on G2.

### Findings 6, 7 and 8 — answered, verified, carved out

**6.** D4.1's memo 52 said open question 4's decision "probably belongs with D4.4's versioning rule rather than in
this spec". It did, and finding 1 is the answer. Recorded so it is not counted twice.

**7.** Memo 49 noted that `test/interpretation.test.js` carries a hand-rolled validator covering only the JSON Schema
keywords the schema uses, and that a schema growing past that keyword set needs a real validator instead. This
decision changes `version` from `enum` to `pattern`. **Verified** by reading the validator: `pattern` is already in
its `KNOWN` set, and is already used for `pov.observer` and `place.geohash`. No validator work, and no new dependency
in a repo that has none. The standing note still stands for a future change that reaches for a new keyword.

**8.** `pov.scope.mode` carries `default` without a definition because G4.1 owns it. § 2's carve-out above settles
what happens when G4.1 answers: writing the definition down is not a version change, because the spec forbids a
consumer relying on any particular meaning. No schema change.

### Finding 9 — the schema's `$id` pins to a mutating ref

Found while writing § 3. The schema's `$id` is
`https://raw.githubusercontent.com/NosFabrica/protocols/main/specs/interpretation.schema.json` — a path on `main`,
which moves. A versioned artifact whose canonical identifier resolves to "whatever that branch holds today" cannot
support § 3's rule that a consumer validates against the schema of the version the document declares: the URL that
served `"0.1"` yesterday serves `"0.2"` tomorrow, silently.

**Amend v0:** the `$id` names the version, and each version keeps an immutable URL — a path containing the version, a
tag, or both. Editorial in that it changes no field, required in that § 3 does not work without it.

## What this changes, and where

**In this repository: nothing.** This ADR is a decision record. `../search/compile-to-vespa.md` § 11 already records
the five findings and states that v0 is unchanged; it stays accurate, since the amendments land in `protocols`.

**In `NosFabrica/protocols`: a second pull request, not part of this one.** The schema, the spec prose and the tests
live there, and amending them is a separate change in a separate repository. Filed as a subtask of D4.4 rather than
widening this task. It carries:

1. `version` → `^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`, value `"0.1"`; `"0"` retired (§ 1).
2. A new spec section stating §§ 2–5 of this decision — the breaking-change rule, the unknown-minor behaviour, the
   freeze trigger and the bump tiers — replacing § 4's "a rule for breaking changes is owed".
3. § 2.6 amended twice: optional-only matching with carry-back (finding 2), and no polarity in residual words
   (finding 4).
4. `place` requires `geohash`; `near_observer` is a display flag (finding 3). The schema's `anyOf` goes.
5. The mixed-type union rule written into § 2.2 as a consumer obligation (finding 1).
6. `$id` carries the version (finding 9).
7. Open question 4 marked resolved in principle; open questions 2, 3 and 5 restated as v1 items.
8. Tests: `'near me with no geohash'` moves from `accepted` to `rejected`; the version cases are rewritten against the
   pattern (`"0"` rejected, `"0.1"` accepted, `"0.2"` and `"1.0"` rejected _by the schema_ while § 3 governs what a
   consumer does with them — a distinction the tests should make explicit, since the schema defines one version and
   the rule governs the set).

**For D4.3**, which is deliberately still open: it should be built against `"0.1"`, after the amendments land. That
sequencing was the reason D4.4 came first.

## Consequences

**What this buys.** An additive change to the schema stops being a flag day across four producers: a new optional
field ships as a minor, old consumers keep working, and the thing they could not read is reported to the asker rather
than silently dropped. The four amendments land while they cost one pull request. And the question that was actually
blocking — whether per-target filters go in v0 — is answered with a reason rather than deferred again.

**What it costs.** "Reject an unknown major" is still a flag day, by design; the deprecation rule is what keeps it
from being a surprise. Consumers now carry a version comparison and a report they did not carry before, and the
unknown-minor path is the one that will be least exercised and most likely wrong — it is worth a test in the first
consumer that implements it, not just in the schema.

**What is still open.** Open question 1 (whether the spec should require a stated calibration method for confidence)
is untouched here; it is a measurement question, and finding 5 says the measurement waits on G2 regardless. Open
questions 2, 3 and 5 are v1 items. And the window in § 4 is real: the amendments above are cheap today and a
coordinated release once the Conduit pilot builds against this object, which makes the second pull request the
sequencing risk in the D4 lane rather than a tidy-up.
