/**
 * Edit mode's rules for a Treasure Map — the cases Tapestry's own suites pin
 * (test/treasure-map-edit-mode.test.js, treasure-map-switches, and the pure
 * parts of treasure-map-save), with their fixtures, expected values and IDs, so
 * an edit made in either app writes the same Map.
 *
 * Not ported:
 * - treasure-map-edit-mode K1–K3: pickerRows — not in this module.
 * - treasure-map-edit-mode W1–W4, treasure-map-switches W1–W2, treasure-map-save W1: Tapestry's COPY words and exports.
 * - treasure-map-edit-mode S1–S3, treasure-map-switches S1–S2, treasure-map-save S1–S4: source sentinels.
 * - treasure-map-save Q1–Q12, C1, R1: the save sequence, cleanSave and the publish report (signer and publish effects).
 */
import { describe, expect, it } from "vitest";
import { entryRole, type ByCategory, type MapCategory } from "./treasureMapCards";
import {
  FAMILY,
  backupCount,
  currentAll,
  currentOf,
  dropBackups,
  editedDraft,
  editedTags,
  individualDuties,
  isNewerMap,
  makeRelayFor,
  overrideAllState,
  pickAll,
  pickCategory,
  planEdit,
  saveNote,
  setBackups,
  setOverride,
  setOverrideAll,
  stampTime,
  undoAll,
  undoCategory,
  type PendingEdit,
} from "./treasureMapEdit";

// Fixture keys, never live ones.
const A = "c1".repeat(32);
const B = "c2".repeat(32);
const C = "c3".repeat(32);
const D = "d1".repeat(32);
const L = "a2".repeat(32); // the viewer's own Assistant here
const VIEWER = "a1".repeat(32);
const R0 = "wss://old.example";
const LETTER: Record<string, string> = { [A]: "A", [B]: "B", [C]: "C", [D]: "D", [L]: "L", [VIEWER]: "V" };
/** A relayFor that shows who and which category it was asked for. */
const rf = (pk: string, cat: string) => `wss://${cat}.${LETTER[pk] || "x"}`;

const clone = <V>(v: V): V => JSON.parse(JSON.stringify(v));
/** [key, who, relay?, …extra] rows as tags, every relay R0 unless given; a row without a who stays a one-element tag. */
const T = (rows: string[][]): string[][] =>
  rows.map(([k, pk, r = R0, ...extra]) => (pk === undefined ? [k] : [k, pk, r, ...extra]));

