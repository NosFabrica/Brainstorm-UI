// @vitest-environment node
/**
 * The UI-side sliver of the relay's query grammar. The relay owns the
 * SEMANTICS (tokens pass through as typed); this module only recognizes
 * tokens well enough to let the Filters panel rewrite its own and to read
 * the current state back out of a query the user may have hand-edited.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { activeFilterCount, applyFilters, browseSafeQuery, datePreset, liftQuery, personAssist, personScope, readFilters, scopeOf, scopedPlaceholder, scopedSearchHref, seeAllLabel, sinceForPreset, splitFilters } from "./searchSyntax";

// Probed 2026-09-03: the relay ignores filter:rank and knows no hops. The
// controls that need those are done on the CLIENT, but still speak grammar —
// trust:verified and reach:follows|friends ride the box like every other
// token, and liftQuery keeps them off the wire (sent as text they'd match
// nothing).
describe("client-side filter tokens", () => {
  it("writes and reads trust:verified and reach:", () => {
    expect(applyFilters("bitcoin", { verifiedOnly: true })).toBe("bitcoin trust:verified");
    expect(applyFilters("bitcoin trust:verified", { verifiedOnly: false })).toBe("bitcoin");
    expect(applyFilters("bitcoin", { reach: "follows" })).toBe("bitcoin reach:follows");
    expect(applyFilters("bitcoin reach:follows", { reach: "friends" })).toBe("bitcoin reach:friends");
    expect(applyFilters("bitcoin reach:friends", { reach: null })).toBe("bitcoin");
    const state = readFilters("btc trust:verified reach:friends sort:recent");
    expect(state.verifiedOnly).toBe(true);
    expect(state.reach).toBe("friends");
    expect(readFilters("btc").reach).toBeNull();
    expect(readFilters("btc reach:nonsense").reach).toBeNull();
  });

  it("keeps client-only tokens off the wire", () => {
    const lifted = liftQuery("liverpool trust:verified reach:follows sort:recent");
    expect(lifted.search).toBe("liverpool sort:recent");
  });
});

// Benjamin: filters must not appear as text in the search box — it looks bad.
// The box shows the words; the filters ride beside them (state + URL), so
// the page needs to take a full query apart and count what's active.
describe("splitFilters / activeFilterCount", () => {
  it("separates the words from every filter token, preserving both", () => {
    expect(splitFilters("Melvin Carvalho trust:verified sort:recent")).toEqual({
      text: "Melvin Carvalho",
      tokens: "trust:verified sort:recent",
    });
    expect(splitFilters("from:npub1abc gm #bitcoin")).toEqual({ text: "from:npub1abc gm #bitcoin", tokens: "" });
    expect(splitFilters("  ")).toEqual({ text: "", tokens: "" });
  });

  it("counts the filters a person has switched on", () => {
    expect(activeFilterCount(readFilters("btc"))).toBe(0);
    expect(activeFilterCount(readFilters("btc sort:rank trust:verified"))).toBe(2);
    expect(activeFilterCount(readFilters(`btc since:2026-01-01 until:2026-02-01 reach:follows include:spam observer:${"a".repeat(64)}`))).toBe(4);
  });
});

// Google's Tools menu, not two calendars: Any time · Past 24 hours · Past
// week · Past month · Past year · Custom. Same since:/until: tokens beneath.
describe("date presets", () => {
  const now = new Date(2026, 8, 3, 12, 0, 0); // 2026-09-03 local
  it("names the preset a since/until pair means", () => {
    expect(datePreset({ since: null, until: null }, now)).toBe("any");
    expect(datePreset({ since: "2026-09-02", until: null }, now)).toBe("day");
    expect(datePreset({ since: "2026-08-27", until: null }, now)).toBe("week");
    expect(datePreset({ since: "2026-08-03", until: null }, now)).toBe("month");
    expect(datePreset({ since: "2025-09-03", until: null }, now)).toBe("year");
    expect(datePreset({ since: "2026-01-01", until: null }, now)).toBe("custom");
    expect(datePreset({ since: "2026-08-27", until: "2026-09-01" }, now)).toBe("custom");
  });

  it("computes the since day for a preset", () => {
    expect(sinceForPreset("day", now)).toBe("2026-09-02");
    expect(sinceForPreset("week", now)).toBe("2026-08-27");
    expect(sinceForPreset("month", now)).toBe("2026-08-03");
    expect(sinceForPreset("year", now)).toBe("2025-09-03");
    expect(sinceForPreset("any", now)).toBeNull();
  });
});

describe("applyFilters", () => {
  it("appends filter tokens after the text, visibly teaching the grammar", () => {
    expect(applyFilters("bitcoin mining", { sort: "recent" })).toBe("bitcoin mining sort:recent");
    expect(
      applyFilters("bitcoin", { since: "2026-01-01", until: "2026-02-01", verifiedOnly: true, includeSpam: true }),
    ).toBe("bitcoin since:2026-01-01 until:2026-02-01 trust:verified include:spam");
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
    expect(applyFilters("jack from:npub1abc sort:recent", { verifiedOnly: true })).toBe(
      "jack from:npub1abc sort:recent trust:verified",
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
      verifiedOnly: false,
      reach: null,
      includeSpam: true,
      rankAs: null,
    });
    expect(readFilters("plain words")).toEqual({
      sort: null,
      since: null,
      until: null,
      verifiedOnly: false,
      reach: null,
      includeSpam: false,
      rankAs: null,
    });
  });
});

describe("browseSafeQuery", () => {
  // Probed 2026-09-05: the relay never answers a wordless browse sorted by
  // rank or followers, and a hung request stalls every other request on the
  // same connection. Browse falls back to newest; words keep their sort.
  it("a wordless browse cannot be rank- or follower-sorted — it falls back to newest first", () => {
    expect(readFilters(browseSafeQuery("sort:rank")).sort).toBe("recent");
    const kept = readFilters(browseSafeQuery("sort:followers trust:verified"));
    expect(kept.sort).toBe("recent");
    expect(kept.verifiedOnly).toBe(true);
    expect(browseSafeQuery("sort:recent")).toBe("sort:recent");
    expect(browseSafeQuery("")).toBe("");
  });
  it("a query with words keeps whatever sort it asked for", () => {
    expect(browseSafeQuery("bitcoin sort:rank")).toBe("bitcoin sort:rank");
    expect(browseSafeQuery("bitcoin sort:followers")).toBe("bitcoin sort:followers");
  });
});

describe("a person scope — a search that is one person's work in one vertical", () => {
  // The public profile's "View all" hands the search a scope, not a name:
  // "joe martin" as words pulls in strangers' articles; from:npub… is his.
  const hex = "3".repeat(64);
  const npub = nip19.npubEncode(hex);
  it("personScope reads a query that is exactly one from: key", () => {
    expect(personScope(`from:${npub}`)).toBe(hex);
    expect(personScope(`  from:${hex} `)).toBe(hex);
  });
  it("words, a second key, a tag or a date beside it make it a search, not a scope", () => {
    expect(personScope(`from:${npub} liverpool`)).toBeNull();
    expect(personScope(`from:${npub} from:${nip19.npubEncode("4".repeat(64))}`)).toBeNull();
    expect(personScope(`from:${npub} #nostr`)).toBeNull();
    expect(personScope(`from:${npub} since:2026-01-01`)).toBeNull();
    expect(personScope(`to:${npub}`)).toBeNull();
    expect(personScope("joe martin")).toBeNull();
    expect(personScope("")).toBeNull();
  });
  it("scopedSearchHref is the search page, scoped to the person, on the vertical", () => {
    expect(scopedSearchHref(hex, "articles")).toBe(`/?q=from%3A${npub}&t=articles`);
    expect(scopedSearchHref(hex, "music")).toBe(`/?q=from%3A${npub}&t=music`);
  });
});

describe("scopeOf — the one from: token the box shows as a person, and the words beside it", () => {
  const hex = "3".repeat(64);
  const npub = nip19.npubEncode(hex);
  it("splits the scope from the words, keeping the token as typed", () => {
    expect(scopeOf(`from:${npub} alone in valentine`)).toEqual({ pubkey: hex, token: `from:${npub}`, rest: "alone in valentine" });
    expect(scopeOf(`valentine from:${npub}`)).toEqual({ pubkey: hex, token: `from:${npub}`, rest: "valentine" });
    expect(scopeOf(`from:${npub}`)).toEqual({ pubkey: hex, token: `from:${npub}`, rest: "" });
  });
  it("two keys, a to:, or no key at all is not a scope", () => {
    expect(scopeOf(`from:${npub} from:${nip19.npubEncode("4".repeat(64))}`)).toBeNull();
    expect(scopeOf(`to:${npub}`)).toBeNull();
    expect(scopeOf("joe martin")).toBeNull();
    expect(scopeOf("from:nobody")).toBeNull();
  });
});

// The box scoped to a person says what typing will do ON THIS TAB, with their
// name — Facebook's "Search Sam's profile", YouTube's channel search. Never
// the raw key, and never a blank while the name is still arriving.
describe("scopedPlaceholder — the empty scoped box, per tab, with their name", () => {
  it("Everything and People search everything from them", () => {
    expect(scopedPlaceholder("everything", "means")).toBe("Search everything from means");
    expect(scopedPlaceholder("people", "means")).toBe("Search everything from means");
  });
  it("a content tab names its kind", () => {
    expect(scopedPlaceholder("notes", "means")).toBe("Search means's notes");
    expect(scopedPlaceholder("articles", "means")).toBe("Search means's articles");
    expect(scopedPlaceholder("media", "means")).toBe("Search means's media");
    expect(scopedPlaceholder("music", "means")).toBe("Search means's music");
    expect(scopedPlaceholder("live", "means")).toBe("Search means's live streams");
    expect(scopedPlaceholder("shop", "means")).toBe("Search means's shop");
  });
  it("an unknown tab and a name still on its way fall back to something true", () => {
    expect(scopedPlaceholder("whatever", "means")).toBe("Search everything from means");
    expect(scopedPlaceholder("notes", null)).toBe("Search their posts");
  });
});

describe("seeAllLabel — the typeahead's footer row under a scope, never the raw key", () => {
  it("words search within the person; no words browse everything from them", () => {
    expect(seeAllLabel("guitar", "Joe Martin")).toBe('See all results for "guitar" from Joe Martin');
    expect(seeAllLabel("", "Joe Martin")).toBe("See everything from Joe Martin");
  });
  it("a name still arriving reads as them", () => {
    expect(seeAllLabel("guitar", null)).toBe('See all results for "guitar" from them');
    expect(seeAllLabel("", null)).toBe("See everything from them");
  });
});
