import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { assemble, digest, firstImageIn, highlightAuthorKeys, tagFacts, type Profile } from "./corpus";
import {
  DEFAULT_TRUST_FLOOR,
  DESKS,
  WINDOW_SECONDS,
  belongs,
  filterFor,
  lookbackOf,
  pickRecipe,
  recipeAddress,
} from "./desks";
import { recentRecipes } from "./edition";
import { citedRecipe } from "@/services/frontPage";
import { BRAINSTORM_LINKS } from "./links";

// Amethyst's KitchenAndTagFactsTest: the Kitchen desk, and the tag facts the digest prints
// for calendar, classifieds and highlights.

const OBSERVER = "0b".repeat(32);
const ALICE = "a1".repeat(32);
const BOB = "b0".repeat(32);
const id = (n: number) => n.toString(16).padStart(64, "0");
const event = (n: number, over: Partial<NostrEvent> = {}): NostrEvent =>
  ({
    id: id(n),
    pubkey: ALICE,
    kind: 1,
    created_at: 1_794_500_000,
    content: "",
    tags: [],
    sig: "",
    ...over,
  }) as NostrEvent;
const profiles: Record<string, Profile> = {
  [ALICE]: { name: "Alice Moreira", nip05: null },
  [BOB]: { name: "Bob Ferreira", nip05: null },
};
const corpus = (desks: Record<string, NostrEvent[]>) =>
  assemble({
    observer: OBSERVER,
    relay: "wss://search.example/",
    floor: DEFAULT_TRUST_FLOOR,
    since: 1_794_182_400,
    until: 1_794_268_800,
    desks,
    control: [],
    profiles,
  });

const kitchen = DESKS.find((d) => d.key === "kitchen")!;
const articles = DESKS.find((d) => d.key === "articles")!;

const recipe = (
  n: number,
  hashtags: string[],
  { d = `recipe-${n}`, content = "## Ingredients\n- 2 eggs\n\n\n## Steps\n1. Whisk." } = {},
) =>
  event(n, {
    kind: 30023,
    content,
    tags: [["d", d], ["title", `Recipe ${n}`], ...hashtags.map((t) => ["t", t])],
  });

describe("the Kitchen", () => {
  it("reads both tags over thirty days", () => {
    expect(kitchen.kinds).toEqual([30023]);
    expect(new Set(kitchen.tags?.t)).toEqual(new Set(["zapcooking", "nostrcooking"]));
    expect(lookbackOf(kitchen)).toBe(30 * 24 * 60 * 60);
    // Every other desk reads the fixed 24 hours.
    expect(DESKS.filter((d) => d.key !== "kitchen").every((d) => lookbackOf(d) === WINDOW_SECONDS)).toBe(true);
    const filter = filterFor(kitchen.kinds, 1_000, 2_000, kitchen.limit, OBSERVER, DEFAULT_TRUST_FLOOR, kitchen.tags);
    expect(filter["#t"]).toEqual(kitchen.tags?.t);
    expect(filter.search.startsWith("observer:")).toBe(true);
  });

  it("leaves out the mirror, and long reads leave out recipes", () => {
    const community = recipe(1, ["zapcooking"]);
    const older = recipe(2, ["NostrCooking"]);
    const mirror = recipe(3, ["zapcooking", "newsarchive", "nytcooking"]);
    const essay = recipe(4, ["bitcoin"]);
    const all = [community, older, mirror, essay];
    expect(belongs(kitchen, OBSERVER, all)).toEqual([community, older]);
    expect(belongs(articles, OBSERVER, all)).toEqual([essay]);
  });

  it("doesn't offer a recipe that ran lately", () => {
    const first = recipe(1, ["zapcooking"]);
    const second = recipe(2, ["zapcooking"]);
    expect(pickRecipe([first, second], new Set())).toBe(first);
    // An edit of the same recipe (a new id, the same address) has still run.
    const edited = recipe(9, ["zapcooking"], { d: "recipe-1" });
    expect(pickRecipe([edited, second], new Set([recipeAddress(first)]))).toBe(second);
    expect(pickRecipe([first], new Set([recipeAddress(first)]))).toBeNull();
    const editions = [
      { day: "2026-11-12", recipe: recipeAddress(first) },
      { day: "2026-11-13", recipe: recipeAddress(second) },
    ];
    // Today's own reprint doesn't count against today's recipe.
    expect(recentRecipes(editions, "2026-11-13")).toEqual(new Set([recipeAddress(first)]));
  });

  it("the digest gives the recipe whole, with its cook and picture", async () => {
    const dish = event(1, {
      kind: 30023,
      content:
        "Grandma's bread.\n\n## Ingredients\n- 500 g flour\n- 10 g salt\n\n## Steps\n1. Knead.\n2. Bake at 220 °C.",
      tags: [
        ["d", "bread"],
        ["title", "Grandma's bread"],
        ["t", "zapcooking"],
        ["image", "https://cdn.example/bread.jpg"],
      ],
    });
    const c = await corpus({ kitchen: [dish] });
    expect(c.art.map((a) => a.url)).toEqual(["https://cdn.example/bread.jpg"]);
    const text = digest(c);
    expect(text).toContain("## Kitchen (1)");
    expect(text).toContain("over the last 30 days, not 24 hours");
    expect(text).toContain("title: Grandma's bread");
    expect(text).toContain("Alice Moreira");
    expect(text).toContain(`picture: ${c.art[0].id}`);
    expect(text).toContain("    - 500 g flour\n    - 10 g salt");
    expect(text).toContain("2. Bake at 220 °C.");
    // The page that cites it ran it.
    expect(citedRecipe(`<a href="${BRAINSTORM_LINKS.citation(dish)}">Source</a>`, c)).toBe(`30023:${ALICE}:bread`);
    expect(citedRecipe("<p>no recipe</p>", c)).toBeNull();
    // The first picture in the text, when there is no image tag.
    expect(firstImageIn("Look ![the loaf](https://cdn.example/a.png) and https://cdn.example/b.jpg")).toBe(
      "https://cdn.example/a.png",
    );
  });
});

