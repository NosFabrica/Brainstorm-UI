import { describe, it, expect } from "vitest";
import { isBlankEvent } from "./blankEvent";

// Zap Cooking's "deleted" recipes (search relay, 2026-09-24): the author
// overwrote the article instead of publishing a kind-5 deletion, and the
// husk rendered as a "[Deleted]" article everywhere.
const ev = (kind: number, content: string, tags: string[][]) => ({ id: "e".repeat(64), pubkey: "a".repeat(64), kind, created_at: 1_785_238_855, content, tags });

describe("isBlankEvent — a husk is not a post", () => {
  it("an article overwritten to nothing is blank, tombstone tag and all", () => {
    expect(isBlankEvent(ev(30023, "", [["d", "cheese-foam-tea"], ["deleted", "true"], ["title", "[Deleted]"]]))).toBe(true);
  });

  it("a tombstone tag alone is enough, whatever else the event carries", () => {
    expect(isBlankEvent(ev(30023, "Old text still here", [["d", "x"], ["deleted", "true"], ["title", "Cheese foam tea"]]))).toBe(true);
  });

  it("empty content with only housekeeping tags is blank", () => {
    expect(isBlankEvent(ev(1, "   \n", []))).toBe(true);
    expect(isBlankEvent(ev(30023, "", [["d", "x"], ["published_at", "1"], ["client", "habla"], ["alt", "an article"]]))).toBe(true);
    expect(isBlankEvent(ev(30023, "", [["d", "x"], ["title", "Deleted"]]))).toBe(true);
  });

  it("empty content with a tag that says something is a post — listings, follows, relay lists", () => {
    expect(isBlankEvent(ev(30402, "", [["d", "soap"], ["title", "Tallow soap"], ["price", "11", "USD"]]))).toBe(false);
    expect(isBlankEvent(ev(3, "", [["p", "b".repeat(64)]]))).toBe(false);
    expect(isBlankEvent(ev(10002, "", [["r", "wss://nos.lol"]]))).toBe(false);
    expect(isBlankEvent(ev(1063, "", [["url", "https://cdn/x.mp4"], ["m", "video/mp4"]]))).toBe(false);
  });

  it("any real content is a post, however short", () => {
    expect(isBlankEvent(ev(7, "+", []))).toBe(false);
    expect(isBlankEvent(ev(1, "gm", []))).toBe(false);
    expect(isBlankEvent(ev(30023, "# Cheese foam tea", [["d", "x"], ["title", "Cheese foam tea"]]))).toBe(false);
  });
});
