import { describe, expect, it } from "vitest";
import { interactionSummary, interactionLine } from "@/lib/interactionSummary";

const ME = "f".repeat(64);
const THEM = "a".repeat(64);
const OTHER = "b".repeat(64);

const ev = (kind: number, created_at: number, p: string[]) => ({
  kind,
  created_at,
  pubkey: ME,
  tags: p.map((x) => ["p", x]),
});
const room = (authors: string[], lastAt: number) => ({
  messages: authors.map((author, i) => ({ author, createdAt: lastAt - i })),
});

describe("interactionSummary — what the reader has had to do with an account", () => {
  it("adds up follows, messages both ways, and the reader's own replies, reactions and reposts", () => {
    const s = interactionSummary(THEM, {
      me: ME,
      follows: new Set([THEM]),
      muted: () => false,
      dmRoom: room([ME, THEM, ME], 1_700_000_500),
      myEvents: [
        ev(1, 1_700_000_100, [THEM]),
        ev(1, 1_700_000_200, [THEM, OTHER]),
        ev(7, 1_700_000_300, [THEM]),
        ev(6, 1_700_000_400, [THEM]),
        ev(1, 1_700_000_900, [OTHER]),
      ],
    });
    expect(s).toEqual({
      youFollow: true,
      youMuted: false,
      youMessaged: true,
      theyMessaged: true,
      replies: 2,
      reactions: 1,
      reposts: 1,
      lastAt: 1_700_000_500,
    });
    expect(interactionLine(s)).toEqual([
      "You follow them",
      "You've messaged each other",
      "2 replies",
      "1 reaction",
      "1 repost",
    ]);
  });

  it("a mute alone is still history", () => {
    const s = interactionSummary(THEM, { me: ME, follows: new Set(), muted: (pk) => pk === THEM, myEvents: [] });
    expect(interactionLine(s)).toEqual(["You muted them"]);
    expect(s.lastAt).toBeNull();
  });

  it("only one side writing says which side", () => {
    const theirs = interactionSummary(THEM, {
      me: ME,
      follows: new Set(),
      muted: () => false,
      dmRoom: room([THEM], 5),
      myEvents: [],
    });
    expect(interactionLine(theirs)).toEqual(["They've messaged you"]);
    const mine = interactionSummary(THEM, {
      me: ME,
      follows: new Set(),
      muted: () => false,
      dmRoom: room([ME], 5),
      myEvents: [],
    });
    expect(interactionLine(mine)).toEqual(["You've messaged them"]);
  });

  it("nothing at all is an empty line", () => {
    const s = interactionSummary(THEM, {
      me: ME,
      follows: new Set([OTHER]),
      muted: () => false,
      myEvents: [ev(1, 1, [OTHER])],
    });
    expect(interactionLine(s)).toEqual([]);
    expect(s.lastAt).toBeNull();
  });
});
