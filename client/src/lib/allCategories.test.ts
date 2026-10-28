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
  isKindKey,
  kindCategories,
  kindsLabelled,
  listCategory,
  pagedWords,
  pluralLabel,
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
