// @vitest-environment node
/**
 * The UI-side sliver of the relay's query grammar. The relay owns the
 * SEMANTICS (tokens pass through as typed); this module only recognizes
 * tokens well enough to let the Filters panel rewrite its own and to read
 * the current state back out of a query the user may have hand-edited.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { applyFilters, liftQuery, personAssist, readFilters } from "./searchSyntax";

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

// Discovered by probing the staging relay: from:/to:/#tag/since:/until: are
// NOT relay extensions — the SearchOverTrust page lifts them into plain NIP-01
// filter fields (authors, #p, #t, since, until) and the relay never sees the
// prefixes. Only sort:/observer:/include:spam/filter:rank: ride the search
// string. Our seam must lift identically or from: silently matches nothing.
describe("liftQuery", () => {
  const hex = "9".repeat(64);
  const npub = nip19.npubEncode(hex);

  it("lifts from: into authors (npub decoded to hex), keeping the text", () => {
    const lifted = liftQuery(`bugs from:${npub}`);
    expect(lifted.search).toBe("bugs");
    expect(lifted.authors).toEqual([hex]);
  });

  it("lifts to: into #p and #tag into #t (lowercased)", () => {
    const lifted = liftQuery(`gm to:${hex} #Bitcoin`);
    expect(lifted.search).toBe("gm");
    expect(lifted["#p"]).toEqual([hex]);
    expect(lifted["#t"]).toEqual(["bitcoin"]);
  });

  it("lifts day tokens to local-day epochs — until is INCLUSIVE of its day", () => {
    const lifted = liftQuery("x since:2026-01-02 until:2026-01-02");
    expect(lifted.search).toBe("x");
    expect(lifted.since).toBe(Math.floor(new Date(2026, 0, 2, 0, 0, 0).getTime() / 1000));
    expect(lifted.until).toBe(Math.floor(new Date(2026, 0, 2, 23, 59, 59).getTime() / 1000));
  });

  it("leaves the relay's own extensions in the search string", () => {
    const lifted = liftQuery(`btc sort:rank include:spam filter:rank:gte:10 observer:${hex}`);
    expect(lifted.search).toBe(`btc sort:rank include:spam filter:rank:gte:10 observer:${hex}`);
    expect(lifted.authors).toBeUndefined();
  });

  it("an unresolvable from: value stays as text rather than silently matching everything", () => {
    expect(liftQuery("from:not-a-key words").search).toBe("from:not-a-key words");
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
