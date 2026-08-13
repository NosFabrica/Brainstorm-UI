import { describe, expect, it } from "vitest";
import { matchTags, type TagSummary } from "./tags";

/**
 * The list/query split lives partly in `matchTags`, and this is the half of it
 * that is pure enough to pin down. The rule under test: **how well the name
 * matches outranks who made the tag.**
 *
 * It exists because the opposite behaviour shipped. `lfo` — 54 people, the
 * second most-used tag on the hub — has an unscored creator, and while
 * unscored tags were dropped outright, typing its exact name returned nothing
 * at all. Ranking is what keeps it findable now that they're merely marked.
 */

const tag = (name: string, over: Partial<TagSummary> = {}): TagSummary => ({
  key: `k:${name}`,
  authorPubkey: "a".repeat(64),
  slug: name.toLowerCase(),
  name,
  people: 1,
  vouches: 1,
  sharesName: 1,
  unverified: false,
  ...over,
});

const names = (rows: TagSummary[]) => rows.map((r) => r.name);

describe("matchTags", () => {
  it("puts an exact match first even when its creator is unknown", () => {
    const index = [
      tag("LFO Collective"),
      tag("Old LFO Crew"),
      tag("LFO", { unverified: true, people: 54 }),
    ];
    expect(names(matchTags(index, "LFO"))[0]).toBe("LFO");
  });

  it("orders exact, then starts-with, then contains", () => {
    const index = [tag("Not An LFO"), tag("LFO Collective"), tag("LFO")];
    expect(names(matchTags(index, "lfo"))).toEqual(["LFO", "LFO Collective", "Not An LFO"]);
  });

  it("prefers a vouched-for creator only when the match quality is equal", () => {
    const index = [tag("Musician A", { unverified: true }), tag("Musician B")];
    expect(names(matchTags(index, "musician"))).toEqual(["Musician B", "Musician A"]);
  });

  it("does not let creator standing beat a better name match", () => {
    const index = [
      tag("Bitcoin Musician"), // contains, vouched
      tag("Music", { unverified: true }), // starts-with, unknown creator
    ];
    expect(names(matchTags(index, "music"))[0]).toBe("Music");
  });

  it("keeps usage order among equally-matching tags of the same standing", () => {
    const index = [
      tag("Music One", { people: 3 }),
      tag("Music Two", { people: 99 }),
    ];
    // The catalogue arrives pre-sorted by usage; the sort must be stable
    // rather than re-deriving an order of its own.
    expect(names(matchTags(index, "music"))).toEqual(["Music One", "Music Two"]);
  });

  it("stays silent under two characters, so opening a search box costs nothing", () => {
    expect(matchTags([tag("LFO", { unverified: true })], "L")).toEqual([]);
  });

  it("honours the cap", () => {
    const index = Array.from({ length: 10 }, (_, i) => tag(`Music ${i}`));
    expect(matchTags(index, "music", 3)).toHaveLength(3);
  });
});
