import { describe, expect, it } from "vitest";
import { byCount, offersTab, tabHolds, type TabEvidence } from "./tabCounts";

const evidence = (counts: TabEvidence["counts"], more: Partial<TabEvidence> = {}): TabEvidence => ({
  counts,
  ...more,
});

describe("tabHolds", () => {
  it("Top and All always hold something: they are the composed page and the relay's whole answer", () => {
    expect(tabHolds("top", evidence({}))).toBe(true);
    expect(tabHolds("all", evidence({ notes: 0 }))).toBe(true);
  });

  it("a count not in yet, or one that failed, is unknown, never empty", () => {
    expect(tabHolds("shop", evidence({}))).toBeNull();
    expect(tabHolds("shop", evidence({ shop: null }))).toBeNull();
    expect(tabHolds("shop", evidence({ shop: 0 }))).toBe(false);
    expect(tabHolds("shop", evidence({ shop: 2 }))).toBe(true);
  });

  it("People is empty only when no profile matches and the words name no tag whose people could lead it", () => {
    expect(tabHolds("people", evidence({ people: 0 }))).toBeNull();
    expect(tabHolds("people", evidence({ people: 0 }, { tagNamed: true }))).toBe(true);
    expect(tabHolds("people", evidence({ people: 0 }, { tagNamed: false }))).toBe(false);
  });

  it("Media is empty only when neither its kinds, nor the notes it keeps pictures from, nor a profile that could name a person match", () => {
    expect(tabHolds("media", evidence({ media: 0 }))).toBeNull();
    expect(tabHolds("media", evidence({ media: 0, notes: 5, people: 0 }))).toBeNull();
    expect(tabHolds("media", evidence({ media: 0, notes: 0, people: 2 }))).toBeNull();
    expect(tabHolds("media", evidence({ media: 0, notes: 0, people: null }))).toBeNull();
    expect(tabHolds("media", evidence({ media: 0, notes: 0, people: 0 }))).toBe(false);
  });

  it("under a from: scope Media leads with that person's latest media whatever the words: never empty", () => {
    expect(tabHolds("media", evidence({ media: 0, notes: 0, people: 0 }, { scoped: true }))).toBeNull();
    expect(tabHolds("notes", evidence({ notes: 0 }, { scoped: true }))).toBe(false);
  });

  it("Music draws on Wavlake, the Podcast Index and tagged musicians too, which no count covers: never empty", () => {
    expect(tabHolds("music", evidence({ music: 0, notes: 0, people: 0 }))).toBeNull();
    expect(tabHolds("music", evidence({ music: 3 }))).toBe(true);
  });
});

describe("offersTab", () => {
  it("the tab being read is always offered, even when it holds nothing", () => {
    expect(offersTab("events", true, evidence({ events: 0 }))).toBe(true);
    expect(offersTab("events", false, evidence({ events: 0 }))).toBe(false);
    expect(offersTab("events", false, evidence({}))).toBe(true);
  });
});

describe("byCount", () => {
  it("most results first, an unknown count after the known ones, equals keeping their order", () => {
    const tabs = [{ key: "articles" as const }, { key: "music" as const }, { key: "recipes" as const }];
    expect(byCount(tabs, { articles: 2, music: 7 }).map((t) => t.key)).toEqual(["music", "articles", "recipes"]);
    expect(byCount(tabs, {}).map((t) => t.key)).toEqual(["articles", "music", "recipes"]);
    expect(byCount(tabs, { articles: 3, music: 3, recipes: null }).map((t) => t.key)).toEqual([
      "articles",
      "music",
      "recipes",
    ]);
  });
});
