import { describe, expect, it } from "vitest";
import { ITEM_LIST_KINDS, isProfileBadges, listItemCounts, listTitle, readListItems } from "./listItems";

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

// NIP-58: a badge list holds pairs — an `a` for the kind-30009 badge and an `e`
// for the kind-8 award that proves it. The awards were counted as notes ("2 notes,
// 2 badges") and the list itself fell to the structural fallback.
describe("NIP-58 badge lists (10008, 30008)", () => {
  const badges = (d: string, kind = 30008) => ({
    kind,
    content: "",
    tags: [
      ["d", d],
      ["a", `30009:${PK}:bravery`],
      ["e", N1, "wss://relay.example"],
      ["a", `30009:${PK}:honor`],
      ["e", N2, "wss://relay.example"],
    ],
  });

  it("is a list of its badges; the awards behind them are not items", () => {
    const items = readListItems(badges("conferences"));
    expect(items.notes).toEqual([]);
    expect(items.addresses.map((a) => a.identifier)).toEqual(["bravery", "honor"]);
    expect(listItemCounts(items)).toEqual(["2 badges"]);
  });

  it("a 30008 badge set is named by its title or d; the deprecated profile_badges form is Profile badges", () => {
    expect(
      listTitle({
        kind: 30008,
        tags: [
          ["d", "conferences"],
          ["title", "Conference badges"],
        ],
      }),
    ).toBe("Conference badges");
    expect(listTitle(badges("profile_badges"))).toBe("Profile badges");
    expect(listTitle(badges("", 10008))).toBe("Profile badges");
    expect(isProfileBadges(badges("profile_badges"))).toBe(true);
    expect(isProfileBadges(badges("conferences"))).toBe(false);
  });

  it("is a list of things everywhere a list of things is drawn", () => {
    expect(ITEM_LIST_KINDS.has(30008)).toBe(true);
    expect(ITEM_LIST_KINDS.has(10008)).toBe(true);
  });
});

// NIP-51: a 30005 curation set holds kind-21 videos and a 30006 kind-20 pictures, both as `e`.
describe("curation sets of videos and pictures say what they hold", () => {
  const set = (kind: number) => ({
    kind,
    content: "",
    tags: [
      ["d", "x"],
      ["e", N1],
      ["e", N2],
    ],
  });

  it("counts videos and pictures, not notes", () => {
    expect(listItemCounts(readListItems(set(30005)))).toEqual(["2 videos"]);
    expect(listItemCounts(readListItems(set(30006)))).toEqual(["2 pictures"]);
    expect(listItemCounts(readListItems(set(30004)))).toEqual(["2 notes"]);
  });
});

describe("readListItems — Trusted Lists of things", () => {
  it("a 30393 holds its e members, best first, never its discovery a or p", () => {
    const items = readListItems({
      kind: 30393,
      content: '{"members":[]}',
      tags: [
        ["a", `39999:${"e".repeat(64)}:stoicism`],
        ["p", "4".repeat(64)],
        ["e", "b".repeat(64), "", "40"],
        ["e", "a".repeat(64), "", "90"],
      ],
    });
    expect(items.notes.map((n) => n.id)).toEqual(["a".repeat(64), "b".repeat(64)]);
    expect(items.addresses).toEqual([]);
    expect(items.people).toEqual([]);
    expect(items.total).toBe(2);
  });

  it("a 30395 holds its NIP-73 ids: links, hashtags and the rest as identifiers", () => {
    const items = readListItems({
      kind: 30395,
      content: "",
      tags: [
        ["i", "https://example.com/a"],
        ["i", "#bitcoin"],
        ["i", "isbn:9780141439518"],
      ],
    });
    expect(items.links).toEqual(["https://example.com/a"]);
    expect(items.hashtags).toEqual(["bitcoin"]);
    expect(items.identifiers).toEqual(["isbn:9780141439518"]);
    expect(listItemCounts(items)).toContain("1 identifier");
  });
});