describe("treasure-map-edit-mode", () => {
  /** editedTags over rows, compared in full with `want`; the input checked unchanged. */
  const expectEdited = (rows: string[][], pending: PendingEdit, want: unknown[]) => {
    const tags = T(rows);
    const before = clone(tags);
    const got = editedTags(tags, pending, rf);
    expect(tags, "editedTags changed its input").toEqual(before);
    expect(got).toEqual(want);
  };

  // R — entryRole: own, individual, or neither.
  const ROLES: ByCategory<{ own: string[]; individual: string[]; none: string[] }> = {
    scores: {
      own: [
        "3038x",
        "3038x:",
        "30380",
        "30382",
        "30389",
        "30382:rank",
        "30382:rank:",
        "3038x:rank",
        "30383:confidence",
      ],
      individual: [
        "30382:tag",
        "30382:tag:X:T:rank",
        "3038x:tag",
        "3038x:dlist:Q",
        "30382:pin:x",
        "30382:contexts",
        "30382::rank",
      ],
      none: ["*", "*:", "*:tag", "*:rank", "30392", "3039x", "39998", "99999", "3040x"],
    },
    lists: {
      own: ["3039x", "3039x:", "30390", "30392", "30399", "30392:"],
      individual: ["30392:rank", "30396:tag:X:T", "3039x:dlist", "30397:pin:39998:P", "3039x:tag::T"],
      none: ["*", "*:tag", "30382", "3038x", "39998"],
    },
    concepts: {
      own: ["39998", "39998:dlist-header", "39999"],
      individual: ["39998:dog-breed", "39998:a:b", "39999:x", "39999:dlist-header"],
      none: ["*", "*:", "30382", "30392", "3038x"],
    },
  };

  for (const category of Object.keys(ROLES) as MapCategory[]) {
    it(`R-${category}: entryRole('${category}', …) — own, individual, and neither, as ADR 0003 sub-decision 2 lists`, () => {
      const sets = ROLES[category];
      const got = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, entryRole(category, [key, A, R0])]));
      const want = (keys: string[], role: string | null) => Object.fromEntries(keys.map((key) => [key, role]));
      expect(got(sets.own)).toEqual(want(sets.own, "own"));
      expect(got(sets.individual)).toEqual(want(sets.individual, "individual"));
      expect(got(sets.none)).toEqual(want(sets.none, null));
    });
  }

  it("R-invalid: a tag with no valid 64-hex Assistant, or not a tag at all, has no role in any category", () => {
    for (const tag of [["3038x", "not-a-key", R0], ["30382:rank"], [42, A], null, "x", ["39998", "c".repeat(63)]]) {
      for (const category of ["scores", "lists", "concepts"] as const) {
        expect(entryRole(category, tag), `${JSON.stringify(tag)} on ${category}`).toBeNull();
      }
    }
  });

  // Owner's request, 2026-10-08: assigning Concepts writes both of its kinds, `39998` and `39999`.
  it("R-family: FAMILY names each category's family entries — 3038x; 3039x; 39998 and 39999", () => {
    expect(FAMILY).toEqual({ scores: ["3038x"], lists: ["3039x"], concepts: ["39998", "39999"] });
  });

  // E — editedTags: the story's AC-5 table, then the edges.
  it("E1: AC-5 row 1 — rank and followers → A, 30392 → L; Scores → B: both move to B in place, 30392 stays, 3038x → B added", () => {
    expectEdited(
      [
        ["30382:rank", A],
        ["30382:followers", A],
        ["30392", L],
      ],
      { scores: B },
      [
        ["30382:rank", B, rf(B, "scores")],
        ["30382:followers", B, rf(B, "scores")],
        ["30392", L, R0],
        ["3038x", B, rf(B, "scores")],
      ],
    );
  });
  it("E2: AC-5 row 2 — rank → A, then rank → C (a backup); Scores → B: the first moves to B, the backup stays", () => {
    expectEdited(
      [
        ["30382:rank", A],
        ["30382:rank", C],
      ],
      { scores: B },
      [
        ["30382:rank", B, rf(B, "scores")],
        ["30382:rank", C, R0],
        ["3038x", B, rf(B, "scores")],
      ],
    );
  });
  it("E3: AC-5 row 3 — 3038x → A, 3038x:tag:<X> → C; Scores → B: 3038x moves, the individually assigned duty stays", () => {
    expectEdited(
      [
        ["3038x", A],
        ["3038x:tag:X", C],
      ],
      { scores: B },
      [
        ["3038x", B, rf(B, "scores")],
        ["3038x:tag:X", C, R0],
      ],
    );
  });
  it("E4: AC-5 row 4 — 30392 → A, 30396:tag:<X>:<T> → C; Lists → B: 30392 moves, the duty stays, 3039x → B added", () => {
    expectEdited(
      [
        ["30392", A],
        ["30396:tag:X:T", C],
      ],
      { lists: B },
      [
        ["30392", B, rf(B, "lists")],
        ["30396:tag:X:T", C, R0],
        ["3039x", B, rf(B, "lists")],
      ],
    );
  });
  it("E5: AC-5 row 5 — 39998:dlist-header → A, 39998:<d> → C; Concepts → B: the family entry moves in its own spelling, 39999 → B added", () => {
    expectEdited(
      [
        ["39998:dlist-header", A],
        ["39998:d", C],
      ],
      { concepts: B },
      [
        ["39998:dlist-header", B, rf(B, "concepts")],
        ["39998:d", C, R0],
        ["39999", B, rf(B, "concepts")],
      ],
    );
  });
  it("E6: AC-5 row 6 — *:tag → D, rank → A; Assign to all → B: *:tag stays, rank moves, then 3038x, 3039x, 39998, 39999 and * → B added in that order", () => {
    expectEdited(
      [
        ["*:tag", D],
        ["30382:rank", A],
      ],
      { scores: B, lists: B, concepts: B, everything: B },
      [
        ["*:tag", D, R0],
        ["30382:rank", B, rf(B, "scores")],
        ["3038x", B, rf(B, "scores")],
        ["3039x", B, rf(B, "lists")],
        ["39998", B, rf(B, "concepts")],
        ["39999", B, rf(B, "concepts")],
        ["*", B, ""],
      ],
    );
  });
  it("E7: AC-5 row 7 — no Map; Scores → B: a new Map with 3038x → B, nothing else (book decision 15)", () => {
    expectEdited([], { scores: B }, [["3038x", B, rf(B, "scores")]]);
  });
  it("E8: a real Map — every tag the edit doesn't move keeps its bytes and its place, non-entry tags and odd ones included", () => {
    const metrics = [
      "rank",
      "followers",
      "personalizedGrapeRank_influence",
      "personalizedGrapeRank_average",
      "personalizedGrapeRank_confidence",
      "personalizedGrapeRank_input",
      "personalizedPageRank",
      "verifiedFollowerCount",
      "verifiedMuterCount",
      "verifiedReporterCount",
      "hops",
    ];
    const rows = [
      ["client", "some-app"],
      ...metrics.map((m) => [`30382:${m}`, L, "wss://nip85.example"]),
      ["30392", L, "wss://tl.example"],
      ["39998:dlist-header", L, ""],
      ["39998:restaurants", C, "wss://dl.example", "note"],
      ["*:tag", D, ""],
      ["3038x:tag:X", C, ""],
      ["99999", A, ""],
    ];
    const want = [
      ["client", "some-app"],
      ...metrics.map((m) => [`30382:${m}`, B, rf(B, "scores")]),
      ["30392", L, "wss://tl.example"],
      ["39998:dlist-header", L, ""],
      ["39998:restaurants", C, "wss://dl.example", "note"],
      ["*:tag", D, ""],
      ["3038x:tag:X", C, ""],
      ["99999", A, ""],
      ["3038x", B, rf(B, "scores")],
    ];
    expect(editedTags(clone(rows), { scores: B }, rf)).toEqual(want);
  });
  it("E9: nothing to move — every own entry already names B: the tags come back as they were, relays included", () => {
    expectEdited(
      [
        ["30382:rank", B],
        ["3038x", B],
      ],
      { scores: B },
      [
        ["30382:rank", B, R0],
        ["3038x", B, R0],
      ],
    );
  });
  it("E10: an own entry whose Assistant is B in upper case counts as B — left as it is", () => {
    expectEdited(
      [
        ["30382:rank", B.toUpperCase()],
        ["3038x", B],
      ],
      { scores: B },
      [
        ["30382:rank", B.toUpperCase(), R0],
        ["3038x", B, R0],
      ],
    );
  });
  it("E11: tags with no valid Assistant are kept, and an invalid family entry is no family entry — 3038x → B is added", () => {
    expectEdited(
      [
        ["3038x", "not-a-key"],
        ["30382:rank", A],
      ],
      { scores: B },
      [
        ["3038x", "not-a-key", R0],
        ["30382:rank", B, rf(B, "scores")],
        ["3038x", B, rf(B, "scores")],
      ],
    );
  });
  it("E12: a moved entry keeps its key's spelling and any extra elements after the relay", () => {
    expectEdited([["30382:rank:", A, R0, "extra", "more"]], { scores: B }, [
      ["30382:rank:", B, rf(B, "scores"), "extra", "more"],
      ["3038x", B, rf(B, "scores")],
    ]);
  });
  it("E13: one key in two spellings — only its first valid entry moves; the second is that key's backup", () => {
    expectEdited(
      [
        ["30382:rank", A],
        ["30382:rank:", C],
      ],
      { scores: B },
      [
        ["30382:rank", B, rf(B, "scores")],
        ["30382:rank:", C, R0],
        ["3038x", B, rf(B, "scores")],
      ],
    );
  });
  it('E14: the everything entry — an existing * (or *:) moves to B in place with relay "", else * → B is added', () => {
    expectEdited([["*", A]], { everything: B }, [["*", B, ""]]);
    expectEdited(
      [
        ["*:", A],
        ["*", C],
      ],
      { everything: B },
      [
        ["*:", B, ""],
        ["*", C, R0],
      ],
    );
    expectEdited([["30382:rank", A]], { everything: B }, [
      ["30382:rank", A, R0],
      ["*", B, ""],
    ]);
  });
  it("E15: a category with only individually assigned duties — they stay, and the family entry is added", () => {
    expectEdited(
      [
        ["3038x:tag:X", C],
        ["30392:rank", C],
      ],
      { scores: B, lists: B },
      [
        ["3038x:tag:X", C, R0],
        ["30392:rank", C, R0],
        ["3038x", B, rf(B, "scores")],
        ["3039x", B, rf(B, "lists")],
      ],
    );
  });
  it("E16: nothing pending — the tags come back unchanged (a copy)", () => {
    expectEdited(
      [
        ["30382:rank", A],
        ["*:tag", D],
      ],
      {},
      [
        ["30382:rank", A, R0],
        ["*:tag", D, R0],
      ],
    );
  });
  it("E18: Concepts → B — each of 39998 and 39999 moves in place when the Map has it, and is added when it doesn't", () => {
    expectEdited([["39999", A]], { concepts: B }, [
      ["39999", B, rf(B, "concepts")],
      ["39998", B, rf(B, "concepts")],
    ]);
    expectEdited(
      [
        ["39998", A],
        ["39999", C],
      ],
      { concepts: B },
      [
        ["39998", B, rf(B, "concepts")],
        ["39999", B, rf(B, "concepts")],
      ],
    );
    expectEdited(
      [
        ["39998", B],
        ["39999", B],
      ],
      { concepts: B },
      [
        ["39998", B, R0],
        ["39999", B, R0],
      ],
    );
    expectEdited([], { concepts: B }, [
      ["39998", B, rf(B, "concepts")],
      ["39999", B, rf(B, "concepts")],
    ]);
  });
  it("E17: a bare * is no category's own entry — Scores → B leaves it; and the other categories' entries stay", () => {
    expectEdited(
      [
        ["*", A],
        ["30392", A],
        ["39998", A],
      ],
      { scores: B },
      [
        ["*", A, R0],
        ["30392", A, R0],
        ["39998", A, R0],
        ["3038x", B, rf(B, "scores")],
      ],
    );
  });

  // D — editedDraft.
  it("D1: the draft is { kind: 10040, pubkey: viewer, content, tags } — no id, sig or created_at; content kept", () => {
    const event = {
      id: "9".repeat(64),
      pubkey: VIEWER,
      kind: 10040,
      created_at: 5,
      content: "hello",
      sig: "f".repeat(128),
      tags: [["30382:rank", A, R0]],
    };
    const before = clone(event);
    const got = editedDraft({ event, viewer: VIEWER, pending: { scores: B }, relayFor: rf });
    expect(Object.keys(got).sort()).toEqual(["content", "kind", "pubkey", "tags"]);
    expect(got).toMatchObject({ kind: 10040, pubkey: VIEWER, content: "hello" });
    expect(got.tags).toEqual([
      ["30382:rank", B, rf(B, "scores")],
      ["3038x", B, rf(B, "scores")],
    ]);
    expect(event, "editedDraft changed the event").toEqual(before);
  });
  it('D2: no Map — the draft has content "" and only the new entries', () => {
    const got = editedDraft({ event: null, viewer: VIEWER, pending: { lists: B }, relayFor: rf });
    expect(got).toStrictEqual({ kind: 10040, pubkey: VIEWER, content: "", tags: [["3039x", B, rf(B, "lists")]] });
  });
  it("D3: nothing pending — the draft's tags are the Map's tags", () => {
    const tags = [
      ["30382:rank", A, R0],
      ["client", "x"],
    ];
    const event = { kind: 10040, pubkey: VIEWER, content: "", tags };
    const got = editedDraft({ event, viewer: VIEWER, pending: {}, relayFor: rf });
    expect(got.tags).toEqual(tags);
  });

  // Y — makeRelayFor. Tapestry's aRelays groups, each by its first relay: aTrustedAssertionRelays
  // ["wss://ta1", "wss://ta2"] → scores, aTrustedListRelays → lists, aDListRelays → concepts.
  const RELAYS = { scores: "wss://ta1", lists: "wss://tl", concepts: "wss://dl" };

  it('Y1: the Assistant here gets its category\'s first configured relay — Trusted Assertion, Trusted List, DList; the everything entry ""', () => {
    const relayFor = makeRelayFor({ localPubkey: L, relays: RELAYS });
    const got = ["scores", "lists", "concepts", "everything"].map((c) => relayFor(L, c as MapCategory));
    expect(got).toEqual(["wss://ta1", "wss://tl", "wss://dl", ""]);
  });
  it('Y2: any other Assistant gets "", in every category', () => {
    const relayFor = makeRelayFor({ localPubkey: L, relays: RELAYS });
    expect((["scores", "lists", "concepts"] as const).map((c) => relayFor(B, c))).toEqual(["", "", ""]);
  });
  it('Y3: no relay settings yet, empty groups, or no Assistant here — "" without a throw', () => {
    // aRelays null, undefined, {} and { aTrustedAssertionRelays: [] } all leave Scores with no relay: relays {}.
    for (const input of [
      { localPubkey: L, relays: {} },
      { localPubkey: null, relays: RELAYS },
    ]) {
      expect(makeRelayFor(input)(input.localPubkey || L, "scores"), JSON.stringify(input)).toBe("");
    }
  });

  // P — the pending steps.
  it("P1: pickCategory — sets the card's change; picking the card's current Assistant removes it; the input is never changed", () => {
    const start = { lists: C };
    const a = pickCategory(start, "scores", B, A);
    expect(a).toStrictEqual({ lists: C, scores: B });
    const b = pickCategory(a, "scores", A, A);
    expect(b).toStrictEqual({ lists: C });
    const c = pickCategory(a, "scores", C, A);
    expect(c).toStrictEqual({ lists: C, scores: C });
    expect(start, "pickCategory changed its input").toStrictEqual({ lists: C });
    expect(a.scores, "pickCategory changed its input").toBe(B);
  });
  it("P2: pickCategory on a card with no single current Assistant (null) — every pick sets the change", () => {
    expect(pickCategory({}, "concepts", A, null)).toStrictEqual({ concepts: A });
  });
  // Re-aimed at treasure-map-edit #4's Test Design (book decision 16, ADR 0004 sub-decision 1): after Assign to all, a
  // card's Undo also cancels the everything entry's change. It used to keep it.
  it("P3: undoCategory — removes that card's change and, by book decision 16, the everything entry's; the other cards keep theirs", () => {
    const all = { scores: B, lists: B, concepts: B, everything: B };
    expect(undoCategory(all, "lists")).toStrictEqual({ scores: B, concepts: B });
    expect(all, "undoCategory changed its input").toMatchObject({ lists: B, everything: B });
  });
  it("P4: pickAll — all three cards and the everything entry to one Assistant; picking the current-all Assistant clears everything", () => {
    const got = pickAll({ scores: C }, B, A);
    expect(got).toStrictEqual({ scores: B, lists: B, concepts: B, everything: B });
    expect(pickAll(got, A, A)).toStrictEqual({});
  });
  it("P5: undoAll — nothing pending", () => {
    expect(undoAll({ scores: B, everything: B })).toStrictEqual({});
  });
  it("P6: a card changed after Assign to all changes only that card", () => {
    expect(pickCategory(pickAll({}, B, null), "scores", A, C)).toStrictEqual({
      scores: A,
      lists: B,
      concepts: B,
      everything: B,
    });
  });

  // N — saveNote, currentOf, currentAll.
  const NAMES: Record<string, string> = { [A]: "Ava", [B]: "Bea", [C]: "Cy" };
  const nameOf = (pk: string) => NAMES[pk] || pk;

  it('N1: saveNote — "No changes yet", "All duties → Bea", "1 unsaved change", "N unsaved changes"', () => {
    const cases: [PendingEdit, string][] = [
      [{}, "No changes yet"],
      [{ scores: B, lists: B, concepts: B, everything: B }, "All duties → Bea"],
      [{ scores: B }, "1 unsaved change"],
      [{ scores: A, lists: B, concepts: B, everything: B }, "4 unsaved changes"],
      [{ scores: B, lists: B, concepts: B }, "3 unsaved changes"],
      [{ everything: B }, "1 unsaved change"],
    ];
    for (const [pending, want] of cases) expect(saveNote(pending, nameOf), JSON.stringify(pending)).toBe(want);
  });
  // currentOf and currentAll take categoryAssistants' lists, where Tapestry passes the cards built from them.
  it("N2: currentOf — a single card's Assistant; a mixed or unassigned card has none", () => {
    expect([[A], [A, B], []].map((assistants) => currentOf(assistants))).toEqual([A, null, null]);
  });
  it("N3: currentAll — only when all three cards name one Assistant alone", () => {
    const of = (scores: string[], lists: string[], concepts: string[]) => ({ scores, lists, concepts });
    const got = [of([A], [A], [A]), of([A], [A], [B]), of([A], [], [A]), of([A, B], [A], [A])].map((assistants) =>
      currentAll(assistants),
    );
    expect(got).toEqual([A, null, null, null]);
  });
});

