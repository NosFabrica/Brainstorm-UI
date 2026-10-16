/**
 * Finding one item among hundreds on a Dictionary entry: the filter reads
 * the two lines a row shows — title and summary — and the sort is by name
 * or by when the item was listed.
 */
import { describe, expect, it } from "vitest";
import { definitionOf, type HeaderEvent } from "./conceptResolution";
import { filterItems, sortItems } from "./dictionaryItems";

const AVI = "b".repeat(64);
const header: HeaderEvent = {
  id: "1".repeat(64),
  pubkey: AVI,
  kind: 39998,
  created_at: 1_790_000_000,
  tags: [
    ["d", "food-and-drink-places"],
    ["names", "Food and Drink Place", "Food and Drink Places"],
    ["required", "name"],
    ["optional", "address"],
    ["optional", "locality"],
    ["display", "title", "name"],
    ["display", "summary", "address"],
  ],
};
const places = definitionOf(header);

const place = (id: string, created_at: number, fields: Record<string, string>) => ({
  id: id.padEnd(64, "0"),
  pubkey: AVI,
  kind: 39999,
  created_at,
  content: "",
  tags: [["d", id], ...Object.entries(fields)],
});
const choconat = place("choconat", 300, { name: "Choconat", address: "R1-L7 Guará 71020-218", locality: "Brasília" });
const elSapo = place("el-sapo", 100, { name: "El Sapo" });
const starbucks = place("starbucks", 200, { name: "Starbucks", address: "1 Main St" });
const all = [choconat, elSapo, starbucks];

describe("filterItems", () => {
  it("matches the title, ignoring case", () => {
    expect(filterItems(all, places, "SAPO")).toEqual([elSapo]);
  });

  it("matches the summary line too, ignoring accents", () => {
    expect(filterItems(all, places, "guara")).toEqual([choconat]);
  });

  it("every word must match, in any order", () => {
    expect(filterItems(all, places, "main starbucks")).toEqual([starbucks]);
    expect(filterItems(all, places, "main sapo")).toEqual([]);
  });

  it("does not read fields the row doesn't show", () => {
    expect(filterItems(all, places, "brasília")).toEqual([]);
  });

  it("a blank query keeps everything, in the order given", () => {
    expect(filterItems(all, places, "  ")).toEqual(all);
  });
});

describe("sortItems", () => {
  it("by name, A to Z, as the row titles them", () => {
    expect(sortItems(all, places, "name").map((i) => i.id)).toEqual([choconat.id, elSapo.id, starbucks.id]);
  });

  it("newest listed first, or oldest", () => {
    expect(sortItems(all, places, "newest").map((i) => i.created_at)).toEqual([300, 200, 100]);
    expect(sortItems(all, places, "oldest").map((i) => i.created_at)).toEqual([100, 200, 300]);
  });

  it("leaves the given array alone", () => {
    const copy = [...all];
    sortItems(all, places, "name");
    expect(all).toEqual(copy);
  });
});
