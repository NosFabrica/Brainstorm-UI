import { describe, expect, it } from "vitest";
import { listItemCounts, listTitle, readListItems } from "./listItems";

const PK = "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331";
const N1 = "8b27ce0176d923e44ca50063d934be916f75e93d2cf4c0df98e797cd1aa67190";
const N2 = "d051d3b95d29513ec0446015a4133eadae00b50c8fbe8d02db2dde3132a6d043";

// A kind-30003 notes pin from search.brainstorm.world (2026-10-08).
const PIN = {
  kind: 30003,
  content: "",
  tags: [
    ["d", "notes-pin-2efaa715-2efaa715-stoicism"],
    ["z", "39998:82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833:tag-pinning"],
    ["title", "stoicism — notes"],
    ["description", 'Notes tagged "stoicism", pinned by 2efaa715…'],
    ["e", N1],
    ["e", N2, "wss://relay.example"],
    ["e", N1],
  ],
};

describe("readListItems", () => {
  it("reads a bookmark set's notes in order, once each, with their relay hints", () => {
    const items = readListItems(PIN);
    expect(items.notes).toEqual([{ id: N1 }, { id: N2, relay: "wss://relay.example" }]);
    expect(items.total).toBe(2);
    expect(items.sealed).toBe(false);
    expect(listItemCounts(items)).toEqual(["2 notes"]);
  });

  it("reads articles, people, hashtags and links, and counts an `a` as what it points at", () => {
    const items = readListItems({
      content: "",
      tags: [
        ["a", `30023:${PK}:why-stoicism`],
        ["a", `30023:${PK}:on-anger`, "wss://relay.example"],
        ["a", "not-a-coordinate"],
        ["p", PK],
        ["t", "#Stoicism"],
        ["r", "https://dailystoic.com/"],
        ["r", "wss://relay.example"],
      ],
    });
    expect(items.addresses.map((a) => a.identifier)).toEqual(["why-stoicism", "on-anger"]);
    expect(items.addresses[1].relays).toEqual(["wss://relay.example"]);
    expect(items.people).toEqual([PK]);
    expect(items.hashtags).toEqual(["stoicism"]);
    // A relay URL in `r` is not a link to read.
    expect(items.links).toEqual(["https://dailystoic.com/"]);
    expect(listItemCounts(items)).toEqual(["2 articles", "1 person", "1 hashtag", "1 link"]);
  });

  it("says when items are sealed in the content", () => {
    expect(readListItems({ content: "AgK3c2Vh?iv=bG9yZW0=", tags: [] }).sealed).toBe(true);
  });
});

describe("listTitle", () => {
  it("is the title, else what the kind is called, else the d tag", () => {
    expect(listTitle(PIN)).toBe("stoicism — notes");
    expect(listTitle({ kind: 10003, tags: [] })).toBe("Bookmarks");
    expect(listTitle({ kind: 30003, tags: [["d", "reading"]] })).toBe("reading");
    expect(listTitle({ kind: 30003, tags: [] })).toBe("Untitled list");
  });
});
