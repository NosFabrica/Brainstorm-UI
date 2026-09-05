/**
 * The team: "We have multiple lists of the same tag" — ten "Nostr devs" packs
 * by nine people, 39% overlap; five "Bitcoin news" at 94%. Brainstorm's
 * pinned-tag follow sets, one per person who pins a tag. One row per title:
 * the lists folded behind it, the union counted, the faces most lists agree on.
 */
import { describe, expect, it } from "vitest";
import { groupPeoplePacks, normaliseListTitle } from "./listGroups";

const pack = (id: string, pubkey: string, title: string, members: string[], score: number | null = null) => ({
  event: { id, pubkey, kind: 30000, created_at: 1, tags: [["d", id], ["title", title], ...members.map((m) => ["p", m])], content: "" },
  score,
});
const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64), D = "d".repeat(64), E = "e".repeat(64);

describe("normaliseListTitle — the same tag however it was typed", () => {
  it("ignores case, a leading #, punctuation and a plural s", () => {
    expect(normaliseListTitle("#Bitcoin News")).toBe("bitcoin news");
    expect(normaliseListTitle("bitcoin-news")).toBe("bitcoin news");
    expect(normaliseListTitle("Bitcoin miners")).toBe("bitcoin miner");
    expect(normaliseListTitle("Nostr Devs ")).toBe("nostr dev");
    // Short words keep their s: "Nostr apps" and "Nostr app" differ by more than a plural to a reader? No — same pack.
    expect(normaliseListTitle("nostr apps")).toBe(normaliseListTitle("Nostr App"));
    expect(normaliseListTitle("news")).toBe("news");
  });
});

describe("groupPeoplePacks — one row per title", () => {
  it("folds same-title packs behind the most trusted curator's, counting the union and ranking faces by agreement", () => {
    const items = [
      pack("l1", "1".repeat(64), "Nostr devs", [A, B, C], 0.5),
      pack("l2", "2".repeat(64), "#nostr-devs", [A, B, D], 0.9),
      pack("l3", "3".repeat(64), "Nostr Dev", [A, E], 0.7),
      pack("l4", "4".repeat(64), "Bitcoin news", [A, B], 0.8),
    ];
    const groups = groupPeoplePacks(items, (x) => x);
    expect(groups.map((g) => g.primary.event.id)).toEqual(["l2", "l4"]);
    const devs = groups[0];
    expect(devs.others.map((o) => o.event.id)).toEqual(["l3", "l1"]);
    expect(devs.lists).toBe(3);
    expect(devs.members).toBe(5);
    // A is in all three, B in two, then the rest in the primary's order.
    expect(devs.consensus.slice(0, 2)).toEqual([A, B]);
    expect(devs.consensus).toHaveLength(5);
    expect(groups[1].lists).toBe(1);
  });

  it("leaves a lone pack and any non-people list alone", () => {
    const bookmarks = { event: { id: "bm", pubkey: "9".repeat(64), kind: 30003, created_at: 1, tags: [["title", "Reading"], ["e", "x".repeat(64)]], content: "" }, score: null };
    const groups = groupPeoplePacks([pack("l1", "1".repeat(64), "Art", [A]), bookmarks], (x) => x);
    expect(groups.map((g) => [g.primary.event.id, g.lists])).toEqual([["l1", 1], ["bm", 1]]);
  });
});
