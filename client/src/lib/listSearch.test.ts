import { describe, expect, it } from "vitest";
import { listQueryOf, matchListItems } from "@/lib/listSearch";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";

const GITHUB = "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts";
const BOOKS = "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books";

const concepts = [
  { coordinate: GITHUB, singular: "GitHub Account", plural: "GitHub Accounts" },
  { coordinate: BOOKS, singular: "Book", plural: "Books" },
];

describe("listQueryOf — a search that names a list", () => {
  it("reads 'github vcavallo' as vcavallo among GitHub Accounts", () => {
    expect(listQueryOf("github vcavallo", concepts)).toEqual({ coordinate: GITHUB, words: ["vcavallo"] });
  });

  it("takes the list's name in either number, any case, anywhere in the words", () => {
    expect(listQueryOf("Tolkien BOOK", concepts)).toEqual({ coordinate: BOOKS, words: ["tolkien"] });
    expect(listQueryOf("vcavallo github accounts", concepts)).toEqual({ coordinate: GITHUB, words: ["vcavallo"] });
  });

  it("is not a list search without a word of a list's name", () => {
    expect(listQueryOf("vcavallo", concepts)).toBeNull();
  });

  it("is not a list search when the name is all there is", () => {
    expect(listQueryOf("github", concepts)).toBeNull();
    expect(listQueryOf("github accounts", concepts)).toBeNull();
  });

  it("does not take part of a word for the name", () => {
    expect(listQueryOf("bookshelf oak", concepts)).toBeNull();
  });

  it("is not named by filler in its name: joining words, articles, bare numbers", () => {
    const FOOD = "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:food-and-drink-places";
    const V4V = "39998:77599c5c4a7ba08456679d812a414037f4b01c975fb4f577187df11d189f80d3:b504f5a8";
    const lists = [
      { coordinate: FOOD, singular: "Food and Drink Place", plural: "Food and Drink Places" },
      { coordinate: V4V, singular: "Value 4 Value Song", plural: "Value 4 Value Songs" },
    ];
    expect(listQueryOf("salt and pepper", lists)).toBeNull();
    expect(listQueryOf("top 4 albums", lists)).toBeNull();
    expect(listQueryOf("food truck", lists)).toEqual({ coordinate: FOOD, words: ["truck"] });
    // "and" is still a word to find once the list is named.
    expect(listQueryOf("drink salt and pepper", lists)).toEqual({ coordinate: FOOD, words: ["salt", "and", "pepper"] });
  });
});

const header: HeaderEvent = {
  id: "h".repeat(64),
  pubkey: "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450",
  kind: 39998,
  created_at: 1,
  tags: [
    ["d", "github-accounts"],
    ["names", "GitHub Account", "GitHub Accounts"],
    ["required", "github-username"],
    ["optional", "description"],
  ],
};
const definition = definitionOf(header);

const item = (id: string, username: string, description?: string) => ({
  id,
  pubkey: "c".repeat(64),
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [["z", GITHUB], ["github-username", username], ...(description ? [["description", description]] : [])],
});

describe("matchListItems — the items the words find", () => {
  const items = [
    item("1", "fiatjaf", "nostr relays, written with vcavallo in mind"),
    item("2", "vcavallo"),
    item("3", "not-vcavallo"),
    item("4", "pablof7z"),
  ];

  it("finds by the title field, a title that starts with the words first, then the summary", () => {
    expect(matchListItems(items, definition, ["vcavallo"]).map((i) => i.id)).toEqual(["2", "3", "1"]);
  });

  it("needs every word", () => {
    expect(matchListItems(items, definition, ["nostr", "relays"]).map((i) => i.id)).toEqual(["1"]);
    expect(matchListItems(items, definition, ["nostr", "pablo"])).toEqual([]);
  });

  it("stops at the number asked for", () => {
    expect(matchListItems(items, definition, ["vcavallo"], 2).map((i) => i.id)).toEqual(["2", "3"]);
  });
});
