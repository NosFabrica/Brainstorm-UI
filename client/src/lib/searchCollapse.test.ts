// @vitest-environment node
/**
 * Near-duplicate collapsing — the "liverpool" cure. Real shapes from the
 * staging relay: one author's EIGHT monthly "Bitcoin Liverpool Meet(up)"
 * kind-31923 entries and another's three identical "Cars and coffee"
 * streams monopolized the page. Google hides similar results; so do we.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { collapseHits } from "./searchCollapse";
import type { SearchHit } from "@/services/search";

const NOW = 1_760_000_000;

function hit(id: string, kind: number, pubkey: string, title: string, created_at: number, extraTags: string[][] = []): SearchHit {
  return {
    event: {
      id,
      kind,
      pubkey,
      tags: [["d", id], ["title", title], ...extraTags],
      content: "",
      created_at,
      sig: "s",
    } as NostrEvent,
    author: null,
    rank: null,
  };
}

const ORANGE = "6".repeat(64);
const CARS = "c".repeat(64);

// The real cluster, faithfully: title wobbles between Meet / Meetup / BTC.
const meetups = [
  hit("m1", 31923, ORANGE, "Bitcoin Liverpool Meet", NOW + 20_000_000),
  hit("m2", 31923, ORANGE, "Bitcoin Liverpool Meetup", NOW + 13_000_000),
  hit("m3", 31923, ORANGE, "Bitcoin Liverpool Meetup", NOW + 10_000_000),
  hit("m4", 31923, ORANGE, "Bitcoin Liverpool Meet", NOW + 7_000_000),
  hit("m5", 31923, ORANGE, "Bitcoin Liverpool Meetup", NOW - 2_000_000),
  hit("m6", 31923, ORANGE, "BTC Liverpool Meet", NOW - 5_000_000),
];

describe("collapseHits", () => {
  it("collapses one author's recurring event into a single cluster", () => {
    const clusters = collapseHits(meetups, NOW);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].others).toHaveLength(5);
  });

  it("picks the NEXT UPCOMING occurrence as primary for calendar/live kinds", () => {
    const clusters = collapseHits(meetups, NOW);
    // m4 is the soonest future occurrence — not the farthest, not a past one.
    expect(clusters[0].primary.event.id).toBe("m4");
  });

  it("picks the newest as primary for non-event kinds", () => {
    const notes = [
      hit("n1", 1, ORANGE, "gm liverpool", NOW - 500),
      hit("n2", 1, ORANGE, "gm liverpool", NOW - 100),
    ];
    expect(collapseHits(notes, NOW)[0].primary.event.id).toBe("n2");
  });

  it("never merges different authors, even with identical titles", () => {
    const clusters = collapseHits(
      [
        hit("a1", 30311, CARS, "Cars and coffee Liverpool", NOW - 100),
        hit("a2", 30311, ORANGE, "Cars and coffee Liverpool", NOW - 200),
      ],
      NOW,
    );
    expect(clusters).toHaveLength(2);
  });

  it("keeps genuinely different content from one author separate", () => {
    const clusters = collapseHits(
      [
        hit("x1", 30311, CARS, "Cars and coffee Liverpool", NOW - 100),
        hit("x2", 30311, CARS, "EPL: Liverpool vs Manchester City", NOW - 200),
      ],
      NOW,
    );
    expect(clusters).toHaveLength(2);
  });

  // Google's host-diversity move: even DIFFERENT posts from one author can't
  // monopolize a section (live catch: three hashtag-spam notes, one author,
  // three different bodies — title clustering alone let them all through).
  it("caps clusters per author when asked, folding the overflow into the chip", () => {
    const spammer = "5".repeat(64);
    const clusters = collapseHits(
      [
        hit("s1", 1, spammer, "#LIST OF #RUSSIAN #FOOTBALL", NOW - 100),
        hit("s2", 1, spammer, "#LAUREL L #WILKENING totally different", NOW - 200),
        hit("s3", 1, spammer, "#PETER #NORBECK yet another", NOW - 300),
        hit("ok", 1, CARS, "genuine liverpool take", NOW - 400),
      ],
      NOW,
      { maxPerAuthor: 2 },
    );
    const bySpammer = clusters.filter((c) => c.primary.event.pubkey === spammer);
    expect(bySpammer).toHaveLength(2);
    // Nothing vanishes — the third post rides the second cluster's chip.
    expect(bySpammer.flatMap((c) => [c.primary, ...c.others])).toHaveLength(3);
    expect(clusters.some((c) => c.primary.event.id === "ok")).toBe(true);
  });

  it("preserves overall relay order by each cluster's first appearance", () => {
    const clusters = collapseHits(
      [
        hit("m1", 31923, ORANGE, "Bitcoin Liverpool Meet", NOW + 100),
        hit("c1", 30311, CARS, "Cars and coffee Liverpool", NOW - 100),
        hit("m2", 31923, ORANGE, "Bitcoin Liverpool Meetup", NOW + 200),
      ],
      NOW,
    );
    expect(clusters.map((c) => c.primary.event.pubkey[0])).toEqual(["6", "c"]);
  });
});
