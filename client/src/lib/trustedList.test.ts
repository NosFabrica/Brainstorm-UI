import { describe, expect, it } from "vitest";
import { readTrustedList } from "./trustedList";

const OBSERVER = "4".repeat(64);
const TAG_AUTHOR = "e".repeat(64);
const ALICE = "1".repeat(64);
const BOB = "2".repeat(64);

const LIST = {
  tags: [
    ["d", "tl-tag-460c25e6-e5272de9-podcaster"],
    ["title", "Podcaster"],
    ["description", "This tag refers to someone who hosts one or more podcasts."],
    ["metric", "tag-membership"],
    ["observer", OBSERVER],
    ["source-tag", "f".repeat(64), TAG_AUTHOR, "podcaster"],
    ["cutoff", "1"],
    ["min-rank", "3"],
    ["rigor", "0.5"],
    ["p", BOB, "", "50"],
    ["p", ALICE, "", "93"],
  ],
};

describe("readTrustedList", () => {
  it("reads the list from its tags, members best first", () => {
    const list = readTrustedList(LIST);
    expect(list.title).toBe("Podcaster");
    expect(list.metric).toBe("tag-membership");
    expect(list.perspective).toBe(OBSERVER);
    expect(list.sourceTag).toEqual({ authorPubkey: TAG_AUTHOR, slug: "podcaster" });
    expect(list.params).toEqual([
      ["Min rank", "3"],
      ["Cutoff", "1"],
      ["Rigor", "0.5"],
    ]);
    expect(list.members).toEqual([
      { pubkey: ALICE, score: 93 },
      { pubkey: BOB, score: 50 },
    ]);
  });

  it("ignores the content: members come from the p rows only", () => {
    const list = readTrustedList({ tags: [["title", "X"]] });
    expect(list.members).toEqual([]);
    expect(list.params).toEqual([]);
    expect(list.sourceTag).toBeUndefined();
    expect(list.perspective).toBeUndefined();
  });

  it("keeps a member with no score, last", () => {
    const list = readTrustedList({
      tags: [
        ["p", BOB],
        ["p", ALICE, "", "40"],
        ["p", ALICE, "", "90"],
      ],
    });
    expect(list.members).toEqual([
      { pubkey: ALICE, score: 40 },
      { pubkey: BOB, score: null },
    ]);
  });
});
