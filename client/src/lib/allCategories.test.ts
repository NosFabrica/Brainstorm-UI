/**
 * All's categories: the kinds among its rows, named as their badges name them in the plural, and
 * the Dictionary's lists — each a question the relay can be asked alone, most results first.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import {
  belongsTo,
  byResults,
  categoryTestId,
  groupCategories,
  isKindKey,
  kindCategories,
  kindsLabelled,
  listCategory,
  pagedWords,
  pluralLabel,
  rowOrder,
  standingCategories,
  tabOf,
} from "./allCategories";

let seq = 0;
const hit = (kind: number, tags: string[][] = []) => ({
  event: {
    id: (++seq).toString(16).padStart(64, "0"),
    kind,
    pubkey: "a".repeat(64),
    tags,
    content: "",
    created_at: 1,
    sig: "",
  } as NostrEvent,
  author: null,
  rank: null,
});
const BOOKS = `39998:${"b".repeat(64)}:books`;

describe("pluralLabel", () => {
  it("puts a row's label in the plural", () => {
    expect(
      ["Video", "Note", "Article", "Web bookmark", "Patch", "Status", "Library", "Person"].map(pluralLabel),
    ).toEqual(["Videos", "Notes", "Articles", "Web bookmarks", "Patches", "Statuses", "Libraries", "People"]);
  });

  it("leaves a kind with no name, a word with no plural and one already plural as it is", () => {
    expect(pluralLabel("Kind 12345")).toBe("Kind 12345");
    expect(pluralLabel("Audio")).toBe("Audio");
    expect(pluralLabel("Search relays")).toBe("Search relays");
  });
});

describe("kindCategories", () => {
  it("is a category per label, asking every kind of that name: the video kinds are one Videos", () => {
    const found = kindCategories([hit(1), hit(21), hit(30023), hit(22)]);
    expect(found.map((c) => [c.key, c.name, c.kinds])).toEqual([
      ["kind:Note", "Notes", [1, 11]],
      ["kind:Video", "Videos", [21, 22, 34235, 34236]],
      ["kind:Article", "Articles", [30023]],
    ]);
    expect(isKindKey(found[0].key)).toBe(true);
    expect(isKindKey(BOOKS)).toBe(false);
  });

  it("leaves out the rows a list holds", () => {
    const book = hit(39999, [["z", BOOKS]]);
    const stray = hit(39999);
    expect(kindCategories([book, stray, hit(1)], new Set([book.event.id])).map((c) => c.name)).toEqual([
      "List items",
      "Notes",
    ]);
  });

  it("a kind's page keeps the rows its label names", () => {
    const [videos] = kindCategories([hit(21)]);
    expect(belongsTo(videos, hit(34235))).toBe(true);
    expect(belongsTo(videos, hit(1))).toBe(false);
  });
});

describe("listCategory", () => {
  it("asks a list's items by the headers they are filed under, and keeps every row it is sent", () => {
    const books = listCategory({ coordinate: BOOKS, name: "Books", headers: [BOOKS, "39998:c:books"] });
    expect(books).toEqual({
      key: BOOKS,
      name: "Books",
      kinds: [39999, 9999],
      tags: { "#z": [BOOKS, "39998:c:books"] },
    });
    expect(belongsTo(books, hit(39999))).toBe(true);
    expect(categoryTestId(books.key)).toBe("books");
  });
});

describe("byResults", () => {
  it("puts the most results first, a count not known after them, then by name", () => {
    const [notes, videos, articles] = kindCategories([hit(1), hit(21), hit(30023)]);
    const order = byResults(
      [notes, videos, articles],
      new Map([
        ["kind:Note", 5],
        ["kind:Video", 40],
        ["kind:Article", null],
      ]),
    );
    expect(order.map((c) => c.name)).toEqual(["Videos", "Notes", "Articles"]);
  });
});

it("kindsLabelled names every kind lib/kindLabel calls by a label", () => {
  expect(kindsLabelled("Event")).toEqual([31922, 31923, 31924]);
  expect(kindsLabelled("Nothing of the sort")).toEqual([]);
});

it("pagedWords says one in the singular", () => {
  const [videos] = kindCategories([hit(21)]);
  expect(pagedWords(videos, 1)).toBe("1 Video");
  expect(pagedWords(videos, 3)).toBe("3 Videos");
});

describe("standingCategories", () => {
  it("are the kinds Top's tabs ask, by label, Events and Recipes as their tabs ask them — never a list's kinds", () => {
    const standing = standingCategories();
    const keys = standing.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["kind:Note", "kind:Person", "kind:Video", "kind:Repo", "kind:Event"]));
    expect(standing.find((c) => c.key === "kind:Event")).toMatchObject({ tab: "events" });
    // Event Index's items are list items: the Events page keeps every row, not the calendar label's alone.
    expect(standing.find((c) => c.key === "kind:Event")?.label).toBeUndefined();
    expect(standing.find((c) => c.key === "kind:Recipe")).toMatchObject({ tab: "recipes", label: "Recipe" });
    expect(standing.some((c) => c.kinds.includes(39999) || c.kinds.includes(39998))).toBe(false);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("rowOrder", () => {
  it("leads with Notes, People and the biggest list when each has any, then the rest by results", () => {
    const [notes, people, videos] = kindCategories([hit(1), hit(0), hit(21)]);
    const books = listCategory({ coordinate: BOOKS, name: "Books", headers: [BOOKS] });
    const places = listCategory({ coordinate: `39998:${"c".repeat(64)}:places`, name: "Places", headers: [] });
    const counts = new Map<string, number | null>([
      [notes.key, 3],
      [people.key, 0],
      [videos.key, 900],
      [books.key, 20],
      [places.key, 50],
    ]);
    expect(rowOrder([videos, books, places, people, notes], counts).map((c) => c.name)).toEqual([
      "Notes",
      "Places",
      "Videos",
      "Books",
      "People",
    ]);
  });
});

describe("tabOf", () => {
  const standing = (key: string) => standingCategories().find((c) => c.key === key)!;
  it("is the tab asking most of a kind's kinds, the narrowest on a tie, never one narrowed by tag", () => {
    expect(tabOf(standing("kind:Video"))).toBe("media");
    expect(tabOf(standing("kind:Article"))).toBe("articles");
    expect(tabOf(standing("kind:Spec"))).toBe("nips");
    expect(tabOf(standing("kind:Recipe"))).toBe("recipes");
    expect(tabOf(standing("kind:Event"))).toBe("events");
  });
  it("is none for a list, or a kind no tab asks for", () => {
    expect(tabOf(listCategory({ coordinate: BOOKS, name: "Books", headers: [BOOKS] }))).toBeNull();
    expect(tabOf(kindCategories([hit(7)])[0])).toBeNull();
  });
});

describe("groupCategories", () => {
  const GROUPS = [
    { title: "Notes & people", tabs: ["notes", "people"] as const },
    { title: "Media", tabs: ["media"] as const },
    { title: "Read & listen", tabs: ["articles", "music", "recipes"] as const },
    { title: "Out & about", tabs: ["events", "live"] as const },
    { title: "Build", tabs: ["repos", "nips"] as const },
  ].map((g) => ({ ...g, tabs: [...g.tabs] }));
  const PLACES = `39998:${"c".repeat(64)}:food-and-drink-places`;
  const by = (key: string) => standingCategories().find((c) => c.key === key)!;
  const list = (coordinate: string, name: string) => listCategory({ coordinate, name, headers: [coordinate] });

  it("puts each kind under its tab's heading, in the headings' order, keeping the order each came in", () => {
    const [reaction] = kindCategories([hit(7)]);
    const groups = groupCategories(
      [by("kind:Repo"), by("kind:Video"), reaction, by("kind:Article"), by("kind:Spec"), by("kind:Photo")],
      GROUPS,
    );
    expect(groups.map((g) => [g.title, g.categories.map((c) => c.name)])).toEqual([
      ["Media", ["Videos", "Photos"]],
      ["Read & listen", ["Articles"]],
      ["Build", ["Repos", "Specs"]],
      ["Other", ["Reactions"]],
    ]);
  });

  it("puts a list under its kind's page's heading, the rest under the Dictionary's, after the first heading", () => {
    const groups = groupCategories(
      [list(PLACES, "Food and Drink Places"), by("kind:Event"), list(BOOKS, "Books"), by("kind:Comment")],
      GROUPS,
      new Map([[BOOKS, "Read & listen"]]),
    );
    expect(groups.map((g) => [g.title, g.categories.map((c) => c.name)])).toEqual([
      ["Notes & people", ["Comments"]],
      ["Dictionary", ["Food and Drink Places"]],
      ["Read & listen", ["Books"]],
      ["Out & about", ["Events"]],
    ]);
  });
});