describe("tag facts", () => {
  it("calendar listings say when and where", () => {
    const timed = event(1, {
      kind: 31923,
      tags: [
        ["d", "meetup"],
        ["start", "1796493600"],
        ["end", "1796500800"],
        ["location", "Café Nostr, Lisbon"],
      ],
    });
    const facts = tagFacts("calendar", timed, {});
    expect(facts[0]).toBe("WHEN: Saturday, December 5, 2026, 18:00 to 20:00 (UTC)");
    expect(facts[1]).toBe("LOCATION: Café Nostr, Lisbon");
    const allDay = event(2, {
      kind: 31922,
      tags: [
        ["d", "fest"],
        ["start", "2026-12-05"],
        ["end", "2026-12-07"],
      ],
    });
    expect(tagFacts("calendar", allDay, {})).toEqual([
      "WHEN: Saturday, December 5, 2026 to Monday, December 7, 2026 (all day)",
    ]);
    expect(tagFacts("calendar", event(3, { kind: 31923, tags: [["d", "x"]] }), {})).toEqual(["WHEN: no date given"]);
    // On the organiser's clock, when the listing names its zone.
    const lisbon = event(4, {
      kind: 31923,
      tags: [
        ["start", "1796493600"],
        ["start_tzid", "Europe/Lisbon"],
      ],
    });
    expect(tagFacts("calendar", lisbon, {})[0]).toBe(
      "WHEN: Saturday, December 5, 2026, 18:00 (Europe/Lisbon, UTC+00:00)",
    );
  });

  it("classifieds say price, status and condition", () => {
    const listing = event(1, {
      kind: 30402,
      tags: [
        ["d", "mug"],
        ["price", "11.99", "USD"],
        ["status", "sold"],
        ["condition", "Like new"],
      ],
    });
    expect(tagFacts("classifieds", listing, {})).toEqual(["PRICE: 11.99 USD", "STATUS: sold", "CONDITION: Like new"]);
    const rent = event(2, { kind: 30402, tags: [["price", "900", "EUR", "month"]] });
    expect(tagFacts("classifieds", rent, {})).toEqual(["PRICE: 900 EUR per month"]);
  });

  it("highlights say who wrote the excerpt, and where", async () => {
    const marked = event(1, {
      kind: 9802,
      content: "Information wants to be free.",
      tags: [
        ["p", BOB, "", "author"],
        ["r", "https://example.com/essay", "source"],
        ["context", "He wrote that information wants to be free."],
      ],
    });
    expect(tagFacts("highlights", marked, profiles)).toEqual([
      "EXCERPT: Information wants to be free.",
      "AUTHOR: Bob Ferreira",
      "SOURCE: https://example.com/essay",
      "CONTEXT: He wrote that information wants to be free.",
    ]);
    const text = digest(await corpus({ highlights: [marked] }));
    expect(text).toContain("  EXCERPT: Information wants to be free.");
    expect(text).toContain("  AUTHOR: Bob Ferreira");
    // The excerpt isn't printed a second time as the post's text.
    expect(text.split("CONTEXT")[0].match(/Information wants to be free\./g)).toHaveLength(1);
    expect(highlightAuthorKeys(marked)).toEqual([BOB]);
    expect(highlightAuthorKeys(event(5))).toEqual([]);
    // No author given, an article cited: its author and where it is.
    const cited = event(6, { kind: 9802, content: "x", tags: [["a", `30023:${ALICE}:essay`]] });
    expect(tagFacts("highlights", cited, profiles)).toEqual([
      "EXCERPT: x",
      "AUTHOR: Alice Moreira",
      "SOURCE: a long-form article on Nostr",
    ]);
  });
});
