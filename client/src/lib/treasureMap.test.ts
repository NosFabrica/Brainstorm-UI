/**
 * A Treasure Map read as duties — the cases Tapestry's own suite pins
 * (test/my-assistants-map.test.js), so the two apps agree on one Map.
 */
import { describe, expect, it } from "vitest";
import {
  assistantRole,
  classifyEntry,
  dutiesOf,
  dutySentence,
  mapOnlyAssistants,
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
  "39998:dlist-header",
  "30382:rank",
  "30383:rank",
  "30382:followers",
  "30392:podcasters",
  "39998:dog-breed",
];

describe("classifyEntry", () => {
  it("places each kind, and anything without a valid delegate is other", () => {
    expect(classifyEntry(["30382:rank", A.toUpperCase(), R])).toMatchObject({
      raw: "30382:rank",
      kind: 30382,
      name: "rank",
      cls: "ta",
      pubkey: A,
      relay: R,
    });
    expect(classifyEntry(["30392", A]).cls).toBe("tl");
    expect(classifyEntry(["39998:dlist-header", A]).cls).toBe("designation");
    expect(classifyEntry(["39999:dog-breed", A]).cls).toBe("dlist");
    expect(classifyEntry(["39998", A]).cls).toBe("other");
    expect(classifyEntry(["30382:rank", "nope"]).cls).toBe("other");
    expect(classifyEntry(null).cls).toBe("other");
  });
});

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
      "39998:dlist-header": ["concepts", "Scope"],
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
      "39998:dlist-header": [
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
