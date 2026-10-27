/**
 * A Treasure Map read as duties, by the Treasure Maps grammar the Treasure Map
 * tab reads it with (lib/treasureMapCards) — Tapestry's own pinned cases
 * (test/my-assistants-map.test.js) where the grammar agrees with them — and
 * the duties the reader's Brainstorm Assistant offers that the Map doesn't name.
 */
import { describe, expect, it } from "vitest";
import {
  assistantRole,
  dutiesOf,
  dutySentence,
  mapOnlyAssistants,
  offeredDuties,
  treasureMapDuties,
} from "./treasureMap";

const A = "c1".repeat(32); // listed, tagged
const B = "c2".repeat(32); // listed, tagged
const D = "d1".repeat(32); // on the Map, not listed
const E = "d2".repeat(32); // on the Map, not listed
const LOCAL = "a2".repeat(32); // listed, no duties
const R = "wss://relay.example";

/** Every entry class, a repeated key, a repeated delegate, and three entries the app can't place. Order is the Map's. */
const MAP = {
  kind: 10040,
  tags: [
    ["30382:rank", A, R],
    ["30382:rank", B, R],
    ["30382:rank", A, R],
    ["30392", D, R],
    ["30382", B, R],
    ["39998:dog-breed", A, R],
    ["39998:dlist-header", D, R],
    ["30392:podcasters", B, R],
    ["30383:rank", D, R],
    ["30382:followers", A, R],
    ["99999", A, R],
    ["30382:hops", "not-a-key", R],
    ["d", "something"],
    ["30394", E, R],
  ],
};
const ORDER = [
  "30382",
  "30392",
  "30394",
  "39998",
  "30382:rank",
  "30383:rank",
  "30382:followers",
  "30392:podcasters",
  "39998:dog-breed",
];

describe("treasureMapDuties", () => {
  it("is one duty per placeable key, most generic first", () => {
    expect(treasureMapDuties(MAP).map((d) => d.key)).toEqual(ORDER);
  });

  it("drops entries the app can't place", () => {
    const keys = treasureMapDuties(MAP).map((d) => d.key);
    for (const k of ["99999", "30382:hops", "d"]) expect(keys).not.toContain(k);
  });

  it("lists a duty's delegates in Map order without repeats, keeping every raw entry", () => {
    const rank = treasureMapDuties(MAP).find((d) => d.key === "30382:rank")!;
    expect(rank.assistants).toEqual([A, B]);
    expect(rank.entries).toHaveLength(3);
  });

  it("gives each duty its group and level", () => {
    const by = Object.fromEntries(treasureMapDuties(MAP).map((d) => [d.key, [d.group, d.level]]));
    expect(by).toEqual({
      "30382": ["scores", "Scope"],
      "30392": ["lists", "Scope"],
      "30394": ["lists", "Scope"],
      "39998": ["concepts", "Scope"],
      "30382:rank": ["scores", "Exact"],
      "30383:rank": ["scores", "Exact"],
      "30382:followers": ["scores", "Exact"],
      "30392:podcasters": ["lists", "Exact"],
      "39998:dog-breed": ["concepts", "Exact"],
    });
  });

  it("names each duty and says what it covers", () => {
    const by = Object.fromEntries(treasureMapDuties(MAP).map((d) => [d.key, [d.title, d.what]]));
    expect(by).toEqual({
      "30382": ["All Scores about profiles", "every Score about profiles, except where this Map says otherwise."],
      "30392": ["All Lists of profiles", "every Trusted List of profiles, except where this Map says otherwise."],
      "30394": [
        "All Lists of addressable events",
        "every Trusted List of addressable events, except where this Map says otherwise.",
      ],
      "39998": [
        "All Concept headers",
        "my Concept Graph — my DList headers and the items filed under them, except where this Map says otherwise.",
      ],
      "30382:rank": ["rank", "a rank for every profile, as seen from my trusted community."],
      "30383:rank": ["rank", "a rank for every event, as seen from my trusted community."],
      "30382:followers": ["followers", "a “followers” score for every profile."],
      "30392:podcasters": ["podcasters", "the Trusted List “podcasters” of profiles."],
      "39998:dog-breed": [
        "Curated DList: dog-breed",
        "my curated copy of dog-breed: its header, and a copy of each item.",
      ],
    });
  });

  it("gives no duties for no Map, an empty one, or garbage", () => {
    for (const ev of [null, undefined, {}, { kind: 10040, tags: [] }, { kind: 10040, tags: "nonsense" }]) {
      expect(treasureMapDuties(ev)).toEqual([]);
    }
  });

  it("reads the Map Brainstorm itself publishes", () => {
    const ta = "f".repeat(64);
    const duties = treasureMapDuties({
      tags: [
        ["30382:rank", ta, R],
        ["30382:followers", ta, R],
        ["30392", ta, R],
      ],
    });
    expect(duties.map((d) => [d.key, d.title])).toEqual([
      ["30392", "All Lists of profiles"],
      ["30382:rank", "rank"],
      ["30382:followers", "followers"],
    ]);
  });
});

