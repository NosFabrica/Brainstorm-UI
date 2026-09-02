// @vitest-environment node
/**
 * The UI-side sliver of the relay's query grammar. The relay owns the
 * SEMANTICS (tokens pass through as typed); this module only recognizes
 * tokens well enough to let the Filters panel rewrite its own and to read
 * the current state back out of a query the user may have hand-edited.
 */
import { describe, expect, it } from "vitest";
import { applyFilters, personAssist, readFilters } from "./searchSyntax";

describe("applyFilters", () => {
  it("appends filter tokens after the text, visibly teaching the grammar", () => {
    expect(applyFilters("bitcoin mining", { sort: "recent" })).toBe("bitcoin mining sort:recent");
    expect(
      applyFilters("bitcoin", { since: "2026-01-01", until: "2026-02-01", minRank: 50, includeSpam: true }),
    ).toBe("bitcoin since:2026-01-01 until:2026-02-01 filter:rank:gte:50 include:spam");
  });

  it("replaces its own tokens instead of stacking duplicates", () => {
    expect(applyFilters("bitcoin sort:recent", { sort: "rank" })).toBe("bitcoin sort:rank");
    expect(applyFilters("a since:2026-01-01 b", { since: "2026-03-03" })).toBe("a b since:2026-03-03");
  });

  it("clears a token when its value is unset, leaving the rest untouched", () => {
    expect(applyFilters("btc sort:recent filter:rank:gte:20", { sort: null })).toBe(
      "btc filter:rank:gte:20",
    );
    expect(applyFilters("btc include:spam", { includeSpam: false })).toBe("btc");
  });

  it("writes an observer for Rank-as and removes it when reset", () => {
    const hex = "a".repeat(64);
    expect(applyFilters("jack", { rankAs: hex })).toBe(`jack observer:${hex}`);
    expect(applyFilters(`jack observer:${hex}`, { rankAs: null })).toBe("jack");
  });

  it("leaves tokens it wasn't asked about alone", () => {
    expect(applyFilters("jack from:npub1abc sort:recent", { minRank: 10 })).toBe(
      "jack from:npub1abc sort:recent filter:rank:gte:10",
    );
  });
});

describe("personAssist — the from:/to: people picker trigger", () => {
  it("offers to complete a name fragment being typed after from: or to:", () => {
    const assist = personAssist("bugs from:ja");
    expect(assist).toMatchObject({ prefix: "from", fragment: "ja" });
    expect(assist!.complete("npub1jack")).toBe("bugs from:npub1jack");

    expect(personAssist("to:mar")!.complete("npub1maria")).toBe("to:npub1maria");
  });

  it("stays quiet when there's nothing to help with", () => {
    expect(personAssist("plain words")).toBeNull();
    expect(personAssist("from:")).toBeNull(); // nothing typed yet
    expect(personAssist("from:npub1already sorted")).toBeNull(); // not the last token
    // Already a key — the page wrote it; no second offer.
    expect(personAssist("from:npub1abcdef")).toBeNull();
    expect(personAssist(`from:${"a".repeat(64)}`)).toBeNull();
  });
});

describe("readFilters", () => {
  it("reads the panel's state back out of a hand-edited query", () => {
    expect(readFilters("btc sort:rank since:2026-01-01 filter:rank:gte:30 include:spam")).toEqual({
      sort: "rank",
      since: "2026-01-01",
      until: null,
      minRank: 30,
      includeSpam: true,
      rankAs: null,
    });
    expect(readFilters("plain words")).toEqual({
      sort: null,
      since: null,
      until: null,
      minRank: null,
      includeSpam: false,
      rankAs: null,
    });
  });
});
