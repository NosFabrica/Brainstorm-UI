/**
 * A Treasure Map read by category — the cases Tapestry's own suites pin for the
 * card rule (test/manage-treasure-map-cards.test.js, treasure-map-card-rule-edges,
 * treasure-map-star-scopes-ignored, treasure-map-card-details), with their
 * fixtures, expected values and IDs, so the two apps count one Map the same way.
 *
 * Not ported:
 * - manage-treasure-map-cards C1–C5: categoryCards (titles, names, avatars, the local mark) — not in this module.
 * - manage-treasure-map-cards W1–W3, treasure-map-card-details W1: Tapestry's COPY words.
 * - manage-treasure-map-cards S1–S3, treasure-map-card-details S1–S5: source sentinels on Tapestry's page.
 * - treasure-map-star-scopes-ignored P1–P3: checks on the protocol draft's § 13.
 */
import { describe, expect, it } from "vitest";
import { CATEGORIES, categoryAssistants, categoryEntries, type CategoryEntry } from "./treasureMapCards";

// Fixture keys, never live ones.
const A = "c1".repeat(32);
const B = "c2".repeat(32);
const C = "c3".repeat(32);
const D = "d1".repeat(32);
const E = "e1".repeat(32);
const L = "a2".repeat(32);
const R = "wss://relay.example";
const R1 = "wss://one.example";
const R2 = "wss://two.example";
const LETTER: Record<string, string> = { [A]: "A", [B]: "B", [C]: "C", [D]: "D", [E]: "E", [L]: "L" };

// Stand-ins for a category (a DList's naddr, say) and a Tag; any segment without a colon will do.
const X = "naddr1x";
const Y = "naddr1y";
const T = "naddr1t";

const NONE = { scores: [], lists: [], concepts: [] };

/** A kind 10040 holding these tags. */
const mapWith = (tags: unknown[]) => ({
  id: "9".repeat(64),
  pubkey: "a1".repeat(32),
  kind: 10040,
  created_at: 1,
  content: "",
  sig: "f".repeat(128),
  tags,
});
/** A kind 10040 from [key, delegate] rows, every relay R. */
const mapOf = (entries: string[][]) => mapWith(entries.map(([k, pk]) => [k, pk, R]));
/** The card rule over [key, delegate] rows, in Map order. */
const cards = (entries: string[][]) => categoryAssistants(mapOf(entries));

/** Garbage the TS signature rules out, passed as Tapestry passes it. */
const looseAssistants = categoryAssistants as (event: unknown) => ReturnType<typeof categoryAssistants>;
const looseEntries = categoryEntries as (event: unknown) => ReturnType<typeof categoryEntries>;