describe("one Assistant's duties", () => {
  const duties = treasureMapDuties(MAP);

  it("groups an Assistant's duties, as Preferred or Alternate, with a count", () => {
    const a = dutiesOf(A, duties);
    expect(a.count).toBe(3);
    expect(a.scores.map((d) => d.key)).toEqual(["30382:rank", "30382:followers"]);
    expect(a.lists).toEqual([]);
    expect(a.concepts.map((d) => d.key)).toEqual(["39998:dog-breed"]);
    const b = dutiesOf(B, duties);
    expect(b.count).toBe(3);
    expect(b.scores.map((d) => d.key)).toEqual(["30382", "30382:rank"]);
    expect(dutiesOf(LOCAL, duties).count).toBe(0);
  });

  it("finds the delegates not listed, with their counts, in first-appearance order", () => {
    const got = mapOnlyAssistants(duties, new Set([A, B, LOCAL]));
    expect(got).toEqual([
      { pubkey: D, count: 3 },
      { pubkey: E, count: 1 },
    ]);
    expect(mapOnlyAssistants([], new Set([A]))).toEqual([]);
  });
});

describe("the Duties view's words", () => {
  const names: Record<string, string> = { [A]: "Ava", [B]: "Bea", [D]: "Dee" };
  const nameOf = (pk: string) => names[pk] ?? "npub…";

  it("says a duty as a sentence, Alternates joined by “, then”", () => {
    expect(
      dutySentence({ what: "a rank for every profile, as seen from my trusted community.", assistants: [A] }, nameOf),
    ).toBe("I entrust Ava to publish and maintain a rank for every profile, as seen from my trusted community.");
    expect(dutySentence({ what: "x.", assistants: [A, B, D] }, nameOf)).toBe(
      "I entrust Ava to publish and maintain x. If it can’t, ask Bea, then Dee.",
    );
  });

  it("labels Preferred, then Alternates numbered only when there are several", () => {
    expect([0, 1].map((i) => assistantRole(i, 2))).toEqual(["Preferred", "Alternate"]);
    expect([0, 1, 2].map((i) => assistantRole(i, 3))).toEqual(["Preferred", "Alternate 1", "Alternate 2"]);
  });
});

describe("the grammar the Treasure Map tab reads", () => {
  const keys = (tags: string[][]) => treasureMapDuties({ tags }).map((d) => [d.key, d.group, d.level, d.title]);

  it("a bare 39998 is every Concept header, 39998:dlist-header the same key; a bare 39999 those declared as items", () => {
    const duties = treasureMapDuties({
      tags: [
        ["39998", A, R],
        ["39998:dlist-header", B, R],
        ["39999", D, R],
      ],
    });
    expect(duties.map((d) => [d.key, d.group, d.level, d.title])).toEqual([
      ["39998", "concepts", "Scope", "All Concept headers"],
      ["39999", "concepts", "Scope", "Concept headers declared as items"],
    ]);
    expect(duties[0].assistants).toEqual([A, B]);
    expect(duties[0].entries).toHaveLength(2);
  });

  it("families and a bare * are duties, most generic first", () => {
    expect(
      keys([
        ["30382:rank", A, R],
        ["3038x", B, R],
        ["3039x", D, R],
        ["*", E, R],
      ]),
    ).toEqual([
      ["*", "everything", "Scope", "Everything"],
      ["3038x", "scores", "Scope", "All Scores"],
      ["3039x", "lists", "Scope", "All Lists"],
      ["30382:rank", "scores", "Exact", "rank"],
    ]);
  });

  it("a system with no value is a scope; a value narrows it", () => {
    expect(
      keys([
        ["30396:tag", A, R],
        ["30396:tag::", B, R],
        ["30396:tag:⟨Recipes⟩:⟨Mexican⟩", D, R],
      ]),
    ).toEqual([
      ["30396:tag", "lists", "Scope", "All Lists of content categories (tag)"],
      ["30396:tag:⟨Recipes⟩:⟨Mexican⟩", "lists", "Exact", "tag:⟨Recipes⟩:⟨Mexican⟩"],
    ]);
  });

  it("keys that name nothing aren't duties", () => {
    expect(
      keys([
        ["39998:", A, R],
        ["39999:", A, R],
        ["39999:dlist-header", A, R],
        ["39999:duty-menu", A, R],
        ["*:tag", A, R],
        ["39998:duty-menu", B, R],
      ]),
    ).toEqual([["39998:duty-menu", "concepts", "Exact", "Curated DList: duty-menu"]]);
  });
});

