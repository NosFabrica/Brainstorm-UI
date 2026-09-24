import { describe, it, expect } from "vitest";
import { categoriesOf, chipAriaLabel, personContentFilters, type PersonContentChip } from "./personContent";

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

  it("an article wearing zap.cooking's tag is Recipes, not Articles", () => {
    expect(categoriesOf([ev(30023, [["t", "zapcooking"]])], NOW)).toEqual([{ key: "recipes", label: "Recipes", tab: "recipes", liveNow: false }]);
    expect(categoriesOf([ev(30023, [["t", "zapcooking"], ["t", "zapreads"]])], NOW)[0].key).toBe("articles");
    expect(categoriesOf([ev(30818)], NOW)[0].key).toBe("articles");
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

describe("personContentFilters — one lensed filter per category, the newest one of each", () => {
  it("asks six questions under the include:spam lens", () => {
    const filters = personContentFilters(STACI);
    expect(filters).toHaveLength(6);
    for (const f of filters) expect(f).toEqual(expect.objectContaining({ authors: [STACI], limit: 1, search: "include:spam" }));
    expect(filters.map((f) => f.kinds)).toEqual([[30402], [30023, 30818], [31337], [20, 21, 22, 34235, 34236], [30311], [30617]]);
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
