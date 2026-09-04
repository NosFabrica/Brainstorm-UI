import { describe, it, expect } from "vitest";
import { noteTitle } from "./noteTitle";

describe("noteTitle — a note's words as a title", () => {
  it("drops links and raw nostr: references, and every connector they leave dangling", () => {
    // Rabbit Hole Recap's episode posts: title, then the guests as mentions.
    expect(noteTitle("RHR 421: CATASTROPHIC COLDCARD BUG WITH nostr:nprofile1qqsabc AND nostr:nprofile1qqsdef https://blossom.primal.net/x.mp4"))
      .toBe("RHR 421: CATASTROPHIC COLDCARD BUG");
    expect(noteTitle("Weekly Bitcoin Themes — August 22–28, 2026\nThe three strongest narratives…")).toBe("Weekly Bitcoin Themes — August 22–28, 2026");
  });

  it("keeps a connector that is part of the words", () => {
    expect(noteTitle("Coffee with Bob and Alice")).toBe("Coffee with Bob and Alice");
  });

  it("cuts a long first line on a word, with an ellipsis", () => {
    const t = noteTitle("word ".repeat(40).trim(), 30);
    expect(t.length).toBeLessThanOrEqual(30);
    expect(t.endsWith("…")).toBe(true);
  });
});