describe("treasure-map-switches", () => {
  const NAMES: Record<string, string> = { [A]: "Ava", [B]: "Bea", [C]: "Cy", [D]: "Dee" };
  const nameOf = (pk: string) => NAMES[pk] || "someone";

  /** editedTags over rows, compared in full with wantRows (both read by T); its tags and pending checked unchanged. */
  const expectEdited = (rows: string[][], pending: PendingEdit, wantRows: string[][]) => {
    const tags = T(rows);
    const before = clone(tags);
    const pend = clone(pending);
    const got = editedTags(tags, pending, rf);
    expect(tags, "editedTags changed its tags").toEqual(before);
    expect(pending, "editedTags changed its pending").toStrictEqual(pend);
    expect(got).toEqual(T(wantRows));
  };

  // I — individualDuties: what a card's override switch counts.
  it("I1: Scores — the individual entries naming anyone other than the pending Assistant, each key once, in first-seen order", () => {
    const tags = T([
      ["30382:rank", A], // own: never counted
      ["3038x", A],
      ["3038x:tag:X", C], // individual, naming others: counted
      ["30382:tag:X:T:rank", D],
      ["3038x:tag:X", C], // the same key again: once
      ["30382:tag:Y", B], // names only the pending Assistant: not counted
      ["30383:pin:P", B], // names B, then C: counted
      ["30383:pin:P", C],
      ["30392:rank", C], // other categories: not counted
      ["39998:d", C],
    ]);
    expect(individualDuties(tags, "scores", B)).toEqual(["3038x:tag:X", "30382:tag:X:T:rank", "30383:pin:P"]);
  });
  it("I2: Lists and Concepts — their own narrower entries; a family or whole-kind entry never counts", () => {
    const lists = individualDuties(
      T([
        ["30392", A],
        ["3039x", A],
        ["30396:tag:X:T", C],
        ["3039x:dlist:Q", D],
        ["30392:rank", B],
      ]),
      "lists",
      B,
    );
    expect(lists).toEqual(["30396:tag:X:T", "3039x:dlist:Q"]);
    const concepts = individualDuties(
      T([
        ["39998:dlist-header", A],
        ["39998", C],
        ["39999", C],
        ["39998:restaurants", C],
        ["39998:restaurants", B],
        ["39999:x", D],
        ["39998:dogs", B],
      ]),
      "concepts",
      B,
    );
    expect(concepts).toEqual(["39998:restaurants", "39999:x"]);
  });
  it("I3: never a `*` or `*:…` entry (book decision 11), an invalid tag, or a non-grammar tag", () => {
    const tags = [
      ...T([
        ["*", C],
        ["*:tag", C],
        ["*:tag:X:T:rank", D],
        ["3038x:tag:X", "not-hex"],
      ]),
      ["30382:tag:Z"],
      null,
      "x",
      ["p", C],
      ["alt", D],
    ];
    for (const category of ["scores", "lists", "concepts"] as const) {
      expect(individualDuties(tags, category, B), category).toEqual([]);
    }
  });
  it("I4: no tags, no pending Assistant, or garbage — an empty list, never a throw", () => {
    // Garbage the TS signature rules out, passed as Tapestry passes it.
    const loose = individualDuties as (tags: unknown, category: MapCategory, pubkey: unknown) => string[];
    for (const tags of [[], undefined, null]) expect(loose(tags, "scores", B), JSON.stringify(tags)).toEqual([]);
    expect(Array.isArray(loose(T([["3038x:tag:X", C]]), "scores", undefined)), "no pending Assistant").toBe(true);
  });

  // O — editedTags with an override on.
  it("O1: AC-4 row 1 — `3038x` → A, `3038x:tag:<X>` → C; Scores → B, override on", () => {
    expectEdited(
      [
        ["3038x", A],
        ["3038x:tag:X", C],
      ],
      { scores: B, override: { scores: true } },
      [["3038x", B, "wss://scores.B"]],
    );
  });
  it("O2: AC-4 rows 2–3 — Lists → B: the duty naming C goes, the one naming only B stays, `3039x` is added", () => {
    expectEdited(
      [
        ["30392", A],
        ["30396:tag:X:T", C],
        ["30396:tag:Y:T", B],
      ],
      { lists: B, override: { lists: true } },
      [
        ["30392", B, "wss://lists.B"],
        ["30396:tag:Y:T", B],
        ["3039x", B, "wss://lists.B"],
      ],
    );
  });
  it("O3: AC-4 row 4 — Concepts → B: both `39998:<d>` entries go (one names C); `39999` → B is added", () => {
    expectEdited(
      [
        ["39998", A],
        ["39998:d", C],
        ["39998:d", B],
      ],
      { concepts: B, override: { concepts: true } },
      [
        ["39998", B, "wss://concepts.B"],
        ["39999", B, "wss://concepts.B"],
      ],
    );
  });
  it("O4: AC-4 row 5 — a `*:…` entry is never a duty: it stays, in its place", () => {
    expectEdited(
      [
        ["*:tag", D],
        ["3038x:tag:X", C],
      ],
      { scores: B, override: { scores: true } },
      [
        ["*:tag", D],
        ["3038x", B, "wss://scores.B"],
      ],
    );
  });
  it("O5: an override with no pending Assistant for its card, or a pending card with its override off, removes nothing", () => {
    const rows = [
      ["30382:rank", A],
      ["3038x:tag:X", C],
      ["30392", A],
      ["30396:tag:X:T", C],
    ];
    expectEdited(rows, { override: { scores: true, lists: true } }, rows);
    expectEdited(rows, { lists: B, override: { scores: true } }, [
      ["30382:rank", A],
      ["3038x:tag:X", C],
      ["30392", B, "wss://lists.B"],
      ["30396:tag:X:T", C],
      ["3039x", B, "wss://lists.B"],
    ]);
  });
  it("O6: removal keeps every other tag byte for byte and in place, extra elements included", () => {
    expectEdited(
      [
        ["alt", "x"],
        ["3038x:tag:X", C, "wss://c.example", "extra"],
        ["30382:rank", A, "wss://a.example", "more"],
        ["p", VIEWER],
        ["3038x:tag:X", D],
      ],
      { scores: B, override: { scores: true } },
      [
        ["alt", "x"],
        ["30382:rank", B, "wss://scores.B", "more"],
        ["p", VIEWER],
        ["3038x", B, "wss://scores.B"],
      ],
    );
  });

  // B — dropBackups and backupCount.
  it("B1: every key keeps only its first entry; later ones go, a repeat of the same Assistant included; order kept", () => {
    const tags = T([
      ["30382:rank", A],
      ["30392", B],
      ["30382:rank", C],
      ["30392", B],
      ["3038x", D],
      ["30382:rank", D],
    ]);
    const before = clone(tags);
    const got = dropBackups(tags);
    expect(tags, "dropBackups changed its input").toEqual(before);
    expect(got).toEqual(
      T([
        ["30382:rank", A],
        ["30392", B],
        ["3038x", D],
      ]),
    );
  });
  it("B2: two spellings of one key are one key (`39998:dlist-header` and `39998`; `3038x:` and `3038x`)", () => {
    const got = dropBackups(
      T([
        ["39998:dlist-header", A],
        ["39998", C],
        ["3038x", B],
        ["3038x:", D],
        ["30382:rank:", A],
        ["30382:rank", C],
      ]),
    );
    expect(got).toEqual(
      T([
        ["39998:dlist-header", A],
        ["3038x", B],
        ["30382:rank:", A],
      ]),
    );
  });
  it("B3: it reaches the whole Map — `*`, `*:…` entries and keys this page doesn't read (book decisions 8 and 11)", () => {
    const got = dropBackups(
      T([
        ["*", A],
        ["*", B],
        ["*:tag", D],
        ["*:tag", A],
        ["31234:foo", A],
        ["31234:foo", C],
        ["3039x:tag:X:T", B],
        ["3039x:tag:X:T", C],
      ]),
    );
    expect(got).toEqual(
      T([
        ["*", A],
        ["*:tag", D],
        ["31234:foo", A],
        ["3039x:tag:X:T", B],
      ]),
    );
  });
  it("B4: tags that aren't draft-grammar entries are never touched, even when they repeat with a 64-hex second element", () => {
    const tags = [
      ["p", VIEWER],
      ["p", VIEWER],
      ["alt", A],
      ["alt", A],
      ["client", "x"],
      ["client", "x"],
      ["3038x", "not-hex"],
      ["3038x", "not-hex"],
      ["30382"],
      ["abcd", A],
      ["abcd", B],
      ["303821", A],
      ["303821", B],
    ];
    expect(dropBackups(tags)).toEqual(tags);
  });
  it("B5: backupCount is how many tags dropBackups removes; none for a Map without backups, no tags, or garbage", () => {
    // Garbage the TS signature rules out, passed as Tapestry passes it.
    const loose = backupCount as (tags: unknown) => number;
    const cases: [unknown, number][] = [
      [
        T([
          ["30382:rank", A],
          ["30382:rank", C],
          ["*:tag", D],
          ["*:tag", A],
          ["p", VIEWER],
          ["p", VIEWER],
        ]),
        2,
      ],
      [
        T([
          ["39998:dlist-header", A],
          ["39998", C],
          ["39998", D],
        ]),
        2,
      ],
      [
        T([
          ["30382:rank", A],
          ["30392", B],
        ]),
        0,
      ],
      [[], 0],
      [undefined, 0],
      [null, 0],
    ];
    for (const [tags, want] of cases) expect(loose(tags), JSON.stringify(tags)).toBe(want);
  });
  it("B6: AC-4 row 6 — the backup switch alone: `30382:rank` and `*:tag` keep their first Assistants", () => {
    expectEdited(
      [
        ["30382:rank", A],
        ["30382:rank", C],
        ["*:tag", D],
        ["*:tag", A],
      ],
      { backups: true },
      [
        ["30382:rank", A],
        ["*:tag", D],
      ],
    );
  });
  it("B7: AC-4 row 7 — Scores → B with the backup switch: the moved entry's backup goes; `3038x` → B is added", () => {
    expectEdited(
      [
        ["30382:rank", A],
        ["30382:rank", C],
      ],
      { scores: B, backups: true },
      [
        ["30382:rank", B, "wss://scores.B"],
        ["3038x", B, "wss://scores.B"],
      ],
    );
  });
  it("B8: AC-4 row 8 — `39998:dlist-header` → A, `39998` → C: the second spelling is the backup", () => {
    expectEdited(
      [
        ["39998:dlist-header", A],
        ["39998", C],
      ],
      { backups: true },
      [["39998:dlist-header", A]],
    );
  });

  // Q — planEdit.
  const MAP = {
    id: "9".repeat(64),
    pubkey: VIEWER,
    created_at: 1790121600,
    kind: 10040,
    content: "kept",
    sig: "f".repeat(128),
    tags: T([
      ["30382:rank", A],
      ["30382:rank", C],
      ["3038x:tag:X", C],
      ["30382:tag:Y", B],
      ["30392", A],
      ["30396:tag:X:T", D],
      ["39998:dlist-header", A],
      ["39998:restaurants", C],
      ["39998:restaurants", B],
      ["*:tag", D],
      ["*:tag", A],
      ["31234:foo", A],
      ["31234:foo", C],
      ["p", VIEWER],
      ["p", VIEWER],
    ]),
  };
  /** planEdit for the viewer, its event and pending checked unchanged. */
  const plan = (pending: PendingEdit, event: typeof MAP | null = MAP) => {
    const before = clone(event);
    const pend = clone(pending);
    const got = planEdit({ event, viewer: VIEWER, pending, relayFor: rf });
    expect(event, "planEdit changed the event").toEqual(before);
    expect(pending, "planEdit changed its pending").toStrictEqual(pend);
    return got;
  };

  it("Q1: duties — each pending card's individualDuties against its own Assistant; [] for a card not pending", () => {
    expect(plan({ scores: B, concepts: B }).duties).toStrictEqual({
      scores: ["3038x:tag:X"],
      lists: [],
      concepts: ["39998:restaurants"],
    });
    expect(plan({ scores: C, lists: C, concepts: C, everything: C }).duties, "Assign to all → C").toStrictEqual({
      scores: ["30382:tag:Y"],
      lists: ["30396:tag:X:T"],
      concepts: ["39998:restaurants"],
    });
  });
  it("Q2: backups — counted after the assignments and overrides: a moved entry keeps its backup; an overridden key's don't count", () => {
    expect(plan({}).backups, "nothing pending: 30382:rank, 39998:restaurants, *:tag, 31234:foo").toBe(4);
    expect(plan({ scores: B }).backups, "Scores → B: the moved 30382:rank keeps its backup C").toBe(4);
    expect(
      plan({ concepts: B, override: { concepts: true } }).backups,
      "Concepts → B, override on: 39998:restaurants goes whole",
    ).toBe(3);
    expect(plan({ backups: true }).backups, "the switch on: still counts what it removes").toBe(4);
  });
  it("Q3: pending — `backups` dropped when there are none to remove; kept otherwise; nothing else touched", () => {
    const kept = plan({ scores: B, backups: true, override: { scores: true } });
    expect(kept.pending).toStrictEqual({ scores: B, backups: true, override: { scores: true } });
    const single = {
      ...MAP,
      tags: T([
        ["30382:rank", A],
        ["3038x:tag:X", C],
        ["3038x:tag:X", A],
      ]),
    };
    const gone = plan({ scores: B, backups: true, override: { scores: true } }, single);
    expect(gone.backups, "the override removed the only backup").toBe(0);
    expect(gone.pending, "backups dropped").toStrictEqual({ scores: B, override: { scores: true } });
  });
  it("Q4: draft — the viewer's kind 10040, content kept, no id or signature, tags as editedTags makes them with the effective pending", () => {
    const pending: PendingEdit = { scores: B, override: { scores: true }, backups: true };
    const d = plan(pending).draft;
    expect(d).toMatchObject({ kind: 10040, pubkey: VIEWER, content: "kept" });
    expect(d).not.toHaveProperty("id");
    expect(d).not.toHaveProperty("sig");
    expect(d).not.toHaveProperty("created_at");
    expect(d.tags).toEqual(editedTags(MAP.tags, pending, rf));
    expect(
      d.tags.filter((t) => (t as string[])[0] === "p"),
      "both p tags must survive",
    ).toHaveLength(2);
  });
  it("Q5: no Map — no duties, no backups, a draft with only what the assignments add", () => {
    const got = plan({ lists: B, backups: true }, null);
    expect(got.duties).toStrictEqual({ scores: [], lists: [], concepts: [] });
    expect(got.backups).toBe(0);
    expect(got.pending).toStrictEqual({ lists: B });
    expect(got.draft.tags).toEqual([["3039x", B, "wss://lists.B"]]);
  });

  // T — the steps.
  it("T1: setOverride, setOverrideAll, setBackups — on sets, off deletes; no empty override object or false flag; input unchanged", () => {
    const start = { scores: B };
    const a = setOverride(start, "scores", true);
    expect(a, "setOverride on").toStrictEqual({ scores: B, override: { scores: true } });
    expect(start, "setOverride changed its input").toStrictEqual({ scores: B });
    expect(setOverride(a, "scores", false), "setOverride off, the last one: no override key").toStrictEqual({
      scores: B,
    });
    // Re-aimed at treasure-map-edit #5's Test Design (book decision 18, ADR 0005 sub-decision 4): on turns on only the
    // cards with duties to override; off still clears all three.
    const duties = { scores: ["3038x:tag:X"], lists: ["30396:tag:X:T"], concepts: [] };
    const all = setOverrideAll({ everything: B, backups: true }, true, duties);
    expect(all, "setOverrideAll on, Concepts without duties").toStrictEqual({
      everything: B,
      backups: true,
      override: { scores: true, lists: true },
    });
    const allOff = setOverrideAll({ ...all, override: { scores: true, lists: true, concepts: true } }, false, duties);
    expect(allOff, "setOverrideAll off").toStrictEqual({ everything: B, backups: true });
    const on = setBackups({}, true);
    expect(on, "setBackups on").toStrictEqual({ backups: true });
    expect(setBackups(on, false), "setBackups off").toStrictEqual({});
  });
  it("T2: pickCategory — another Assistant keeps the card's override; its current one cancels the card, its override and the everything change (decision 16)", () => {
    const start: PendingEdit = {
      scores: B,
      lists: B,
      concepts: B,
      everything: B,
      override: { scores: true, lists: true },
      backups: true,
    };
    expect(pickCategory(start, "scores", C, A), "pick C").toStrictEqual({ ...start, scores: C });
    expect(pickCategory(start, "scores", A, A), "pick the current A").toStrictEqual({
      lists: B,
      concepts: B,
      override: { lists: true },
      backups: true,
    });
    expect(
      pickCategory({ scores: B, override: { scores: true } }, "scores", A, A),
      "the last override goes with its card",
    ).toStrictEqual({});
    expect(start, "pickCategory changed its input").toMatchObject({ scores: B, everything: B });
  });
  it("T3: undoCategory — removes the card's change, its override and the everything change (decision 16); keeps the rest", () => {
    const start: PendingEdit = {
      scores: C,
      lists: B,
      concepts: B,
      everything: B,
      override: { scores: true, concepts: true },
      backups: true,
    };
    expect(undoCategory(start, "lists"), "undo Lists").toStrictEqual({
      scores: C,
      concepts: B,
      override: { scores: true, concepts: true },
      backups: true,
    });
    expect(undoCategory(start, "scores"), "undo Scores").toStrictEqual({
      lists: B,
      concepts: B,
      override: { concepts: true },
      backups: true,
    });
    expect(start, "undoCategory changed its input").toMatchObject({ everything: B, lists: B });
  });
  it("T4: pickAll — every card and everything to one Assistant, every override off, the backup switch kept; its current Assistant keeps only the backup switch", () => {
    const got = pickAll({ scores: C, override: { scores: true }, backups: true }, B, A);
    expect(got, "pick B").toStrictEqual({ scores: B, lists: B, concepts: B, everything: B, backups: true });
    expect(pickAll(got, A, A), "pick the current A").toStrictEqual({ backups: true });
    expect(pickAll({ scores: C }, B, A), "no switches").toStrictEqual({
      scores: B,
      lists: B,
      concepts: B,
      everything: B,
    });
  });
  it("T5: undoAll — every assignment and override goes; the backup switch stays (story 4 default 5); no argument still gives {}", () => {
    expect(
      undoAll({ scores: B, lists: B, concepts: B, everything: B, override: { lists: true }, backups: true }),
      "with the backup switch",
    ).toStrictEqual({ backups: true });
    expect(undoAll({ scores: B, everything: B }), "without").toStrictEqual({});
    // No argument, which the TS signature rules out, called as Tapestry calls it.
    expect((undoAll as (pending?: PendingEdit) => PendingEdit)(), "no argument").toStrictEqual({});
  });

  // A — overrideAllState.
  it("A1: the count is the sum over pending cards; on only when every card with duties has its override on", () => {
    const duties = { scores: ["3038x:tag:X"], lists: [], concepts: ["39998:a", "39998:b"] };
    const cases: [PendingEdit, { count: number; on: boolean }][] = [
      [
        { scores: B, lists: B, concepts: B, everything: B },
        { count: 3, on: false },
      ],
      [
        { scores: B, lists: B, concepts: B, everything: B, override: { scores: true } },
        { count: 3, on: false },
      ],
      [
        { scores: B, lists: B, concepts: B, everything: B, override: { scores: true, concepts: true } },
        { count: 3, on: true },
      ],
      [
        { scores: B, lists: B, concepts: B, everything: B, override: { scores: true, lists: true, concepts: true } },
        { count: 3, on: true },
      ],
    ];
    for (const [pending, want] of cases) {
      expect(overrideAllState(duties, pending), JSON.stringify(pending.override ?? {})).toStrictEqual(want);
    }
    expect(
      overrideAllState(
        { scores: [], lists: [], concepts: [] },
        { scores: B, lists: B, concepts: B, everything: B, override: { scores: true } },
      ),
      "no duties",
    ).toStrictEqual({ count: 0, on: false });
  });

  // N — saveNote with the switches.
  it("N1: the backup switch is one change; with it on the note counts, even for all duties to one Assistant; overrides never count", () => {
    const cases: [PendingEdit, string][] = [
      [{ backups: true }, "1 unsaved change"],
      [{ scores: B, backups: true }, "2 unsaved changes"],
      [{ scores: B, lists: B, concepts: B, everything: B, backups: true }, "5 unsaved changes"],
      [
        { scores: B, lists: B, concepts: B, everything: B, override: { scores: true, lists: true } },
        "All duties → Bea",
      ],
      [{ scores: B, override: { scores: true } }, "1 unsaved change"],
      [{ override: { scores: true } }, "No changes yet"],
    ];
    for (const [pending, want] of cases) expect(saveNote(pending, nameOf), JSON.stringify(pending)).toBe(want);
  });
});

