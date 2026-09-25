import { describe, it, expect } from "vitest";
import { categoriesOf, chipAriaLabel, personContentFilters, searchIntent, type PersonContentChip } from "./personContent";

// Benjamin (2026-09-24): "if Staci's name pops up in search … icons for users
// who produce content." Six probes, one event each is enough to know.
const STACI = "5".repeat(64);
const NOW = 1_790_000_000;
const ev = (kind: number, tags: string[][] = [], created_at = NOW) => ({ id: `${kind}-${tags.length}-${created_at}`, kind, pubkey: STACI, tags, content: "", created_at });

describe("categoriesOf — what a person publishes, in the order a searcher wants it", () => {
  it("lists the categories present, in the fixed order", () => {
    const chips = categoriesOf([ev(30617), ev(30402), ev(21)], NOW);
    expect(chips.map((c) => c.key)).toEqual(["shop", "media", "repos"]);
    expect(chips.map((c) => c.tab)).toEqual(["shop", "media", "repos"]);
    expect(chips.map((c) => c.label)).toEqual(["Shop", "Media", "Code"]);
  });

  it("shows at most four", () => {
    const chips = categoriesOf([ev(30402), ev(30023), ev(31337), ev(20), ev(30311, [["title", "Show"], ["status", "ended"]]), ev(30617)], NOW);
    expect(chips.map((c) => c.key)).toEqual(["shop", "articles", "music", "media"]);
  });

  // Zap Cooking (live, 2026-09-24): the newest article was a newsletter, so a
  // one-event sample read "Articles" for the recipe site. A recipe is its own
  // probe; an author with both wears both.
  it("an article wearing zap.cooking's tag is Recipes; essays are Articles; both when both exist", () => {
    expect(categoriesOf([ev(30023, [["t", "zapcooking"]])], NOW)).toEqual([{ key: "recipes", label: "Recipes", tab: "recipes", liveNow: false }]);
    expect(categoriesOf([ev(30023, [["t", "zapcooking"], ["t", "zapreads"]])], NOW).map((c) => c.key)).toEqual(["articles"]);
    expect(categoriesOf([ev(30818)], NOW).map((c) => c.key)).toEqual(["articles"]);
    expect(categoriesOf([ev(30023, [["t", "zapreads"], ["t", "zapcooking"]]), ev(30023, [["t", "zapcooking"]], NOW - 100)], NOW).map((c) => c.key)).toEqual(["articles", "recipes"]);
  });

  it("a stream on air now is marked live; an ended one still earns the chip", () => {
    expect(categoriesOf([ev(30311, [["title", "Show"], ["status", "live"]], NOW - 60)], NOW)).toEqual([{ key: "live", label: "Live", tab: "live", liveNow: true }]);
    expect(categoriesOf([ev(30311, [["title", "Show"], ["status", "ended"]])], NOW)[0]).toMatchObject({ key: "live", liveNow: false });
    expect(categoriesOf([ev(30311)], NOW)[0]).toMatchObject({ key: "live", liveNow: false });
  });

  it("ignores kinds that are not a category", () => {
    expect(categoriesOf([ev(1), ev(0)], NOW)).toEqual([]);
    expect(categoriesOf([], NOW)).toEqual([]);
  });
});

describe("categoriesOf — a chip promises something you can act on now", () => {
  const MONTH = 30 * 86_400;
  // Vitor (live, 2026-09-24): a Shop chip on a listing 34 months old led to a shelf
  // nobody could buy from. Shop and Live go stale after a year; the rest keep.
  it("a shop is a shop only if something was listed in the last year", () => {
    expect(categoriesOf([ev(30402, [], NOW - 34 * MONTH)], NOW)).toEqual([]);
    expect(categoriesOf([ev(30402, [], NOW - 11 * MONTH)], NOW).map((c) => c.key)).toEqual(["shop"]);
  });

  it("a channel is a channel only if it streamed in the last year", () => {
    expect(categoriesOf([ev(30311, [["title", "Show"], ["status", "ended"]], NOW - 13 * MONTH)], NOW)).toEqual([]);
    expect(categoriesOf([ev(30311, [["title", "Show"], ["status", "ended"]], NOW - 5 * MONTH)], NOW).map((c) => c.key)).toEqual(["live"]);
  });

  it("articles, recipes, music, media and code are evergreen", () => {
    const old = NOW - 36 * MONTH;
    expect(categoriesOf([ev(30023, [], old), ev(30023, [["t", "zapcooking"]], old), ev(31337, [], old), ev(21, [], old), ev(30617, [], old)], NOW).map((c) => c.key)).toEqual(["articles", "recipes", "music", "media"]);
    expect(categoriesOf([ev(30617, [], old)], NOW).map((c) => c.key)).toEqual(["repos"]);
  });
});

describe("personContentFilters — one lensed filter per category, the newest one of each", () => {
  it("asks seven questions under the include:spam lens — recipes get their own", () => {
    const filters = personContentFilters(STACI);
    expect(filters).toHaveLength(7);
    for (const f of filters) expect(f).toEqual(expect.objectContaining({ authors: [STACI], limit: 1, search: "include:spam" }));
    expect(filters.map((f) => f.kinds)).toEqual([[30402], [30023, 30818], [30023], [31337], [20, 21, 22, 34235, 34236], [30311], [30617]]);
    expect(filters[2]["#t"]).toEqual(["zapcooking", "nostrcooking"]);
  });
});

describe("chipAriaLabel — the chip named for a screen reader", () => {
  const chip = (key: PersonContentChip["key"]): PersonContentChip => ({ key, label: "", tab: key, liveNow: false });
  it("says whose and what", () => {
    expect(chipAriaLabel("Staci", chip("shop"))).toBe("Staci's shop");
    expect(chipAriaLabel("Zap Cooking", chip("recipes"))).toBe("Zap Cooking's recipes");
    expect(chipAriaLabel("Staci", chip("live"))).toBe("Staci's live streams");
    expect(chipAriaLabel("Staci", chip("repos"))).toBe("Staci's code");
    expect(chipAriaLabel("Staci", chip("articles"))).toBe("Staci's articles");
    expect(chipAriaLabel("Staci", chip("music"))).toBe("Staci's music");
    expect(chipAriaLabel("Staci", chip("media"))).toBe("Staci's media");
  });
});

// Google reads "nike shoes" as a store and a thing. "staci shop" is a person and a
// category: the name to look up, the category the intent row lands on.
describe("searchIntent — a name plus a category word", () => {
  it("reads the last word as the category and the rest as the name", () => {
    expect(searchIntent("staci shop")).toEqual({ name: "staci", key: "shop" });
    expect(searchIntent("zap cooking recipes")).toEqual({ name: "zap cooking", key: "recipes" });
    expect(searchIntent("Vitor Articles")).toEqual({ name: "Vitor", key: "articles" });
  });

  it("knows the words people use for each category", () => {
    for (const [word, key] of [["store", "shop"], ["products", "shop"], ["writing", "articles"], ["posts", "articles"], ["songs", "music"], ["photos", "media"], ["videos", "media"], ["stream", "live"], ["streams", "live"], ["repos", "repos"], ["github", "repos"]] as const) {
      expect(searchIntent(`staci ${word}`)?.key).toBe(key);
    }
  });

  it("a name alone, a category alone, or a category first is no intent", () => {
    expect(searchIntent("staci")).toBeNull();
    expect(searchIntent("shop")).toBeNull();
    expect(searchIntent("shop staci")).toBeNull();
    expect(searchIntent("  ")).toBeNull();
    expect(searchIntent("staci soap")).toBeNull();
  });
});
