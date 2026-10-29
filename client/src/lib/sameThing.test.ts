/**
 * Two copies of one thing on a list — the same GitHub account filed by two
 * people — are one result, carrying both copies' endorsements. Two branches
 * of one chain are two places, told apart by their street when their rows
 * would otherwise read the same.
 */
import { describe, expect, it } from "vitest";
import { collapseSameThing, tellApart } from "./sameThing";

describe("collapseSameThing", () => {
  const hit = (id: string, key: string | null) => ({ id, key });

  it("keeps the first of each thing, with the ids of all its copies, in the order given", () => {
    const out = collapseSameThing([hit("a", "sam-dev"), hit("b", "kim-dev"), hit("c", "sam-dev")], (h) => h.key);
    expect(out.map((h) => [h.id, h.copies])).toEqual([
      ["a", ["a", "c"]],
      ["b", ["b"]],
    ]);
  });

  it("never merges what has no identity", () => {
    const out = collapseSameThing([hit("a", null), hit("b", null)], (h) => h.key);
    expect(out.map((h) => h.id)).toEqual(["a", "b"]);
  });
});

describe("tellApart", () => {
  const row = (title: string, line: string, street: string | null) => ({ title, line, street });

  it("adds the street to rows that would read the same", () => {
    const out = tellApart([
      row("Pink Owl Coffee", "Cafe · San Rafael", "1100 Fourth Street"),
      row("Pink Owl Coffee", "Cafe · San Rafael", "625 Du Bois Street"),
      row("Pink Owl Coffee", "Cafe · Petaluma", "617 East Washington Street"),
    ]);
    expect(out).toEqual([
      "Cafe · San Rafael · 1100 Fourth Street",
      "Cafe · San Rafael · 625 Du Bois Street",
      "Cafe · Petaluma",
    ]);
  });

  it("leaves a row as it is when it has no street to add", () => {
    expect(tellApart([row("Starbucks", "Cafe", null), row("Starbucks", "Cafe", null)])).toEqual(["Cafe", "Cafe"]);
  });
});
