import { describe, expect, it } from "vitest";

import { assistantsOf, dutiesSummary } from "./assistantDuties";

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

  it("reads a category under the Assistant it names first, as the Treasure Map does", () => {
    const got = assistantsOf(
      map([
        ["30382:rank", PROD, "wss://scores.example"],
        ["30382:followers", EXT, "wss://x.example"],
      ]),
      HERE,
    );
    expect(got.find((a) => a.pubkey === PROD)?.categories).toEqual(["scores"]);
    expect(got.find((a) => a.pubkey === EXT)).toBeUndefined();
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
});