describe("treasure-map-save", () => {
  const BASE = {
    id: "9".repeat(64),
    pubkey: VIEWER,
    created_at: 1790121600,
    kind: 10040,
    content: "kept",
    sig: "f".repeat(128),
    tags: [["30382:rank", A, R0]],
  };
  const NOW = 1800000000;

  // K — the newer-Map check (saveTreasureMap.js's isNewer).
  it("K1: a different Map at the same time or later is newer; the same Map, or an older one, is not; any Map is newer than none", () => {
    const cases: [typeof BASE | null, typeof BASE | null, boolean, string][] = [
      [{ ...BASE, id: "8".repeat(64), created_at: BASE.created_at + 60 }, BASE, true, "later, another id"],
      [{ ...BASE, id: "8".repeat(64) }, BASE, true, "the same time, another id (to be safe)"],
      [BASE, BASE, false, "the same Map"],
      [{ ...BASE, id: "8".repeat(64), created_at: BASE.created_at - 60 }, BASE, false, "an older Map"],
      [null, BASE, false, "nothing found"],
      [BASE, null, true, "a Map where the page read none"],
      [null, null, false, "none, and none"],
    ];
    for (const [latest, base, want, label] of cases) expect(isNewerMap(latest, base), label).toBe(want);
  });

  // M — the timestamp rule (saveTreasureMap.js's stampFor).
  it("M1: now, unless the published Map is as new or newer — then one second after it; with no Map, now", () => {
    expect(stampTime(BASE, NOW), "an older Map").toBe(NOW);
    expect(stampTime({ ...BASE, created_at: NOW + 500 }, NOW), "a Map stamped in the future (clock skew)").toBe(
      NOW + 501,
    );
    expect(stampTime({ ...BASE, created_at: NOW }, NOW), "a Map stamped this second").toBe(NOW + 1);
    expect(stampTime(null, NOW), "no Map").toBe(NOW);
  });

  // P — planEdit's `changed`.
  const MAP = {
    ...BASE,
    content: "",
    tags: [
      ["30382:rank", A, R0],
      ["30392", VIEWER, R0],
      ["39998:dlist-header", VIEWER, R0],
      ["39998:restaurants", C, R0],
    ],
  };
  const noRelay = () => "";

  it("P1: changed — false with nothing pending, and for a pick that leaves the Map byte-identical; true for a real change", () => {
    const plan = (pending: PendingEdit, event: typeof MAP = MAP) =>
      planEdit({ event, viewer: VIEWER, pending, relayFor: noRelay });
    const cases: [PendingEdit, boolean, string][] = [
      [{}, false, "nothing pending"],
      [
        { concepts: VIEWER },
        true,
        "Concepts → the Assistant its own entry already names, on a Map without 39999: 39999 is added",
      ],
      [{ scores: B }, true, "Scores → B"],
      [{ backups: true }, false, "the backup switch on a Map with no backups"],
    ];
    for (const [pending, want, label] of cases) expect(plan(pending).changed, label).toBe(want);
    // Story 3 review, non-blocking 4: a pick that leaves the Map byte-identical changes nothing — for Concepts, once both
    // of its family entries (39998 and 39999, owner's request 2026-10-08) already name the pick.
    expect(
      plan({ concepts: VIEWER }, { ...MAP, tags: [...MAP.tags, ["39999", VIEWER, R0]] }).changed,
      "Concepts → the Assistant both its family entries already name",
    ).toBe(false);
    expect(
      plan({ backups: true }, { ...MAP, tags: [...MAP.tags, ["30382:rank", C, R0]] }).changed,
      "the backup switch on a Map with a backup",
    ).toBe(true);
  });
  it("P2: changed with no Map found — true once the edit adds a tag, false before", () => {
    expect(planEdit({ event: null, viewer: VIEWER, pending: {}, relayFor: noRelay }).changed, "nothing pending").toBe(
      false,
    );
    expect(
      planEdit({ event: null, viewer: VIEWER, pending: { lists: B }, relayFor: noRelay }).changed,
      "Lists → B",
    ).toBe(true);
  });

  // O — setOverrideAll(pending, on, duties) (book decision 18).
  it("O1: on turns on only the cards with duties; off clears all three; no empty override; input unchanged", () => {
    const start: PendingEdit = { scores: B, lists: B, concepts: B, everything: B, backups: true };
    const duties = { scores: ["3038x:tag:X"], lists: [], concepts: ["39998:d"] };
    const on = setOverrideAll(start, true, duties);
    expect(on.override, "on: { scores, concepts } only (Lists has no duties)").toStrictEqual({
      scores: true,
      concepts: true,
    });
    expect(on, "on kept the rest").toMatchObject({ backups: true, everything: B });
    const off = setOverrideAll({ ...on, override: { scores: true, lists: true, concepts: true } }, false, duties);
    expect(off, "off: no override key").not.toHaveProperty("override");
    expect(start, "setOverrideAll changed its input").not.toHaveProperty("override");
  });
});
