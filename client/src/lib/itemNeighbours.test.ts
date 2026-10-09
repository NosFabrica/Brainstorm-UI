import { describe, expect, it } from "vitest";
import { neighboursOf } from "@/lib/itemNeighbours";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";

const header: HeaderEvent = {
  id: "h".repeat(64),
  pubkey: "a".repeat(64),
  kind: 39998,
  created_at: 1,
  tags: [
    ["d", "github-accounts"],
    ["names", "GitHub Account", "GitHub Accounts"],
    ["required", "github-username"],
  ],
};
const definition = definitionOf(header);

const item = (id: string, author: string, username?: string) => ({
  id,
  pubkey: author.repeat(64),
  tags: username ? [["github-username", username]] : [],
});

describe("neighboursOf — an item among the rest of its list", () => {
  const mine = item("1", "a", "vitorpamplona");
  const items = [
    mine,
    item("2", "b", "VitorPamplona"),
    item("3", "b", "vitorpamplona"),
    item("4", "a", "vitorpamplona"),
    item("5", "c", "vcavallo"),
    item("6", "d", "vcavallo"),
    item("7", "a", "aburra16"),
    item("8", "a"),
  ];

  it("names everyone else who listed the same thing, once each, whatever the case", () => {
    expect(neighboursOf(mine, items, definition).alsoListedBy).toEqual(["b".repeat(64)]);
  });

  it("offers the list's other things, one of each, without this one or any that lack the required field", () => {
    expect(neighboursOf(mine, items, definition).more.map((i) => i.id)).toEqual(["5", "7"]);
  });

  it("counts the distinct things in the list, this one included", () => {
    expect(neighboursOf(mine, items, definition).total).toBe(3);
  });

  it("stops at the number of others asked for", () => {
    expect(neighboursOf(mine, items, definition, 1).more.map((i) => i.id)).toEqual(["5"]);
  });

  it("an item without the required field has no one else behind it", () => {
    expect(neighboursOf(item("8", "a"), items, definition).alsoListedBy).toEqual([]);
  });

  it("tells items apart by the required field even when the title is another field some lack", () => {
    const named = definitionOf({
      ...header,
      tags: [...header.tags, ["optional", "description"], ["display", "title", "description"]],
    });
    expect(neighboursOf(mine, items, named).alsoListedBy).toEqual(["b".repeat(64)]);
    expect(neighboursOf(mine, items, named).more.map((i) => i.id)).toEqual(["5", "7"]);
  });
});
