import { describe, it, expect } from "vitest";
import {
  countNameCollisions,
  mergeSameNamedTags,
  stanceForVariants,
  type CountedTag,
} from "./tagMerge";

/**
 * These cover the one property that can't be checked against the live hub: as of
 * 2026-08-05 the only duplicated tag name there is "bitcoin", and nobody carries
 * either variant, so the duplicate path never executes in production data yet.
 * It will the moment two people tag the same person with same-named tags.
 *
 * `mergeSameNamedTags` / `stanceForVariants` are unwired (see the module note);
 * their tests stay so the behaviour is still specified if KIT-FEEDBACK.md §3 is
 * answered in favour of converging duplicates. `countNameCollisions` is what
 * actually ships.
 */

const AUTHOR_A = "a".repeat(64);
const AUTHOR_B = "b".repeat(64);

function tag(authorPubkey: string, slug: string, applications: string[], disputes: string[] = []): CountedTag {
  return {
    authorPubkey,
    slug,
    applications: new Set(applications),
    disputes: new Set(disputes),
  };
}

describe("countNameCollisions", () => {
  it("reports 1 for a name only one author minted", () => {
    const counted = new Map([[`${AUTHOR_A}|author`, tag(AUTHOR_A, "author", ["v1"])]]);
    const names = new Map([[`${AUTHOR_A}|author`, { name: "Author" }]]);

    expect(countNameCollisions(counted, names).get(`${AUTHOR_A}|author`)).toBe(1);
  });

  it("tells BOTH identities that the name is shared", () => {
    // The label has to appear on every colliding entry, not just the second —
    // a reader looking at either one needs to know the other exists.
    const counted = new Map([
      [`${AUTHOR_A}|bitcoin`, tag(AUTHOR_A, "bitcoin", ["v1"])],
      [`${AUTHOR_B}|btc`, tag(AUTHOR_B, "btc", ["v2"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|bitcoin`, { name: "Bitcoin" }],
      [`${AUTHOR_B}|btc`, { name: "bitcoin " }],
    ]);

    const collisions = countNameCollisions(counted, names);
    expect(collisions.get(`${AUTHOR_A}|bitcoin`)).toBe(2);
    expect(collisions.get(`${AUTHOR_B}|btc`)).toBe(2);
  });

  it("falls back to the slug when a name never resolved", () => {
    // Unresolvable elements still render under their slug, so two of them with
    // the same slug are a visible collision even with no names in hand.
    const counted = new Map([
      [`${AUTHOR_A}|author`, tag(AUTHOR_A, "author", ["v1"])],
      [`${AUTHOR_B}|author`, tag(AUTHOR_B, "author", ["v2"])],
    ]);

    const collisions = countNameCollisions(counted, new Map());
    expect(collisions.get(`${AUTHOR_A}|author`)).toBe(2);
  });

  it("keeps unrelated names apart", () => {
    const counted = new Map([
      [`${AUTHOR_A}|author`, tag(AUTHOR_A, "author", ["v1"])],
      [`${AUTHOR_B}|chef`, tag(AUTHOR_B, "chef", ["v2"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|author`, { name: "Author" }],
      [`${AUTHOR_B}|chef`, { name: "Chef" }],
    ]);

    const collisions = countNameCollisions(counted, names);
    expect(collisions.get(`${AUTHOR_A}|author`)).toBe(1);
    expect(collisions.get(`${AUTHOR_B}|chef`)).toBe(1);
  });
});

describe("mergeSameNamedTags", () => {
  it("passes a lone tag through untouched, with one variant", () => {
    const counted = new Map([[`${AUTHOR_A}|author`, tag(AUTHOR_A, "author", ["v1", "v2"])]]);
    const names = new Map([[`${AUTHOR_A}|author`, { name: "Author" }]]);

    const [merged] = mergeSameNamedTags(counted, names);

    expect(merged.name).toBe("Author");
    expect(merged.group.applications.size).toBe(2);
    expect(merged.variantKeys).toEqual([`${AUTHOR_A}|author`]);
  });

  it("counts someone who vouched BOTH variants only once", () => {
    // The whole reason the merge unions sets instead of adding sizes. "shared"
    // backed both; naive addition would report 3 supporters where there are 2.
    const counted = new Map([
      [`${AUTHOR_A}|bitcoin`, tag(AUTHOR_A, "bitcoin", ["shared", "onlyA"])],
      [`${AUTHOR_B}|bitcoin`, tag(AUTHOR_B, "bitcoin", ["shared"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|bitcoin`, { name: "Bitcoin" }],
      [`${AUTHOR_B}|bitcoin`, { name: "Bitcoin" }],
    ]);

    const merged = mergeSameNamedTags(counted, names);

    expect(merged).toHaveLength(1);
    expect(merged[0].group.applications.size).toBe(2);
    expect([...merged[0].group.applications].sort()).toEqual(["onlyA", "shared"]);
  });

  it("keeps the best-supported variant as the one the chip links to", () => {
    const counted = new Map([
      [`${AUTHOR_A}|bitcoin`, tag(AUTHOR_A, "bitcoin", ["v1"])],
      [`${AUTHOR_B}|bitcoin`, tag(AUTHOR_B, "bitcoin", ["v1", "v2", "v3"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|bitcoin`, { name: "Bitcoin" }],
      [`${AUTHOR_B}|bitcoin`, { name: "Bitcoin" }],
    ]);

    const [merged] = mergeSameNamedTags(counted, names);

    expect(merged.group.authorPubkey).toBe(AUTHOR_B);
    expect(merged.key).toBe(`${AUTHOR_B}|bitcoin`);
    expect(merged.variantKeys).toHaveLength(2);
  });

  it("breaks ties on pubkey so every client picks the same survivor", () => {
    const counted = new Map([
      [`${AUTHOR_B}|bitcoin`, tag(AUTHOR_B, "bitcoin", ["v1"])],
      [`${AUTHOR_A}|bitcoin`, tag(AUTHOR_A, "bitcoin", ["v2"])],
    ]);
    const names = new Map([
      [`${AUTHOR_B}|bitcoin`, { name: "Bitcoin" }],
      [`${AUTHOR_A}|bitcoin`, { name: "Bitcoin" }],
    ]);

    const [merged] = mergeSameNamedTags(counted, names);

    expect(merged.group.authorPubkey).toBe(AUTHOR_A);
  });

  it("matches on the display name regardless of case, spacing or slug", () => {
    const counted = new Map([
      [`${AUTHOR_A}|live-music`, tag(AUTHOR_A, "live-music", ["v1"])],
      [`${AUTHOR_B}|livemusic`, tag(AUTHOR_B, "livemusic", ["v2"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|live-music`, { name: "Live Music" }],
      [`${AUTHOR_B}|livemusic`, { name: " live music " }],
    ]);

    expect(mergeSameNamedTags(counted, names)).toHaveLength(1);
  });

  it("keeps differently-named tags apart", () => {
    const counted = new Map([
      [`${AUTHOR_A}|author`, tag(AUTHOR_A, "author", ["v1"])],
      [`${AUTHOR_A}|artist`, tag(AUTHOR_A, "artist", ["v1"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|author`, { name: "Author" }],
      [`${AUTHOR_A}|artist`, { name: "Artist" }],
    ]);

    expect(mergeSameNamedTags(counted, names)).toHaveLength(2);
  });

  it("falls back to the slug when a tag-element's name never resolved", () => {
    const counted = new Map([[`${AUTHOR_A}|obscure`, tag(AUTHOR_A, "obscure", ["v1"])]]);

    const [merged] = mergeSameNamedTags(counted, new Map());

    expect(merged.name).toBe("obscure");
  });

  it("unions disputes too", () => {
    const counted = new Map([
      [`${AUTHOR_A}|bitcoin`, tag(AUTHOR_A, "bitcoin", ["v1"], ["d1"])],
      [`${AUTHOR_B}|bitcoin`, tag(AUTHOR_B, "bitcoin", ["v2"], ["d1", "d2"])],
    ]);
    const names = new Map([
      [`${AUTHOR_A}|bitcoin`, { name: "Bitcoin" }],
      [`${AUTHOR_B}|bitcoin`, { name: "Bitcoin" }],
    ]);

    const [merged] = mergeSameNamedTags(counted, names);

    expect(merged.group.disputes.size).toBe(2);
  });
});

describe("stanceForVariants", () => {
  const keys = ["k1", "k2"];

  it("reports no stance when the viewer touched neither variant", () => {
    expect(stanceForVariants(keys, new Map())).toBeUndefined();
  });

  it("carries a stance across from whichever variant it was on", () => {
    expect(stanceForVariants(keys, new Map([["k2", "apply"]]))).toBe("apply");
  });

  it("lets an apply on one variant outweigh a dispute on another", () => {
    // Agreeing with the tag under one identity shouldn't stay hidden because of
    // an older disagreement with a different identity of the same tag.
    const mine = new Map<string, "apply" | "dispute">([
      ["k1", "dispute"],
      ["k2", "apply"],
    ]);
    expect(stanceForVariants(keys, mine)).toBe("apply");
  });

  it("reports a dispute when that's all there is", () => {
    expect(stanceForVariants(keys, new Map([["k1", "dispute"]]))).toBe("dispute");
  });
});
