import { describe, expect, it } from "vitest";
import { replyRefs } from "./noteRefs";

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
