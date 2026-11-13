import { describe, expect, it } from "vitest";

import { assistantsOf, dutiesSummary, othersOf, sidekickLine } from "./assistantDuties";

/**
 * "Your Assistants" on Settings › Assistants › Yours: which Assistant holds each
 * Duty category of the User's Treasure Map, one card per Assistant — this
 * deployment's own first — and one sentence saying where the Duties live.
 */
const HERE = "a".repeat(64);
const PROD = "b".repeat(64);
const EXT = "c".repeat(64);
const map = (tags: string[][]) => ({ tags });

describe("assistantsOf", () => {
  it("groups the Map's Duty categories by the Assistant holding them, this deployment's first", () => {
    const got = assistantsOf(
      map([
        ["30382:rank", PROD, "wss://scores.example"],
        ["30382:followers", PROD, "wss://scores.example"],
        ["30392", HERE, "wss://nip85.example"],
        ["39998", HERE, "wss://dcosl.example"],
      ]),
      HERE,
    );
    expect(got).toEqual([
      { pubkey: HERE, here: true, categories: ["lists", "concepts"] },
      { pubkey: PROD, here: false, categories: ["scores"] },
    ]);
  });

  it("always shows this deployment's Assistant, even holding nothing", () => {
    expect(assistantsOf(map([["30382:rank", EXT, "wss://x.example"]]), HERE)).toEqual([
      { pubkey: HERE, here: true, categories: [] },
      { pubkey: EXT, here: false, categories: ["scores"] },
    ]);
    expect(assistantsOf(null, HERE)).toEqual([{ pubkey: HERE, here: true, categories: [] }]);
  });

  /**
   * Read as the Duties view reads it (lib/treasureMap): each Duty goes to its
   * Preferred Assistant, by its own key or the most specific one covering it.
   * A group split between two Assistants is held by both — it read under
   * whoever the group's first row named, so on a Map where production kept
   * rank and followers and this site filled the rest, this site's Assistant
   * showed as holding nothing.
   */
  it("gives a split group to every Assistant holding one of its Duties", () => {
    const got = assistantsOf(
      map([
        ["30382:rank", PROD, "wss://scores.example"],
        ["30382:followers", PROD, "wss://scores.example"],
        ["30382:hops", HERE, "wss://nip85.example"],
        ["30382:muters", HERE, "wss://nip85.example"],
        ["30382:reporters", HERE, "wss://nip85.example"],
      ]),
      HERE,
    );
    expect(got).toEqual([
      { pubkey: HERE, here: true, categories: ["scores"] },
      { pubkey: PROD, here: false, categories: ["scores"] },
    ]);
  });

  it("reads a Duty given through a family key or `*`", () => {
    expect(assistantsOf(map([["3039x", EXT, "wss://x.example"]]), HERE)).toEqual([
      { pubkey: HERE, here: true, categories: [] },
      { pubkey: EXT, here: false, categories: ["lists"] },
    ]);
    // Everything: every group, beside whoever holds a Duty of its own.
    expect(
      assistantsOf(
        map([
          ["*", EXT, ""],
          ["30382:rank", HERE, "wss://nip85.example"],
        ]),
        HERE,
      ),
    ).toEqual([
      { pubkey: HERE, here: true, categories: ["scores"] },
      { pubkey: EXT, here: false, categories: ["scores", "lists", "concepts"] },
    ]);
  });

  it("an Alternate holds nothing: the Duty is its Preferred's", () => {
    const got = assistantsOf(
      map([
        ["30382:rank", PROD, "wss://scores.example"],
        ["30382:rank", EXT, "wss://x.example"],
      ]),
      HERE,
    );
    expect(got).toEqual([
      { pubkey: HERE, here: true, categories: [] },
      { pubkey: PROD, here: false, categories: ["scores"] },
    ]);
  });

  it("lists more Assistants than there are groups, in the Map's order", () => {
    const D = "d".repeat(64);
    const E = "e".repeat(64);
    const got = assistantsOf(
      map([
        ["30382:rank", PROD, "wss://a.example"],
        ["30382:followers", EXT, "wss://b.example"],
        ["30392", D, "wss://c.example"],
        ["30393", E, "wss://d.example"],
      ]),
      HERE,
    );
    expect(got.map((a) => a.pubkey)).toEqual([HERE, PROD, EXT, D, E]);
  });
});

