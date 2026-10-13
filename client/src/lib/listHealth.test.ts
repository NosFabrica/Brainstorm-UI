/**
 * A list's health from its items' checks: the summary, and the search, filter
 * and sort the items table runs over them.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { definitionOf } from "./conceptResolution";
import { templateOf } from "./linkTemplates";
import type { ItemCheck } from "./listCheck";
import {
  checkList,
  EMPTY_QUERY,
  filterItems,
  problemKey,
  sortItems,
  summarize,
  titleMatchesFirst,
  type CheckedItem,
  type ItemQuery,
  type ItemSort,
} from "./listHealth";

const A = "a".repeat(64);
const B = "b".repeat(64);

const places = definitionOf({
  id: "0".repeat(64),
  pubkey: A,
  kind: 39998,
  created_at: 0,
  tags: [
    ["d", "places"],
    ["names", "Place", "Places"],
    ["required", "name"],
    ["optional", "website"],
    ["optional", "g"],
    ["field-type", "website", "url"],
    ["display", "title", "name"],
    ["display", "link", "website"],
  ],
});

const item = (id: string, pubkey: string, created_at: number, tags: string[][]): NostrEvent => ({
  id,
  pubkey,
  created_at,
  kind: 39999,
  tags: [["d", id], ...tags],
  content: "",
  sig: "",
});

const items = [
  item("i1", A, 40, [
    ["name", "Cafe (Uno)"],
    ["website", "https://uno.example"],
    ["g", "u0"],
  ]),
  item("i2", A, 30, [
    ["name", "bar dos"],
    ["website", "uno.example"],
  ]),
  item("i3", B, 20, [
    ["name", "Zed*"],
    ["g", "u0"],
    ["g", "u0q"],
  ]),
  item("i4", B, 10, [["website", "https://four.example"]]),
];

describe("listHealth", () => {
  const checked = checkList(places, items, new Map());
  const ids = (q: Partial<ItemQuery>) => filterItems(places, checked, { ...EMPTY_QUERY, ...q }).map((c) => c.item.id);
  const order = (s: ItemSort) => sortItems(checked, s).map((c) => c.item.id);

  it("checks each item under the list's definition, in order", () => {
    expect(checked.map((c) => c.item.id)).toEqual(["i1", "i2", "i3", "i4"]);
    expect(checked[0].check.resolved.title).toBe("Cafe (Uno)");
  });

  it("keys a problem by its code and field", () => {
    expect(problemKey({ code: "repeated", field: "g" })).toBe("repeated:g");
    expect(problemKey({ code: "template-not-given", field: null })).toBe("template-not-given");
  });

  it("summarises a list", () => {
    const s = summarize(places, checked);
    expect(s).toMatchObject({ items: 4, curators: 2, withProblems: 3, blocked: 1 });
    expect(s.coverage).toEqual([
      { role: "title", count: 3 },
      { role: "link", count: 2 },
    ]);
    expect(s.problems.map((p) => [p.key, p.items, p.blocking])).toEqual([
      ["link-unusable:website", 1, false],
      ["repeated:g", 1, false],
      ["required-missing:name", 1, true],
    ]);
    expect(s.problems[2]).toMatchObject({ code: "required-missing", field: "name", example: expect.any(String) });
  });

  it("counts an item once however often a problem recurs on it", () => {
    const twice = [
      item("t1", A, 1, [
        ["name", "One"],
        ["g", "u0"],
        ["g", "u0q"],
        ["g", "u0r"],
      ]),
    ];
    const rows = summarize(places, checkList(places, twice, new Map())).problems;
    expect(rows.filter((p) => p.key === "repeated:g")).toHaveLength(1);
    expect(rows[0].items).toBe(1);
  });

  it("calls a problem blocking when any occurrence of it is", () => {
    /** An item whose check is written out by hand: one problem on its website, blocking or not. */
    const withProblem = (id: string, blocking: boolean): CheckedItem => ({
      item: item(id, A, 1, []),
      check: {
        problems: [{ code: "not-a-url", field: "website", message: `From ${id}.`, blocking }],
        resolved: checked[0].check.resolved,
      } satisfies ItemCheck,
    });
    const rowOf = (list: CheckedItem[]) => summarize(places, list).problems;
    // Whichever comes first: the row is one, counts both items, and blocks.
    expect(rowOf([withProblem("free", false), withProblem("stuck", true)])).toEqual([
      {
        key: "not-a-url:website",
        code: "not-a-url",
        field: "website",
        items: 2,
        blocking: true,
        example: "From free.",
      },
    ]);
    expect(rowOf([withProblem("stuck", true), withProblem("free", false)])).toEqual([
      {
        key: "not-a-url:website",
        code: "not-a-url",
        field: "website",
        items: 2,
        blocking: true,
        example: "From stuck.",
      },
    ]);
    expect(rowOf([withProblem("free", false), withProblem("easy", false)])[0].blocking).toBe(false);
  });

  it("counts the roles a list gives, and template links only when every one builds", () => {
    const tpl = "c".repeat(64);
    const rich = definitionOf({
      id: "1".repeat(64),
      pubkey: A,
      kind: 39998,
      created_at: 0,
      tags: [
        ["d", "books"],
        ["required", "title"],
        ["optional", "author"],
        ["optional", "isbn"],
        ["display", "title", "title"],
        ["display", "summary", "author"],
        ["display", "fact", "isbn"],
        ["link", tpl, "wss://relay.example", "isbn", "isbn"],
      ],
    });
    const template = templateOf({
      id: tpl,
      pubkey: B,
      tags: [
        ["name", "Open Library"],
        ["url-template", "https://openlibrary.org/isbn/{isbn}"],
      ],
    })!;
    const list = [
      item("b1", A, 2, [
        ["title", "Dune"],
        ["author", "Frank Herbert"],
        ["isbn", "1"],
      ]),
      item("b2", A, 1, [
        ["title", "Emma"],
        ["author", "  "],
      ]),
    ];
    const s = summarize(rich, checkList(rich, list, new Map([[tpl, template]])));
    expect(s.coverage).toEqual([
      { role: "title", count: 2 },
      { role: "summary", count: 1 },
      { role: "facts", count: 1 },
      { role: "templateLinks", count: 1 },
    ]);
  });

  it("has no facts row when every fact is a field another role shows, nor a summary row for the title's own field", () => {
    const shown = definitionOf({
      id: "2".repeat(64),
      pubkey: A,
      kind: 39998,
      created_at: 0,
      tags: [
        ["d", "notes"],
        ["names", "Note", "Notes"],
        ["required", "name"],
        ["display", "title", "name"],
        ["display", "summary", "name"],
        ["display", "fact", "name"],
      ],
    });
    const s = summarize(shown, checkList(shown, [item("n1", A, 1, [["name", "One"]])], new Map()));
    expect(s.coverage).toEqual([{ role: "title", count: 1 }]);
  });

  it("summarises an empty list without dividing by anything", () => {
    expect(summarize(places, [])).toEqual({
      items: 0,
      curators: 0,
      withProblems: 0,
      blocked: 0,
      coverage: [],
      problems: [],
    });
  });

  it("searches literally, whatever the case or spacing", () => {
    expect(ids({ text: "  CAFE   (uno) " })).toEqual(["i1"]);
    expect(ids({ text: "zed*" })).toEqual(["i3"]);
    expect(ids({ text: "(" })).toEqual(["i1"]);
    expect(ids({ text: "four.example" })).toEqual(["i4"]);
    expect(ids({ text: "   " })).toEqual(["i1", "i2", "i3", "i4"]);
  });

  it("folds accents and case, as the Dictionary's filter does", () => {
    const cafes = checkList(places, [item("c1", A, 1, [["name", "Café Uno"]])], new Map());
    const found = (text: string) => filterItems(places, cafes, { ...EMPTY_QUERY, text }).length;
    expect(found("cafe")).toBe(1);
    expect(found("CAFÉ")).toBe(1);
    expect(found("café uno")).toBe(1);
    expect(found("cafes")).toBe(0);
  });

  it("filters by curator, by problem, and to items with problems", () => {
    expect(ids({ curator: B })).toEqual(["i3", "i4"]);
    expect(ids({ problem: "repeated:g" })).toEqual(["i3"]);
    expect(ids({ onlyProblems: true })).toEqual(["i2", "i3", "i4"]);
  });

  it("sorts by newest, by title with untitled last, and by most problems", () => {
    expect(order("newest")).toEqual(["i1", "i2", "i3", "i4"]);
    expect(order("title")).toEqual(["i2", "i1", "i3", "i4"]);
    expect(order("problems")[0]).not.toBe("i1");
    expect(order("problems").at(-1)).toBe("i1");
  });

  it("sorts into a new array and breaks a tie on id", () => {
    const tied = checkList(places, [item("z", A, 5, [["name", "x"]]), item("y", A, 5, [["name", "x"]])], new Map());
    const sorted = sortItems(tied, "newest");
    expect(sorted).not.toBe(tied);
    expect(sorted.map((c) => c.item.id)).toEqual(["y", "z"]);
    expect(tied.map((c) => c.item.id)).toEqual(["z", "y"]);
  });

  describe("titleMatchesFirst", () => {
    const named = (id: string, name: string | null, address: string) =>
      item(id, A, 1, [...(name ? [["name", name]] : []), ["address", address]]);
    const found = checkList(
      places,
      [
        named("t1", "Bar No. 7", "1 High Street"),
        named("c2", "Cafe Uno", "7 Bar Street"),
        named("t3", "7 Express Pizza Bar", "2 Low Road"),
        named("u4", null, "Bar 7"),
      ],
      new Map(),
    );
    const idsOf = (rows: readonly CheckedItem[]) => rows.map((c) => c.item.id);

    it("puts the items whose title holds every word first, each group in its incoming order", () => {
      expect(idsOf(titleMatchesFirst(found, "bar 7"))).toEqual(["t1", "t3", "c2", "u4"]);
    });

    it("ignores case and accents in the title and the words", () => {
      const accented = checkList(
        places,
        [named("a1", "Grand Hotel", "x"), named("a2", "Café Münchner", "y"), named("a3", "Plain", "munchner")],
        new Map(),
      );
      expect(idsOf(titleMatchesFirst(accented, "CAFE munchner"))).toEqual(["a2", "a1", "a3"]);
    });

    it("leaves the items as they came for empty or blank text", () => {
      expect(idsOf(titleMatchesFirst(found, ""))).toEqual(["t1", "c2", "t3", "u4"]);
      expect(idsOf(titleMatchesFirst(found, "  \t "))).toEqual(["t1", "c2", "t3", "u4"]);
    });

    it("returns a new array and leaves its input as it was", () => {
      const before = idsOf(found);
      const out = titleMatchesFirst(found, "bar 7");
      expect(out).not.toBe(found);
      expect(idsOf(found)).toEqual(before);
      expect(idsOf(titleMatchesFirst(found, ""))).toEqual(before);
      expect(titleMatchesFirst(found, "")).not.toBe(found);
    });
  });
});