describe("what the Brainstorm Assistant offers", () => {
  const BS = "b5".repeat(32);
  const SETUP = [
    ["30382:rank", BS, R],
    ["30382:followers", BS, R],
    ["30382:reporters", BS, R],
    ["30382:muters", BS, R],
    ["30382:hops", BS, R],
    ["30392", BS, R],
  ];
  const offered = offeredDuties(SETUP);
  const byKey = (tags: string[][]) => Object.fromEntries(treasureMapDuties({ tags }, offered).map((d) => [d.key, d]));

  it("is the server's /setup rows, and the Concept duties planned for the same Assistant", () => {
    expect(offered.map((o) => o.key)).toEqual([
      "30382:rank",
      "30382:followers",
      "30382:reporters",
      "30382:muters",
      "30382:hops",
      "30392",
      "39998",
      "39999",
    ]);
    expect(new Set(offered.map((o) => o.pubkey))).toEqual(new Set([BS]));
    expect(offeredDuties(undefined)).toEqual([]);
    expect(offeredDuties([["30382:rank", "not-a-key", R], "garbage"])).toEqual([]);
  });

  it("with no Map, every one is unassigned", () => {
    const duties = treasureMapDuties(null, offered);
    expect(duties).toHaveLength(8);
    for (const d of duties) {
      expect(d.assistants).toEqual([]);
      expect(d.through).toBeNull();
      expect(d.offeredBy).toBe(BS);
    }
  });

  it("one the Map names by its own key is the Map's duty, marked offered", () => {
    const d = byKey([["30382:rank", A, R]]);
    expect(d["30382:rank"]).toMatchObject({ assistants: [A], offeredBy: BS, through: null });
  });

  it("one the Map covers with a broader key is that key's, the most specific winning", () => {
    const d = byKey([
      ["*", E, R],
      ["3038x", B, R],
      ["30382:rank", A, R],
    ]);
    expect(d["30382:followers"]).toMatchObject({ assistants: [B], through: "3038x" });
    expect(d["30392"]).toMatchObject({ assistants: [E], through: "*" });
    expect(d["39998"]).toMatchObject({ assistants: [E], through: "*" });
    expect(
      byKey([
        ["30382", D, R],
        ["3038x", B, R],
      ])["30382:hops"],
    ).toMatchObject({ through: "30382" });
  });

  it("a bare 39998 covers the 39999 headers, below a 39999 key", () => {
    expect(byKey([["39998:dlist-header", D, R]])["39999"]).toMatchObject({ assistants: [D], through: "39998" });
    expect(
      byKey([
        ["39998", D, R],
        ["39999", A, R],
      ])["39999"],
    ).toMatchObject({ assistants: [A], through: null });
  });

  it("a narrower key covers only part of it, so it stays unassigned", () => {
    const d = byKey([
      ["30392:podcasters", A, R],
      ["30392:tag", A, R],
      ["39998:dog-breed", A, R],
      ["30383", A, R],
    ]);
    for (const key of ["30392", "39998", "39999", "30382:rank"])
      expect(d[key]).toMatchObject({ assistants: [], through: null });
  });

  it("comes after the Map's duties at its level, and isn't counted again for the covering Assistant", () => {
    const duties = treasureMapDuties({ tags: [["3038x", B, R]] }, offered);
    expect(duties.map((d) => d.key)).toEqual([
      "3038x",
      "30392",
      "39998",
      "39999",
      "30382:rank",
      "30382:followers",
      "30382:reporters",
      "30382:muters",
      "30382:hops",
    ]);
    expect(dutiesOf(B, duties).count).toBe(1);
    expect(mapOnlyAssistants(duties, new Set())).toEqual([{ pubkey: B, count: 1 }]);
  });

  it("says an unassigned duty as no one entrusted", () => {
    expect(dutySentence({ what: "x.", assistants: [] }, () => "?")).toBe(
      "No Assistant is entrusted to publish and maintain x.",
    );
  });
});