describe("dutiesSummary", () => {
  const site = (pk: string) => (pk === PROD ? "brainstorm.nosfabrica.com" : null);
  const name = (pk: string) => (pk === EXT ? "Pip's Assistant" : pk.slice(0, 6));

  it("says when everything happens on this site", () => {
    expect(dutiesSummary([{ pubkey: HERE, here: true, categories: ["scores", "lists", "concepts"] }], site, name)).toBe(
      "Everything your Assistant does for you happens on this site.",
    );
  });

  it("says where each category comes from, by verified site, else by name", () => {
    expect(
      dutiesSummary(
        [
          { pubkey: HERE, here: true, categories: ["lists", "concepts"] },
          { pubkey: PROD, here: false, categories: ["scores"] },
        ],
        site,
        name,
      ),
    ).toBe("Scores come from brainstorm.nosfabrica.com. Lists and Concepts come from this site.");
    expect(
      dutiesSummary(
        [
          { pubkey: HERE, here: true, categories: [] },
          { pubkey: EXT, here: false, categories: ["scores", "lists"] },
        ],
        site,
        name,
      ),
    ).toBe("Scores and Lists come from Pip's Assistant. Nobody has Concepts yet.");
  });

  it("names every Assistant a split group comes from, this site first", () => {
    expect(
      dutiesSummary(
        [
          { pubkey: HERE, here: true, categories: ["scores", "lists"] },
          { pubkey: PROD, here: false, categories: ["scores"] },
        ],
        site,
        name,
      ),
    ).toBe(
      "Scores come from this site and brainstorm.nosfabrica.com. Lists come from this site. Nobody has Concepts yet.",
    );
  });
});

/**
 * The line under "Your Brainstorm Assistant": what this deployment's Assistant
 * publishes for the User — the Duty categories their Treasure Map gives it.
 * It said "publishing your scores" whenever its profile was out, true or not.
 */
describe("sidekickLine", () => {
  it("names what this site's Assistant publishes", () => {
    expect(sidekickLine(["scores"])).toBe("Your sidekick is publishing your scores.");
    expect(sidekickLine(["lists", "concepts"])).toBe("Your sidekick is publishing your lists and concepts.");
    expect(sidekickLine(["scores", "lists", "concepts"])).toBe(
      "Your sidekick is publishing your scores, lists and concepts.",
    );
  });

  it("says so when the Treasure Map gives it nothing here", () => {
    expect(sidekickLine([])).toBe(
      "Your sidekick is set up, but your Treasure Map gives it nothing to publish here yet.",
    );
  });

  it("claims nothing before the Treasure Map is read", () => {
    expect(sidekickLine(null)).toBe("Your sidekick is set up.");
  });
});

/**
 * The Yours view grows with the User: one card while everything happens on
 * this site, and "Also working for you" only once another Assistant holds a
 * Duty — this site's Assistant is the big card above, never repeated.
 */
describe("othersOf", () => {
  it("is the other Assistants holding a Duty, never this site's", () => {
    expect(
      othersOf([
        { pubkey: HERE, here: true, categories: ["lists"] },
        { pubkey: PROD, here: false, categories: ["scores"] },
      ]),
    ).toEqual([{ pubkey: PROD, here: false, categories: ["scores"] }]);
  });

  it("is empty when everything happens on this site", () => {
    expect(othersOf([{ pubkey: HERE, here: true, categories: ["scores", "lists", "concepts"] }])).toEqual([]);
    expect(othersOf([{ pubkey: HERE, here: true, categories: [] }])).toEqual([]);
  });
});