describe("manage-treasure-map-cards", () => {
  // The story's AC-2 example table, row by row.
  it("K1: `30382:rank` → A — Scores: A", () => {
    expect(cards([["30382:rank", A]])).toEqual({ scores: [A], lists: [], concepts: [] });
  });
  it("K2: rank → A and all Scores (`3038x`) → B — Scores: A and B (the owner’s “it is mixed”)", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["3038x", B],
      ]),
    ).toMatchObject({ scores: [A, B] });
  });
  it("K3: rank → A and everything (`*`) → C — Scores: A and C", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["*", C],
      ]),
    ).toMatchObject({ scores: [A, C] });
  });
  it("K4: rank → A, `3038x` → B, `*` → C — Scores: A and B; `*` reaches no Score", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["3038x", B],
        ["*", C],
      ]),
    ).toMatchObject({ scores: [A, B] });
  });
  it("K5: `3038x:tag` → B and `*` → C — Scores: B and C; `*` still covers Scores that aren’t tag-based", () => {
    expect(
      cards([
        ["3038x:tag", B],
        ["*", C],
      ]),
    ).toMatchObject({ scores: [B, C] });
  });
  it("K6: rank → A, then rank → B — Scores: A (B is an alternate)", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["30382:rank", B],
      ]),
    ).toMatchObject({ scores: [A] });
  });
  it("K7: rank → A, followers → A, `3038x` → A — Scores: A, once", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["30382:followers", A],
        ["3038x", A],
      ]),
    ).toMatchObject({ scores: [A] });
  });
  it("K8: `*` → C — C on all three cards", () => {
    expect(cards([["*", C]])).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });
  it("K9 (treasure-map-edit #2): `*:tag` → D and nothing else is ignored — nothing on any card", () => {
    expect(cards([["*:tag", D]])).toEqual(NONE);
  });
  it("K10: Concepts — `39998:dog-breed` → A, `39998:dlist-header` → B, `*` → C: A and B", () => {
    expect(
      cards([
        ["39998:dog-breed", A],
        ["39998:dlist-header", B],
        ["*", C],
      ]),
    ).toEqual({ concepts: [A, B], scores: [C], lists: [C] });
  });
  it("K11: nothing that applies — all three empty", () => {
    expect(cards([["99999", A]])).toEqual(NONE);
  });

  // The edges the ADR names.
  it("K12: only valid 64-hex delegates count; uppercase ones count lowercased; a key’s first VALID delegate is its Assistant", () => {
    expect(
      cards([
        ["30382:rank", "not-a-key"],
        ["30382:rank", "c".repeat(63)],
        ["30382:rank", A.toUpperCase()],
        ["30392"],
        ["30392", B],
      ]),
    ).toMatchObject({ scores: [A], lists: [B] });
  });
  it("K13: entries of other kinds count for no category — 99999, bare 30000, 30379, 30400, 3040x, **, empty and non-string keys", () => {
    const ev = mapOf([
      ["99999", A],
      ["30000", A],
      ["30379", A],
      ["30400", A],
      ["3040x", A],
      ["**", A],
      ["", A],
      ["*x", A],
    ]);
    ev.tags.push([42, A, R], [null, A, R], [["30382"], A, R]);
    expect(categoryAssistants(ev)).toEqual(NONE);
  });
  it("K14: the kind ranges — 30380 and 30389 are Scores, 30390 and 30399 Lists, 39998 and 39999 Concepts", () => {
    expect(
      cards([
        ["30380", A],
        ["30389:x", B],
        ["30390", C],
        ["30399:y", D],
        ["39998", A],
        ["39999:z", E],
      ]),
    ).toEqual({ scores: [A, B], lists: [C, D], concepts: [A, E] });
  });
  it("K15: bare `39998` counts for Concepts and covers them completely, so `*` doesn’t reach Concepts (but still Scores and Lists)", () => {
    expect(
      cards([
        ["39998", A],
        ["*", C],
      ]),
    ).toEqual({ concepts: [A], scores: [C], lists: [C] });
  });
  it("K16 (treasure-map-edit #2): `*:tag` is ignored beside `3038x:tag`, `3038x`, `3038x:dlist` or `3039x:tag` — only the family entry counts", () => {
    expect(
      cards([
        ["3038x:tag", B],
        ["*:tag", D],
      ]),
    ).toMatchObject({ scores: [B], lists: [] });
    expect(
      cards([
        ["3038x", B],
        ["*:tag", D],
      ]),
    ).toMatchObject({ scores: [B], lists: [] });
    expect(
      cards([
        ["3038x:dlist", B],
        ["*:tag", D],
      ]),
    ).toMatchObject({ scores: [B], lists: [] });
    expect(
      cards([
        ["3039x:tag", B],
        ["*:tag", D],
      ]),
    ).toMatchObject({ lists: [B], scores: [] });
  });
  it("K17: Lists — own, family-wide and everything together: `30396:tag:x` → A, `3039x` → B, `*` → C gives A and B", () => {
    expect(
      cards([
        ["30396:tag:x", A],
        ["3039x", B],
        ["*", C],
      ]),
    ).toEqual({ lists: [A, B], scores: [C], concepts: [C] });
  });
  it("K18: Assistants come in the order the Map first names them, without repeats", () => {
    expect(
      cards([
        ["3038x", B],
        ["30382:rank", A],
        ["30382:followers", B],
        ["30383", C],
      ]),
    ).toMatchObject({ scores: [B, A, C] });
  });
  it("K19: a covering entry that has no valid delegate covers nothing — `3038x` with a bad key doesn’t stop `*`", () => {
    expect(
      cards([
        ["3038x", "nope"],
        ["*", C],
      ]),
    ).toMatchObject({ scores: [C] });
  });
  it("K20: no event, no tags, or garbage — three empty lists, never a throw", () => {
    for (const ev of [null, undefined, {}, { tags: "x" }, { tags: [null, "x", 7, []] }, "garbage"]) {
      expect(looseAssistants(ev), JSON.stringify(ev)).toEqual(NONE);
    }
  });
});

