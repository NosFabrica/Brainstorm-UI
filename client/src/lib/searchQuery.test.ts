// @vitest-environment node
/**
 * The grammar itself, ported from the relay's own operator field. These tests
 * are the contract between the two implementations: a case that changes here
 * has to change there, or the same query means two things.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import {
  buildFilters, dateAt, dayBound, drawable, groupAt, mentionAt, parseQuery, scopeIds, tagValues, tokenize, ymd,
} from "./searchQuery";

const hex = "9".repeat(64);
const npub = nip19.npubEncode(hex);
const types = (q: string) => tokenize(q).map((s) => s.type);

describe("tokenize — what the box draws", () => {
  it("lifts from:/to: keys, keeping the raw exactly as typed", () => {
    const segs = tokenize(`bugs from:${npub}`);
    expect(segs.map((s) => s.type)).toEqual(["text", "key"]);
    const key = segs[1] as { raw: string; field: string; pubkey: string };
    expect(key.raw).toBe(`from:${npub}`);
    expect(key.field).toBe("from");
    expect(key.pubkey).toBe(hex);
  });

  it("a bare npub is a token but names no field — it stays a search term", () => {
    expect(parseQuery(npub).authors).toEqual([]);
    expect(parseQuery(npub).terms).toBe(npub);
  });

  it("to: a note or an nevent is an #e question; an naddr is an #a one", () => {
    const note = nip19.noteEncode(hex);
    const naddr = nip19.naddrEncode({ kind: 30023, pubkey: hex, identifier: "my-post" });
    const q = parseQuery(`to:${note} to:${naddr}`);
    expect(q.cites).toEqual([hex]);
    expect(q.addrs).toEqual([`30023:${hex}:my-post`]);
  });

  it("a corrupt key or pointer is not a token — it stays text", () => {
    expect(types(`from:${npub.slice(0, -1)}x`)).toEqual(["text"]);
    expect(types("to:note1notarealpointer")).toEqual(["text"]);
  });

  it("a prefix inside a url is not a filter — a token starts a word", () => {
    expect(types("https://x.com/from:bob")).toEqual(["text"]);
  });

  it("hashtags are unicode and may sit mid-sentence, hyphens and emoji included", () => {
    const q = parseQuery("look at #café and #bitcoin-mining, plus #日本");
    expect(q.hashtags).toEqual(["café", "bitcoin-mining", "日本"]);
    // The comma the lifted tag stranded is gone; the words are not.
    expect(q.terms).toBe("look at and plus");
  });

  it("a trailing hyphen is dropped from what is ASKED but kept in what is DRAWN", () => {
    const segs = tokenize("#topic-");
    expect(segs).toEqual([{ type: "tag", raw: "#topic-", tag: "topic" }]);
  });

  it("days become the local seconds they bound, and a day that does not exist stays text", () => {
    const q = parseQuery("x since:2026-01-02 until:2026-01-02");
    expect(q.since).toBe(Math.floor(new Date(2026, 0, 2).getTime() / 1000));
    expect(q.until).toBe(Math.floor(new Date(2026, 0, 3).getTime() / 1000) - 1);
    expect(types("since:2026-02-31")).toEqual(["text"]);
  });

  it("two of one date prefix keep the narrower bound", () => {
    const q = parseQuery("since:2026-01-02 since:2026-03-04 until:2026-12-31 until:2026-06-01");
    expect(q.since).toBe(dayBound("2026-03-04", "since"));
    expect(q.until).toBe(dayBound("2026-06-01", "until"));
  });

  it("group: and label: carry opaque values, case-exact", () => {
    const q = parseQuery("group:General label:review/app");
    expect(q.groups).toEqual(["General"]);
    expect(q.labels).toEqual(["review/app"]);
  });

  it("every NIP-73 scope the relay knows", () => {
    const q = parseQuery(
      "site:example.com/page isbn:9780593330005 doi:10.1000/182 geo:u4pruyd " +
        "isan:0000-0000-401A-0000-7 podcast:guid:abc podcast:item:guid:def podcast:publisher:ghi",
    );
    expect(q.scopes.map((s) => s.field)).toEqual([
      "site", "isbn", "doi", "geo", "isan", "podcast:guid", "podcast:item:guid", "podcast:publisher",
    ]);
    expect(q.terms).toBe("");
  });

  it("a scope's value ends before sentence punctuation, not inside a DOI", () => {
    expect(parseQuery("doi:10.1000/182.").scopes).toEqual([{ field: "doi", value: "10.1000/182" }]);
  });

  it("the ranking tokens are read out AND left standing for the relay to parse", () => {
    const q = parseQuery(`btc sort:rank include:spam filter:rank:gte:10 observer:${hex}`);
    expect(q.sort).toBe("rank");
    expect(q.includeSpam).toBe(true);
    expect(q.rankFloor).toBe(10);
    expect(q.observer).toBe(hex);
    expect(q.terms).toBe(`btc sort:rank include:spam filter:rank:gte:10 observer:${hex}`);
  });

  it("observer: takes an npub too, and hands the relay the hex it wants", () => {
    expect(parseQuery(`observer:${npub}`).observer).toBe(hex);
  });

  it("a rank floor off the 0..100 scale is not the filter, so it stays text", () => {
    expect(types("filter:rank:gte:101")).toEqual(["text"]);
    expect(parseQuery("filter:rank:gte:50").rankFloor).toBe(50);
  });

  it("the two client-only tokens come OUT of the terms — the relay knows neither", () => {
    const q = parseQuery("bitcoin trust:verified reach:friends");
    expect(q.verifiedOnly).toBe(true);
    expect(q.reach).toBe("friends");
    expect(q.terms).toBe("bitcoin");
  });

  it("quotes and -exclusions are NIP-50's own and pass through untouched", () => {
    expect(parseQuery('"exact phrase" -spam').terms).toBe('"exact phrase" -spam');
  });
});

describe("drawable — a token pills once the caret leaves it", () => {
  it("the tag being typed is still text; the one behind the caret is a pill", () => {
    expect(drawable("#bit", 4).map((s) => s.type)).toEqual(["text"]);
    expect(drawable("#bit ", 5).map((s) => s.type)).toEqual(["tag", "text"]);
  });

  it("a key pills immediately — nobody edits the middle of an npub", () => {
    expect(drawable(`from:${npub}`, 5 + npub.length).map((s) => s.type)).toEqual(["key"]);
  });
});

describe("the canonical spellings a tag filter has to ask for", () => {
  it("site: asks both schemes and both slashes, canonical first", () => {
    expect(scopeIds("site", "Example.com/Page")).toEqual([
      "https://example.com/Page", "https://example.com/Page/",
      "https://Example.com/Page", "https://Example.com/Page/",
      "http://example.com/Page", "http://example.com/Page/",
      "http://Example.com/Page", "http://Example.com/Page/",
    ]);
  });

  it("isbn drops hyphens, isan asks its 5-segment root, podcast:publisher grows a guid:", () => {
    expect(scopeIds("isbn", "978-0593330005")[0]).toBe("isbn:9780593330005");
    expect(scopeIds("isan", "0000-0000-401A-0000-7A-0000-0000-2")[0]).toBe("isan:0000-0000-401A-0000-7A");
    expect(scopeIds("podcast:publisher", "abc")[0]).toBe("podcast:publisher:guid:abc");
  });

  it("tagValues asks every casing the store may have indexed", () => {
    expect(tagValues("Bitcoin")).toEqual(["Bitcoin", "bitcoin", "Bitcoin", "BITCOIN"].filter((v, i, a) => a.indexOf(v) === i));
  });
});

describe("buildFilters — one REQ, filters ORed", () => {
  const limit = 40;

  it("a plain search is one filter", () => {
    expect(buildFilters("bitcoin", { limit })).toEqual([{ search: "bitcoin", limit }]);
  });

  it("a hashtag asks #t, #l and the NIP-22 comments written on it", () => {
    const filters = buildFilters("#nostr", { limit });
    expect(filters.map((f) => Object.keys(f).filter((k) => k.startsWith("#")))).toEqual([
      ["#t"], ["#l"], ["#I"], ["#i"],
    ]);
    expect(filters[0]["#t"]).toEqual(["nostr", "Nostr", "NOSTR"]);
    expect(filters[2].kinds).toEqual([1111]);
    expect(filters[2]["#I"]).toEqual(["#nostr", "nostr"]);
  });

  // Just the posts. The relay's operator page asks for the group's kind-39000 metadata beside
  // them because its pill is named from that REQ; here `services/groups` names the pill under
  // `include:spam`, which is the only lens that read works on — a group's metadata is signed
  // by its host relay's key, which no reader's web of trust ranks.
  it("a group asks #h, and nothing else", () => {
    const filters = buildFilters("group:abc", { limit });
    expect(filters).toHaveLength(1);
    expect(filters[0]["#h"]).toEqual(["abc"]);
    expect(filters.some((f) => (f.kinds as number[] | undefined)?.includes(39000))).toBe(false);
  });

  it("a label asks kind 1985 over the tab's own kinds — the mark is on the label", () => {
    const filters = buildFilters("label:review/app", { limit, kinds: [1] });
    expect(filters).toHaveLength(1);
    // Every casing, as the store indexes tag values cased.
    expect(filters[0]).toMatchObject({ kinds: [1985], "#l": ["review/app", "Review/app", "REVIEW/APP"] });
  });

  it("a NIP-73 scope asks the comment question alone", () => {
    const filters = buildFilters("isbn:9780593330005", { limit });
    expect(filters.every((f) => f.kinds?.[0] === 1111)).toBe(true);
    expect(filters[0]["#I"]).toEqual(["isbn:9780593330005"]);
  });

  it("the words, the window and the tab ride every filter of the union", () => {
    const filters = buildFilters("gm #nostr since:2026-01-02", { limit, kinds: [1] });
    for (const f of filters) {
      expect(f.search).toBe("gm");
      expect(f.since).toBe(dayBound("2026-01-02", "since"));
    }
    // Only the comment filters override the tab's kinds; the others keep them.
    expect(filters[0].kinds).toEqual([1]);
  });

  it("the caller's lens builder writes the NIP-50 string", () => {
    const [f] = buildFilters("gm", { limit, searchString: (t) => `${t} include:spam`.trim() });
    expect(f.search).toBe("gm include:spam");
  });
});

describe("the caret probes the pickers hang off", () => {
  it("mentionAt offers a name fragment and stands down once a key is whole", () => {
    expect(mentionAt("gm from:ja", 10)).toMatchObject({ field: "from", partial: "ja", complete: false });
    expect(mentionAt(`gm from:${npub}`, 8 + npub.length)?.complete).toBe(true);
    // A pointer names no person.
    expect(mentionAt("to:note1abc", 11)).toBeNull();
  });

  it("dateAt is complete only on a day that exists", () => {
    expect(dateAt("since:2026-02-31", 16)?.complete).toBe(false);
    expect(dateAt("since:2026-02-28", 16)?.complete).toBe(true);
  });

  it("groupAt never completes — only a space ends a group id", () => {
    expect(groupAt("group:gen", 9)).toMatchObject({ partial: "gen", complete: false });
    expect(groupAt("group:gen ", 10)).toBeNull();
  });

  it("a probe answers only when the caret is at the token's end", () => {
    expect(mentionAt("from:ja more", 5)).toBeNull();
  });
});

describe("ymd", () => {
  it("writes a local day the way the language reads it", () => {
    expect(ymd(new Date(2026, 0, 2))).toBe("2026-01-02");
  });
});
