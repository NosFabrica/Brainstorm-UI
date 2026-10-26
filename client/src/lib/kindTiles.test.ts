/**
 * The kinds on All's page as tiles: named as the rows' badges name them, in the plural.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { isKindKey, kindTiles, pluralLabel } from "./kindTiles";

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

describe("pluralLabel", () => {
  it("puts a row's label in the plural", () => {
    expect(
      ["Video", "Note", "Article", "Web bookmark", "Patch", "Status", "Library", "Person"].map(pluralLabel),
    ).toEqual(["Videos", "Notes", "Articles", "Web bookmarks", "Patches", "Statuses", "Libraries", "People"]);
  });

  it("leaves a kind with no name, and a word with no plural, as it is", () => {
    expect(pluralLabel("Kind 12345")).toBe("Kind 12345");
    expect(pluralLabel("Audio")).toBe("Audio");
  });
});

describe("kindTiles", () => {
  it("is a tile per label, most rows first: the video kinds are one Videos tile", () => {
    const hits = [hit(1), hit(21), hit(34235), hit(30023), hit(22), hit(1)];
    expect(kindTiles(hits).map((t) => [t.name, t.hits.length])).toEqual([
      ["Videos", 3],
      ["Notes", 2],
      ["Articles", 1],
    ]);
  });

  it("keeps All's order within a tile, and a key the link can tell from a list's", () => {
    const [a, b] = [hit(1), hit(1)];
    const [notes] = kindTiles([a, hit(20), b]);
    expect(notes.hits).toEqual([a, b]);
    expect(notes.key).toBe("kind:Note");
    expect(isKindKey(notes.key)).toBe(true);
    expect(isKindKey(`39998:${"b".repeat(64)}:books`)).toBe(false);
  });

  it("leaves out the rows a list tile holds", () => {
    const book = hit(39999, [["z", `39998:${"b".repeat(64)}:books`]]);
    const stray = hit(39999);
    expect(kindTiles([book, stray, hit(1)], new Set([book.event.id])).map((t) => [t.name, t.hits])).toEqual([
      ["List items", [stray]],
      ["Notes", [expect.anything()]],
    ]);
  });
});
