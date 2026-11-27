import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { countFacets } from "./types";
import { eventsBySeller, foldShop, priceSortOf, shopFacets, shopRows, type ShopState } from "./shop";
import { gitItemRows, gitItemState, gitLabelFacets, gitRows, gitStateFacets } from "./git";
import { appCategoryFacets, appCategoryTags, appPlatformFacets, appRows } from "./apps";
import { articleFacets, articleTypeOf, recipeFacets, recipeTopics } from "./articles";
import { mediaRows } from "./media";
import { eventDayHeaders, eventRows } from "./events";
import { liveCounts, liveProofUrls, liveRows, liveShelfOf, liveStatesOf, provenBy } from "./live";
import { listGroupRows, listRows } from "./lists";
import { clusterRows, displayRows, showableUnfiltered, tabHits, type DisplayState, type TabHitsState } from ".";

const A = "a".repeat(64);
const B = "b".repeat(64);
let seq = 0;
function ev(kind: number, tags: string[][] = [], over: Partial<NostrEvent> = {}): NostrEvent {
  seq += 1;
  return {
    id: over.id ?? seq.toString(16).padStart(64, "0"),
    pubkey: A,
    created_at: 1_700_000_000 + seq,
    kind,
    tags,
    content: "",
    sig: "",
    ...over,
  };
}
const hit = (event: NostrEvent): SearchHit => ({ event, author: null, rank: null });
const ids = (hits: readonly { event: NostrEvent }[]) => hits.map((h) => h.event.id);
const listing = (
  title: string,
  price: [string, string] | null,
  tags: string[][] = [],
  over: Partial<NostrEvent> = {},
) => ev(30402, [["d", title], ["title", title], ...(price ? [["price", ...price]] : []), ...tags], over);

