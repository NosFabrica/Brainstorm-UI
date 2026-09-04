// @vitest-environment node
/**
 * Trending topics for the home feed: the hashtags rising across the notes
 * the feed already fetched — no extra requests. A tag has to recur across
 * different authors to count (one person's ten posts is not a trend), and
 * the list is short and ranked.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { trendingTags } from "./feedTrending";

const note = (id: string, pubkey: string, tags: string[]): SearchHit => ({
  event: { id, kind: 1, pubkey, created_at: 1, content: "", sig: "", tags: tags.map((t) => ["t", t]) } as NostrEvent,
  author: null,
  rank: null,
});
const A = "a".repeat(64), B = "b".repeat(64), C = "c".repeat(64);

describe("trendingTags", () => {
  it("ranks tags by how many different people used them, at least two", () => {
    const hits = [
      note("1", A, ["Bitcoin", "nostr"]),
      note("2", B, ["bitcoin", "lightning"]),
      note("3", C, ["bitcoin", "nostr", "Lightning"]),
      note("4", A, ["nostr"]), // A again — doesn't add a voice
      note("5", A, ["solo"]),
    ];
    expect(trendingTags(hits)).toEqual([
      { tag: "bitcoin", voices: 3 },
      { tag: "nostr", voices: 2 },
      { tag: "lightning", voices: 2 },
    ]);
  });

  it("caps the list and ignores tags too short or too long to be topics", () => {
    const many = Array.from({ length: 12 }, (_, i) => `tag${i}`);
    const hits = [note("1", A, [...many, "x", "a".repeat(40)]), note("2", B, [...many, "x", "a".repeat(40)])];
    const out = trendingTags(hits, { max: 8 });
    expect(out).toHaveLength(8);
    expect(out.map((t) => t.tag)).not.toContain("x");
    expect(out.map((t) => t.tag)).not.toContain("a".repeat(40));
  });

  it("is empty when nothing recurs", () => {
    expect(trendingTags([note("1", A, ["one"]), note("2", B, ["two"])])).toEqual([]);
  });
});