describe("treasure-map-card-rule-edges", () => {
  // H — a broad entry counts only where nothing more specific covers it; a `*:…` entry counts nowhere.
  it("H1 (story 3): `3038x:tag` → B and `*:tag:<X>` → D, which is ignored — Scores: B", () => {
    expect(
      cards([
        ["3038x:tag", B],
        [`*:tag:${X}`, D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("H2 (story 3): `3038x:tag:` (an empty last segment) → B and `*:tag:<X>` → D, which is ignored — Scores: B", () => {
    expect(
      cards([
        ["3038x:tag:", B],
        [`*:tag:${X}`, D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("H3 (story 3): `3038x:tag::<T>` → B and `*:tag:<X>:<T>` → D, which is ignored — Scores: B", () => {
    expect(
      cards([
        [`3038x:tag::${T}`, B],
        [`*:tag:${X}:${T}`, D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("H4 (story 3): Lists — `3039x:dlist` → B and `*:dlist:<X>` → D, which is ignored — Lists: B", () => {
    expect(
      cards([
        ["3039x:dlist", B],
        [`*:dlist:${X}`, D],
      ]),
    ).toMatchObject({ lists: [B] });
  });
  it("H5 (story 3): `3038x:tag` → B and `*:tag` → D, which is ignored — Scores: B", () => {
    expect(
      cards([
        ["3038x:tag", B],
        ["*:tag", D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("H6 (story 2): `3038x:tag:<X>` → B and `*:tag` → D, which is ignored — Scores: B", () => {
    expect(
      cards([
        [`3038x:tag:${X}`, B],
        ["*:tag", D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("H7 (story 2): `3038x:tag:<X>` → B and `*:tag:<Y>` → D, which is ignored — Scores: B", () => {
    expect(
      cards([
        [`3038x:tag:${X}`, B],
        [`*:tag:${Y}`, D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("H8 (story 2): `30382:rank` → A and `*:rank` → D, which is ignored — Scores: A", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["*:rank", D],
      ]),
    ).toMatchObject({ scores: [A] });
  });

  // F — a `*:` entry with a system word or a metric reaches no category.
  it("F1 (story 2): `*:rank` → D is ignored — Not assigned yet on all three cards", () => {
    expect(cards([["*:rank", D]])).toEqual(NONE);
  });
  it("F2 (story 2): `*:contexts` → D is ignored — Not assigned yet on all three cards", () => {
    expect(cards([["*:contexts", D]])).toEqual(NONE);
  });
  it("F3 (story 2): `*:pin` → D is ignored — Not assigned yet on all three cards", () => {
    expect(cards([["*:pin", D]])).toEqual(NONE);
  });
  it("F4 (story 2): `30392` → A and `*:rank` → D, which is ignored — Scores: Not assigned yet; Lists: A", () => {
    expect(
      cards([
        ["30392", A],
        ["*:rank", D],
      ]),
    ).toEqual({ scores: [], lists: [A], concepts: [] });
  });
  it("F5 (story 2): `3038x` → B and `*:contexts` → D, which is ignored — Scores: B; Lists: Not assigned yet", () => {
    expect(
      cards([
        ["3038x", B],
        ["*:contexts", D],
      ]),
    ).toEqual({ scores: [B], lists: [], concepts: [] });
  });

  // N — two spellings of one key count as one key.
  it("N1: Concepts — `39998` → A, then `39998:dlist-header` → B are one key — Concepts: A (B is a backup)", () => {
    expect(
      cards([
        ["39998", A],
        ["39998:dlist-header", B],
      ]),
    ).toMatchObject({ concepts: [A] });
  });
  it("N2: Concepts — `39998:dlist-header` → B, then `39998` → A — Concepts: B (the first listed wins)", () => {
    expect(
      cards([
        ["39998:dlist-header", B],
        ["39998", A],
      ]),
    ).toMatchObject({ concepts: [B] });
  });
  it("N3: `*` → C, then `*:` → D are one key — C on all three cards", () => {
    expect(
      cards([
        ["*", C],
        ["*:", D],
      ]),
    ).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });
  it("N4: `3038x:tag` → B, then `3038x:tag:` → D are one key — Scores: B", () => {
    expect(
      cards([
        ["3038x:tag", B],
        ["3038x:tag:", D],
      ]),
    ).toMatchObject({ scores: [B] });
  });
  it("N5: a Concept keeps its d tag as written — `39998:dog-breed` → A and `39998:dog-breed:` → B are two Concepts (as today)", () => {
    expect(
      cards([
        ["39998:dog-breed", A],
        ["39998:dog-breed:", B],
      ]),
    ).toMatchObject({ concepts: [A, B] });
  });

  // X — the cases ADR 0001 adds, and the story's § Out of scope kept as today.
  it("X1: `3038x:` is `3038x`, so it covers `*` → C for Scores — Scores: B; Lists and Concepts: C", () => {
    expect(
      cards([
        ["3038x:", B],
        ["*", C],
      ]),
    ).toEqual({ scores: [B], lists: [C], concepts: [C] });
  });
  it("X2: `*::` is `*`, so it reaches all three cards — C on Scores, Lists and Concepts", () => {
    expect(cards([["*::", C]])).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });
  it("X3 (story 2): `*:tag:` is `*:tag`, which is ignored — Scores: B (from `3038x:tag`); Lists: Not assigned yet", () => {
    expect(
      cards([
        ["3038x:tag", B],
        ["*:tag:", D],
      ]),
    ).toMatchObject({ scores: [B], lists: [] });
  });
  it("X4: an exact kind folds too — `30382:rank` → A, then `30382:rank:` → B are one key — Scores: A", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["30382:rank:", B],
      ]),
    ).toMatchObject({ scores: [A] });
  });
  it("X5: `30396:tag` → A, then `30396:tag::` → B are one key — Lists: A", () => {
    expect(
      cards([
        ["30396:tag", A],
        ["30396:tag::", B],
      ]),
    ).toMatchObject({ lists: [A] });
  });
  it("X6 (story 2): `*:Tag` → D is ignored like any `*:…` entry — Not assigned yet on all three cards", () => {
    expect(cards([["*:Tag", D]])).toEqual(NONE);
  });
  it("X7 (story 2): a family entry with no valid delegate hides nothing — `3038x:` → (not a key) and `*` → D — Scores: D", () => {
    expect(
      cards([
        ["3038x:", "not-a-key"],
        ["*", D],
      ]),
    ).toMatchObject({ scores: [D] });
  });
  it("X8: only kind 39998’s `dlist-header` folds — `39999` → A and `39999:dlist-header` → B are two keys — Concepts: A and B", () => {
    expect(
      cards([
        ["39999", A],
        ["39999:dlist-header", B],
      ]),
    ).toMatchObject({ concepts: [A, B] });
  });
  it("X9: a Concept d tag with colons stays whole — `39998:a:b` → A and `39998:a` → B are two keys — Concepts: A and B", () => {
    expect(
      cards([
        ["39998:a:b", A],
        ["39998:a", B],
      ]),
    ).toMatchObject({ concepts: [A, B] });
  });
  it("X10 (story 2): `*::rank` (an empty slot, then more) → D is ignored — Not assigned yet on all three cards", () => {
    expect(cards([["*::rank", D]])).toEqual(NONE);
  });
  it("X11: out of scope, as today — `3039x:rank` (a metric on a List family) → D reaches Lists", () => {
    expect(cards([["3039x:rank", D]])).toEqual({ scores: [], lists: [D], concepts: [] });
  });
});

describe("treasure-map-star-scopes-ignored", () => {
  // I — an everything entry that names anything after the `*` counts on no card.
  it("I1: `*:tag` → D — Not assigned yet on all three cards", () => {
    expect(cards([["*:tag", D]])).toEqual(NONE);
  });
  it("I2: `*:rank` → D — Not assigned yet on all three cards", () => {
    expect(cards([["*:rank", D]])).toEqual(NONE);
  });
  it("I3: `*:contexts` → D — Not assigned yet on all three cards", () => {
    expect(cards([["*:contexts", D]])).toEqual(NONE);
  });
  it("I4: `*:tag:<X>:<T>:confidence` → D (the review’s finding 1) — Not assigned yet on all three cards", () => {
    expect(cards([[`*:tag:${X}:${T}:confidence`, D]])).toEqual(NONE);
  });
  it("I5: `*::rank` → D (an empty slot, then more) — Not assigned yet on all three cards", () => {
    expect(cards([["*::rank", D]])).toEqual(NONE);
  });
  it("I6: `30382:rank` → A and `*:rank` → D — Scores: A; Lists and Concepts: Not assigned yet", () => {
    expect(
      cards([
        ["30382:rank", A],
        ["*:rank", D],
      ]),
    ).toEqual({ scores: [A], lists: [], concepts: [] });
  });
  it("I7: `30392` → A and `*:tag` → D — Scores: Not assigned yet; Lists: A; Concepts: Not assigned yet", () => {
    expect(
      cards([
        ["30392", A],
        ["*:tag", D],
      ]),
    ).toEqual({ scores: [], lists: [A], concepts: [] });
  });
  it("I8: `3038x:tag:<X>` → B and `*:tag` → D — Scores: B; Lists and Concepts: Not assigned yet", () => {
    expect(
      cards([
        [`3038x:tag:${X}`, B],
        ["*:tag", D],
      ]),
    ).toEqual({ scores: [B], lists: [], concepts: [] });
  });

  // B — `*:` alone is still `*`.
  it("B1: `*:` → C — C on all three cards (as today)", () => {
    expect(cards([["*:", C]])).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });
  it("B2: `*::` → C — C on all three cards (as today)", () => {
    expect(cards([["*::", C]])).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });
  it("B3: `3038x` → B and `*:` → C — Scores: B; Lists and Concepts: C (as today)", () => {
    expect(
      cards([
        ["3038x", B],
        ["*:", C],
      ]),
    ).toEqual({ scores: [B], lists: [C], concepts: [C] });
  });
  it("B4: `*` → C, then `*:` → D are one key — C on all three cards; D is a backup (as today)", () => {
    expect(
      cards([
        ["*", C],
        ["*:", D],
      ]),
    ).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });

  // O — an ignored entry changes nothing else on the cards.
  it("O1: `*:tag` → D, then `*` → C — C on all three cards (D is neither counted nor the key `*`)", () => {
    expect(
      cards([
        ["*:tag", D],
        ["*", C],
      ]),
    ).toEqual({ scores: [C], lists: [C], concepts: [C] });
  });
  it("O2: `*:tag` → D and `3038x:tag` → B — Scores: B; Lists and Concepts: Not assigned yet", () => {
    expect(
      cards([
        ["*:tag", D],
        ["3038x:tag", B],
      ]),
    ).toEqual({ scores: [B], lists: [], concepts: [] });
  });
});

describe("treasure-map-card-details", () => {
  /** A category's entries in short: "key[norm]=A@relay,C@" per key, the norm shown only when it differs. */
  const compact = (list: CategoryEntry[]) =>
    list
      .map(
        (e) =>
          `${e.key}${e.norm !== e.key ? `[${e.norm}]` : ""}=${e.tags
            .map((t) => `${LETTER[t.pubkey] ?? t.pubkey}@${t.relay}`)
            .join(",")}`,
      )
      .join(" ");
  /** categoryEntries over these tags, each category in short; the input checked unchanged. */
  const entries = (tags: unknown[]) => {
    const event = mapWith(tags);
    const before = JSON.parse(JSON.stringify(event));
    const got = categoryEntries(event);
    expect(event, "categoryEntries changed its input").toEqual(before);
    return { scores: compact(got.scores), lists: compact(got.lists), concepts: compact(got.concepts) };
  };

  it("U1: the shape — { scores, lists, concepts }, each a list of { key, norm, tags: [{ pubkey, relay }] }; nothing else on an entry or a tag", () => {
    const got = categoryEntries(
      mapWith([
        ["30382:rank", A, R1],
        ["30392", B, R2],
        ["39998", C, ""],
      ]),
    );
    expect(Object.keys(got).sort()).toEqual(["concepts", "lists", "scores"]);
    for (const category of CATEGORIES) {
      expect(got[category], category).toHaveLength(1);
      expect(Object.keys(got[category][0]).sort(), category).toEqual(["key", "norm", "tags"]);
      expect(Object.keys(got[category][0].tags[0]).sort(), category).toEqual(["pubkey", "relay"]);
    }
  });
  it("U2: no event, no tags, or garbage — three empty lists, never a throw (AC-4)", () => {
    for (const ev of [
      null,
      undefined,
      {},
      { tags: null },
      { tags: "x" },
      mapWith([]),
      mapWith([null, "x", 42, [], [7, A], ["30382:rank"]]),
    ]) {
      expect(looseEntries(ev), JSON.stringify(ev)).toEqual(NONE);
    }
  });
  it("U3: keys in the order the Map first names them; each key's valid tags in Map order, relay as written (AC-2)", () => {
    expect(
      entries([
        ["30382:rank", A, R1],
        ["30382:followers", A, R1],
        ["30392", L, R2],
        ["30382:rank", C, ""],
        ["39998", L, R2],
      ]),
    ).toEqual({
      scores: "30382:rank=A@wss://one.example,C@ 30382:followers=A@wss://one.example",
      lists: "30392=L@wss://two.example",
      concepts: "39998=L@wss://two.example",
    });
  });
  it("U4: E2 — one key in two spellings is one key, shown in its first spelling, the second tag after the first", () => {
    expect(
      entries([
        ["30382:rank", A, R1],
        ["30382:rank:", C, R2],
      ]),
    ).toMatchObject({ scores: "30382:rank=A@wss://one.example,C@wss://two.example" });
  });
  it("U5: E3 — `39998:dlist-header` and `39998` are one Concepts key, in whichever spelling comes first", () => {
    expect(
      entries([
        ["39998", A, R1],
        ["39998:dlist-header", B, R2],
      ]),
    ).toMatchObject({ concepts: "39998=A@wss://one.example,B@wss://two.example" });
    expect(
      entries([
        ["39998:dlist-header", B, R2],
        ["39998", A, R1],
      ]),
    ).toMatchObject({ concepts: "39998:dlist-header[39998]=B@wss://two.example,A@wss://one.example" });
  });
  it("U6: E4 (J1 advisory) — a tag with no valid Assistant is left out; when it carries a key's first spelling, the first valid tag's spelling and Assistant lead", () => {
    expect(
      entries([
        ["30382:rank:", "not-a-key", R1],
        ["30382:rank", A, R2],
      ]),
    ).toMatchObject({ scores: "30382:rank=A@wss://two.example" });
    expect(
      entries([
        ["30382:rank", A, R1],
        ["30382:rank", "c".repeat(63), R2],
        ["30382:rank", C, ""],
      ]),
    ).toMatchObject({ scores: "30382:rank=A@wss://one.example,C@" });
    expect(entries([["3038x", "not-a-key", R1]])).toEqual({ scores: "", lists: "", concepts: "" });
  });
  it("U7: E5 — the same Assistant twice on one key is listed twice", () => {
    expect(
      entries([
        ["30392", B, R1],
        ["30392", B, R2],
      ]),
    ).toMatchObject({ lists: "30392=B@wss://one.example,B@wss://two.example" });
  });
  it("U8: AC-3 / E8 — a bare `*` is listed where it reaches; a family entry covering it hides it there; `*:…` never listed", () => {
    expect(
      entries([
        ["*", D, R1],
        ["*:tag", A, R1],
        ["*:rank", A, R1],
      ]),
    ).toEqual({ scores: "*=D@wss://one.example", lists: "*=D@wss://one.example", concepts: "*=D@wss://one.example" });
    expect(
      entries([
        ["*", D, R1],
        ["3038x", A, R2],
        ["39998:dlist-header", B, ""],
      ]),
    ).toEqual({
      scores: "3038x=A@wss://two.example",
      lists: "*=D@wss://one.example",
      concepts: "39998:dlist-header[39998]=B@",
    });
    expect(entries([["*:", D, R1]])).toMatchObject({ scores: "*:[*]=D@wss://one.example" });
  });
  it("U9: other categories' entries, unknown kinds and non-entry tags are in no category's list; individual duties are listed", () => {
    expect(
      entries([
        ["p", A],
        ["client", "x"],
        ["99999", A, R1],
        ["3038x:tag:X1", C, R1],
        ["30396:tag:X:T", D, R1],
        ["39998:restaurants", C, R2],
      ]),
    ).toEqual({
      scores: "3038x:tag:X1=C@wss://one.example",
      lists: "30396:tag:X:T=D@wss://one.example",
      concepts: "39998:restaurants=C@wss://two.example",
    });
  });
  it('U10: an Assistant in upper case is listed in lower case; a missing or non-text relay is ""', () => {
    expect(
      entries([
        ["30382:rank", B.toUpperCase(), R1],
        ["30392", A],
        ["39998", C, 42],
      ]),
    ).toEqual({ scores: "30382:rank=B@wss://one.example", lists: "30392=A@", concepts: "39998=C@" });
  });

  // A — the card and its panel never disagree.
  const AGREEMENT_MAPS: string[][][] = [
    [],
    [
      ["30382:rank", A],
      ["30382:followers", A],
      ["30392", L],
      ["39998:dlist-header", L],
      ["39998:restaurants", C],
      ["*:tag", D],
    ],
    [
      ["30382:rank", A],
      ["30382:rank", C],
      ["3038x:tag:X1", C],
      ["30382:tag:X2", B],
      ["30392", L],
      ["30396:tag:X1:T1", D],
      ["39998:dlist-header", L],
      ["39998:restaurants", C],
      ["39998:restaurants", B],
      ["*:tag", D],
      ["*:tag", A],
      ["31234:foo", A],
    ],
    [["*", A]],
    [
      ["*", A],
      ["3038x", B],
    ],
    [
      ["*", A],
      ["3039x:", B],
      ["39998", C],
    ],
    [
      ["*:", A],
      ["*::", B],
    ],
    [
      ["3038x:", "not-a-key"],
      ["*", D],
    ],
    [
      ["30382:rank:", A],
      ["30382:rank", B],
    ],
    [
      ["39999", A],
      ["39999:dlist-header", B],
    ],
    [
      ["39998:a:b", A],
      ["39998:a", B],
    ],
    [["3039x:rank", D]],
    [
      ["30382:rank", C],
      ["30382:rank", A],
      ["30382:followers", C],
      ["*", E],
    ],
    [
      ["3038x", "not-a-key"],
      ["30382:rank", "c".repeat(63)],
      ["30382:rank", B],
    ],
  ];

  it("A1: over every Map the card-rule suites use and the edge cases, categoryAssistants is the distinct first Assistants of categoryEntries' keys, in order", () => {
    for (const rows of AGREEMENT_MAPS) {
      const event = mapWith(rows.map(([k, pk, r = R1]) => [k, pk, r]));
      const byKey = categoryEntries(event);
      const counted = categoryAssistants(event);
      for (const category of CATEGORIES) {
        const firsts: string[] = [];
        for (const e of byKey[category]) if (!firsts.includes(e.tags[0].pubkey)) firsts.push(e.tags[0].pubkey);
        expect(counted[category], `${JSON.stringify(rows)} ${category}`).toEqual(firsts);
      }
    }
  });
});