describe("countFacets", () => {
  it("counts each value once per hit, most first, ties in the order met", () => {
    const hits = [hit(ev(1, [["t", "b"]])), hit(ev(1, [["t", "a"]])), hit(ev(1, [["t", "a"]]))];
    expect(countFacets(hits, (h) => h.event.tags.map((t) => t[1]))).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("the Shop", () => {
  it("reads the price sort out of the query", () => {
    expect(priceSortOf("honey sort:price")).toBe("asc");
    expect(priceSortOf("honey sort:price:desc")).toBe("desc");
    expect(priceSortOf("honey sort:recent")).toBeNull();
  });

  it("keeps only what is for sale, and a stall only when it has a name", () => {
    const onSale = hit(listing("Honey", ["10", "USD"]));
    const priceless = hit(listing("Jam", null));
    const sold = hit(listing("Wax", ["5", "USD"], [["status", "sold"]]));
    const unnamedStall = hit(ev(30017, [["d", "s"]], { content: "{}" }));
    expect(ids(foldShop([onSale, priceless, sold, unnamedStall]).hits)).toEqual(ids([onSale]));
  });

  it("indexes the page by seller", () => {
    const a = listing("Honey", ["10", "USD"]);
    const b = listing("Jam", ["10", "USD"], [], { pubkey: B });
    const by = eventsBySeller([hit(a), hit(b)]);
    expect(by.get(A)).toEqual([a]);
    expect(by.get(B)).toEqual([b]);
  });

  it("counts categories, and narrows and sorts by price", () => {
    const cheap = hit(listing("Honey", ["100", "SATS"], [["t", "food"]]));
    const dear = hit(
      listing(
        "Hive",
        ["5000", "SATS"],
        [
          ["t", "tools"],
          ["t", "food"],
        ],
      ),
    );
    const unpriceable = hit(listing("Jar", ["3", "XYZ"], [["t", "tools"]]));
    expect(shopFacets([cheap, dear, unpriceable])).toEqual([
      ["food", 2],
      ["tools", 2],
    ]);
    const s: ShopState = {
      category: null,
      price: null,
      rates: null,
      bands: [],
      viewerFiat: "USD",
      priceSort: "desc",
      fold: null,
    };
    expect(ids(shopRows([cheap, unpriceable, dear], s))).toEqual(ids([dear, cheap, unpriceable]));
    expect(ids(shopRows([cheap, unpriceable, dear], { ...s, priceSort: "asc" }))).toEqual(
      ids([cheap, dear, unpriceable]),
    );
    expect(ids(shopRows([cheap, unpriceable, dear], { ...s, priceSort: null, category: "tools" }))).toEqual(
      ids([unpriceable, dear]),
    );
  });
});

describe("Repos, Issues and PRs", () => {
  const issue = (pubkey: string, labels: string[]) =>
    ev(
      1621,
      labels.map((l) => ["t", l]),
      { pubkey },
    );

  it("offers a label only when more than one author uses it, unless the page is one author's", () => {
    const hits = [hit(issue(A, ["bug", "qa"])), hit(issue(B, ["bug"]))];
    expect(gitLabelFacets(hits)).toEqual([["bug", 2]]);
    expect(gitLabelFacets([hit(issue(A, ["qa"]))])).toEqual([["qa", 1]]);
  });

  it("reads each item's state from its statuses, and counts them in a fixed order", () => {
    const open = issue(A, []);
    const closed = issue(A, []);
    const patch = ev(1617);
    const statuses = new Map([
      [closed.id, { kind: 1632, at: 1 }],
      [patch.id, { kind: 1631, at: 1 }],
    ]);
    expect(gitItemState(patch, statuses)).toBe("merged");
    expect(gitItemState(ev(30617), statuses)).toBeNull();
    expect(gitStateFacets([hit(closed), hit(patch), hit(open)], statuses)).toEqual([
      ["open", 1],
      ["merged", 1],
      ["closed", 1],
    ]);
    expect(ids(gitItemRows([hit(open), hit(closed)], { state: "closed", label: null, statuses }))).toEqual([closed.id]);
  });

  it("folds a codebase's forks behind one card, opened on a tap", () => {
    const repo = (pubkey: string, d: string, euc: string) =>
      ev(
        30617,
        [
          ["d", d],
          ["r", euc, "euc"],
        ],
        { pubkey },
      );
    const original = hit(repo(A, "amethyst", "c0ffee"));
    const fork = hit(repo(B, "amethyst", "c0ffee"));
    const closed = gitRows([original, fork], { expanded: new Set(), scoreOf: (pk) => (pk === A ? 1 : 0) });
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ collapsedCount: 1, chipLabel: "1 fork" });
    const opened = gitRows([original, fork], {
      expanded: new Set([closed[0].clusterId]),
      scoreOf: (pk) => (pk === A ? 1 : 0),
    });
    expect(opened.map((r) => r.forkOf)).toEqual([undefined, "amethyst"]);
  });
});

describe("the Apps tab", () => {
  const app = (f: string[], t: string[]) => ev(32267, [...f.map((x) => ["f", x]), ...t.map((x) => ["t", x])]);

  it("counts platforms and categories, a platform word never doubling as a category", () => {
    const a = hit(app(["android-arm64-v8a"], ["Android", "social"]));
    const b = hit(app(["web"], ["social", "chat"]));
    expect(appCategoryTags(a.event)).toEqual(["social"]);
    expect(appPlatformFacets([a, b])).toEqual([
      ["Android", 1],
      ["Web", 1],
    ]);
    expect(appCategoryFacets([a, b])).toEqual([
      ["social", 2],
      ["chat", 1],
    ]);
    expect(ids(appRows([a, b], { platform: "Web", category: null }))).toEqual(ids([b]));
    expect(ids(appRows([a, b], { platform: null, category: "chat" }))).toEqual(ids([b]));
  });
});

describe("Articles and Recipes", () => {
  it("tells articles' kinds apart, and offers chips only for more than one", () => {
    expect([30817, 30818, 30023].map(articleTypeOf)).toEqual(["spec", "wiki", "article"]);
    expect(articleFacets([hit(ev(30023)), hit(ev(30023))])).toEqual([]);
    expect(articleFacets([hit(ev(30818)), hit(ev(30023)), hit(ev(30817))])).toEqual(["article", "spec", "wiki"]);
  });

  it("reads a recipe's topics without zap.cooking's housekeeping", () => {
    const recipe = ev(30023, [
      ["d", "chicken-soup"],
      ["t", "zapcooking"],
      ["t", "zapcooking-chicken-soup"],
      ["t", "soup"],
      ["t", "zapcooking-soup"],
      ["t", "4"],
    ]);
    expect(recipeTopics(recipe)).toEqual(["soup"]);
    expect(recipeFacets([hit(recipe)])).toEqual([["soup", 1]]);
  });
});

describe("the Media tab", () => {
  it("keeps a file only when it is media, and not a clip's soundtrack", () => {
    const apk = hit(ev(1063, [["m", "application/vnd.android.package-archive"]]));
    const picture = hit(
      ev(1063, [
        ["m", "image/png"],
        ["url", "https://x.test/a.png"],
      ]),
    );
    const video = hit(ev(21));
    expect(ids(mediaRows([apk, picture, video], null))).toEqual(ids([picture, video]));
  });
});

describe("the Events tab", () => {
  it("windows the dated events and keeps calendars after them, whichever window", () => {
    const now = Math.floor(Date.now() / 1000);
    const future = hit(
      ev(31923, [
        ["d", "f"],
        ["start", String(now + 86_400)],
      ]),
    );
    const past = hit(
      ev(31923, [
        ["d", "p"],
        ["start", String(now - 10 * 86_400)],
        ["end", String(now - 9 * 86_400)],
      ]),
    );
    const calendar = hit(ev(31924, [["d", "c"]]));
    expect(ids(eventRows([calendar, past, future], "upcoming"))).toEqual(ids([future, calendar]));
    expect(ids(eventRows([calendar, past, future], "past"))).toEqual(ids([past, calendar]));
  });

  it("heads each day once, and the calendars together", () => {
    const now = new Date(2026, 10, 2, 12).getTime();
    const day = (offsetDays: number, hour: number) =>
      String(Math.floor(new Date(2026, 10, 2 + offsetDays, hour).getTime() / 1000));
    const rows = [
      hit(
        ev(31923, [
          ["d", "1"],
          ["start", day(1, 9)],
        ]),
      ),
      hit(
        ev(31923, [
          ["d", "2"],
          ["start", day(1, 18)],
        ]),
      ),
      hit(
        ev(31923, [
          ["d", "3"],
          ["start", day(3, 9)],
        ]),
      ),
      hit(ev(31924, [["d", "c1"]])),
      hit(ev(31924, [["d", "c2"]])),
    ].map((h) => ({ hit: h, collapsedCount: 0, clusterId: "" }));
    const headers = eventDayHeaders(rows, "upcoming", now);
    expect([...headers.keys()]).toEqual([rows[0], rows[2], rows[3]].map((r) => r.hit.event.id));
    expect(headers.get(rows[3].hit.event.id)?.label).toBe("Calendars");
    expect(headers.get(rows[0].hit.event.id)?.key).toBe("2026-11-03");
  });
});

describe("the Live tab", () => {
  const now = Math.floor(Date.now() / 1000);
  const stream = (status: string, tags: string[][] = []) =>
    hit(ev(30311, [["d", String(seq)], ["title", "Show"], ["status", status], ...tags], { created_at: now - 60 }));

  it("puts each stream on its shelf once what it needs has answered", () => {
    const live = stream("live", [
      ["current_participants", "3"],
      ["starts", String(now - 60)],
    ]);
    const busier = stream("live", [
      ["current_participants", "9"],
      ["starts", String(now - 60)],
    ]);
    const replay = stream("ended", [["recording", "https://x.test/r.m3u8"]]);
    const hits = [live, busier, replay];
    const states = liveStatesOf(hits);
    expect(liveProofUrls(hits, states)).toEqual(["https://x.test/r.m3u8"]);
    const unproven = provenBy(new Set());
    expect(liveCounts(hits, states, unproven)).toEqual({ live: 2, upcoming: 0, replay: 0 });
    const proven = provenBy(new Set(["https://x.test/r.m3u8"]));
    const counts = liveCounts(hits, states, proven);
    expect(counts).toEqual({ live: 2, upcoming: 0, replay: 1 });
    expect(liveShelfOf(null, counts)).toBe("live");
    expect(liveShelfOf("replay", counts)).toBe("replay");
    expect(liveShelfOf(null, { live: 0, upcoming: 0, replay: 1 })).toBe("replay");
    // Most watched first.
    expect(ids(liveRows(hits, { shelf: "live", states, proven }))).toEqual(ids([busier, live]));
  });
});

describe("the Lists tab", () => {
  it("keeps titled lists with items, people-packs first", () => {
    const pack = hit(
      ev(30000, [
        ["d", "p"],
        ["title", "Devs"],
        ["p", B],
      ]),
    );
    const articles = hit(
      ev(30004, [
        ["d", "a"],
        ["title", "Reads"],
        ["a", `30023:${B}:x`],
      ]),
    );
    const untitled = hit(
      ev(30000, [
        ["d", "u"],
        ["p", B],
      ]),
    );
    const empty = hit(
      ev(30000, [
        ["d", "e"],
        ["title", "Empty"],
      ]),
    );
    expect(ids(listRows([articles, untitled, pack, empty]))).toEqual(ids([pack, articles]));
  });

  it("folds same-title packs into one row", () => {
    const a = hit(
      ev(30000, [
        ["d", "x"],
        ["title", "Devs"],
        ["p", B],
      ]),
    );
    const b = hit(
      ev(
        30000,
        [
          ["d", "y"],
          ["title", "Devs"],
          ["p", B],
        ],
        { pubkey: B },
      ),
    );
    const rows = listGroupRows([a, b], () => null);
    expect(rows).toHaveLength(1);
    expect(rows[0].listGroup?.lists).toBe(2);
  });
});

describe("tabHits", () => {
  const base: TabHitsState = {
    tab: "notes",
    keptCarriers: null,
    shopHits: null,
    pointed: [],
    leadPeople: [],
    personMedia: [],
    mediaNotes: null,
  };

  it("adds a pressed tag's carriers the stream did not send", () => {
    const sent = hit(ev(1));
    const carried = hit(ev(1));
    expect(ids(tabHits([sent], { ...base, keptCarriers: [sent, carried] }))).toEqual(ids([sent, carried]));
  });

  it("joins a named person's tracks to Music, and the Media tab's notes with something to look at", () => {
    const track = hit(ev(31337));
    const own = hit(ev(31337));
    expect(ids(tabHits([track], { ...base, tab: "music", personMedia: [track, own] }))).toEqual(ids([track, own]));
    const clip = hit(ev(21));
    const withPicture = hit(ev(1, [], { content: "look https://x.test/a.jpg" }));
    const words = hit(ev(1, [], { content: "just words" }));
    expect(ids(tabHits([clip], { ...base, tab: "media", mediaNotes: [withPicture, words] }))).toEqual(
      ids([clip, withPicture]),
    );
  });

  it("is the Shop's products on the Shop, and what a vertical's card can draw on Top", () => {
    const product = hit(listing("Honey", ["10", "USD"]));
    expect(ids(tabHits([hit(ev(1))], { ...base, tab: "shop", shopHits: [product] }))).toEqual(ids([product]));
    const sold = hit(listing("Wax", ["5", "USD"], [["status", "sold"]]));
    const note = hit(ev(1));
    expect(showableUnfiltered(sold.event)).toBe(false);
    expect(ids(tabHits([sold, note], { ...base, tab: "top" }))).toEqual(ids([note]));
  });
});

describe("displayRows", () => {
  const state = (over: Partial<DisplayState>): DisplayState => ({
    tab: "notes",
    carrierRank: new Map(),
    when: "upcoming",
    category: null,
    tagFilter: null,
    streamTag: null,
    tagsByHit: new Map(),
    appPlatform: null,
    appCategory: null,
    shopCategory: null,
    shopPrice: null,
    rates: null,
    bands: [],
    viewerFiat: "USD",
    priceSort: null,
    fold: null,
    articleType: null,
    recipeTopic: null,
    gitStatuses: new Map(),
    repoState: null,
    repoLabel: null,
    liveStates: new Map(),
    shelf: "live",
    proven: () => true,
    pageKind: null,
    scoreOf: () => null,
    expanded: new Set(),
    ...over,
  });

  it("is one row per hit on a plain tab", () => {
    const hits = [hit(ev(1)), hit(ev(1))];
    expect(displayRows(hits, state({})).map((r) => r.hit)).toEqual(hits);
  });

  it("keeps the rows a pressed tag is known to be on, until the stream is its own answer", () => {
    const tagged = hit(ev(1));
    const other = hit(ev(1));
    const tagsByHit = new Map([[tagged.event.id, new Set(["k"])]]);
    expect(ids(displayRows([tagged, other], state({ tagFilter: "k", tagsByHit })).map((r) => r.hit))).toEqual(
      ids([tagged]),
    );
    expect(displayRows([tagged, other], state({ tagFilter: "k", streamTag: "k", tagsByHit }))).toHaveLength(2);
  });

  it("narrows Articles by type", () => {
    const spec = hit(ev(30817));
    const article = hit(ev(30023));
    expect(
      ids(displayRows([spec, article], state({ tab: "articles", articleType: "spec" })).map((r) => r.hit)),
    ).toEqual(ids([spec]));
  });

  it("clusters recurring events until opened, calendars after and alone", () => {
    const meetup = (n: number) =>
      hit(
        ev(31923, [
          ["d", `m${n}`],
          ["title", "Monthly meetup"],
          ["start", String(2_000_000_000 + n * 2_592_000)],
        ]),
      );
    const calendar = hit(ev(31924, [["d", "c"]]));
    const shown = [meetup(1), meetup(2), meetup(3), calendar];
    const closed = clusterRows(shown, "events", new Set());
    expect(closed[closed.length - 1]).toEqual({ hit: calendar, collapsedCount: 0, clusterId: "" });
    const lead = closed.find((r) => r.collapsedCount > 0);
    expect(lead).toBeDefined();
    const opened = clusterRows(shown, "events", new Set([lead!.clusterId]));
    expect(opened).toHaveLength(4);
    expect(clusterRows(shown, "notes", new Set())).toHaveLength(4);
  });
});
