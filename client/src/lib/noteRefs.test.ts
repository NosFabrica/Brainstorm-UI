import { describe, expect, it } from "vitest";
import { analyzeNote, replyRefs } from "./noteRefs";

const ev = (kind: number, tags: string[][]) => ({ id: "", kind, pubkey: "", created_at: 0, content: "", tags });

describe("replyRefs", () => {
  it("a reply's root and parent", () => {
    expect(
      replyRefs(
        ev(1, [
          ["e", "r", "", "root"],
          ["e", "p", "", "reply"],
        ]),
      ),
    ).toEqual({ rootId: "r", parentId: "p" });
  });

  it("a highlight's `e` is the text it quotes, not a post it answers", () => {
    expect(replyRefs(ev(9802, [["e", "source"]]))).toEqual({});
  });
});

describe("a list's `e` tags are items, not a thread", () => {
  // A kind-30003 notes pin from search.brainstorm.world (2026-10-08): six notes, no markers.
  const pin = ev(30003, [
    ["d", "notes-pin-2efaa715-2efaa715-stoicism"],
    ["title", "stoicism — notes"],
    ["e", "8b27ce0176d923e44ca50063d934be916f75e93d2cf4c0df98e797cd1aa67190"],
    ["e", "ef7be3aca3019a58de3dd4f8c4eff6e66264e24bf45103edf9d95f8f775aa972"],
    ["p", "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331"],
  ]);

  it("has no root or parent", () => {
    expect(replyRefs(pin)).toEqual({});
  });

  it("is not a reply to anyone", () => {
    const a = analyzeNote(pin);
    expect(a.isReply).toBe(false);
    expect(a.replyToPubkeys).toEqual([]);
  });

  it("a comment (NIP-22) still threads by its `e`", () => {
    expect(replyRefs(ev(1111, [["e", "parent"]]))).toEqual({ rootId: "parent", parentId: "parent" });
    expect(analyzeNote(ev(1111, [["e", "parent"]])).isReply).toBe(true);
  });

  it("a legacy positional note reply still threads", () => {
    expect(
      replyRefs(
        ev(1, [
          ["e", "r"],
          ["e", "p"],
        ]),
      ),
    ).toEqual({ rootId: "r", parentId: "p" });
  });
});
