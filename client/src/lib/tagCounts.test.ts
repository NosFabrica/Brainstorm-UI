import { describe, it, expect } from "vitest";
import { corroborations, onlySelfDeclared, stanceOnlyRefs } from "./tagCounts";

const A = "a".repeat(64);
const B = "b".repeat(64);
const ref = (authorPubkey: string, slug: string) => ({ tag: { authorPubkey, slug } });

describe("onlySelfDeclared", () => {
  it("is true when the subject is the only asserter", () => {
    expect(onlySelfDeclared({ applications: 1, selfDeclared: true })).toBe(true);
  });

  it("is false once anyone else has vouched", () => {
    expect(onlySelfDeclared({ applications: 2, selfDeclared: true })).toBe(false);
  });

  it("is false when the subject never claimed it", () => {
    expect(onlySelfDeclared({ applications: 1, selfDeclared: false })).toBe(false);
  });

  it("survives a withdrawn self-claim (zero applications)", () => {
    // The subject disputed their own tag: selfDeclared stays false, count is 0.
    expect(onlySelfDeclared({ applications: 0, selfDeclared: false })).toBe(false);
  });
});

describe("corroborations", () => {
  it("discounts the subject's own assertion", () => {
    // 3 asserters, one of them the subject → 2 other people said it.
    expect(corroborations({ applications: 3, selfDeclared: true })).toBe(2);
  });

  it("counts every asserter when none is the subject", () => {
    expect(corroborations({ applications: 3, selfDeclared: false })).toBe(3);
  });

  it("never goes negative", () => {
    expect(corroborations({ applications: 0, selfDeclared: true })).toBe(0);
  });
});

describe("stanceOnlyRefs", () => {
  /**
   * The regression this exists for: a note tagged ONLY by the viewer vanished
   * from its own page the moment the POV stopped counting them, because every
   * read path mapped over the trust-filtered list alone. Floor B requires the
   * viewer's own action to stay visible — dimmed, not gone.
   */
  it("surfaces a stance the trust filter dropped entirely", () => {
    const trusted: Array<{ tag: { authorPubkey: string; slug: string } }> = [];
    const mine = [ref(A, "acceptance-check")];

    expect(stanceOnlyRefs(trusted, mine)).toEqual(mine);
  });

  it("does not duplicate a stance that already counts", () => {
    const trusted = [ref(A, "author")];
    const mine = [ref(A, "author")];

    expect(stanceOnlyRefs(trusted, mine)).toEqual([]);
  });

  it("matches on the full coordinate, not the slug alone", () => {
    // Two authors can mint the same slug; they are different tags, so the
    // viewer's stance on B's copy must survive A's copy being counted.
    const trusted = [ref(A, "bitcoin")];
    const mine = [ref(B, "bitcoin")];

    expect(stanceOnlyRefs(trusted, mine)).toEqual(mine);
  });

  it("returns only the uncounted subset when a viewer has several stances", () => {
    const trusted = [ref(A, "author"), ref(A, "chef")];
    const mine = [ref(A, "chef"), ref(B, "sailor")];

    expect(stanceOnlyRefs(trusted, mine)).toEqual([ref(B, "sailor")]);
  });

  it("is a no-op when the viewer has no stances at all", () => {
    expect(stanceOnlyRefs([ref(A, "author")], [])).toEqual([]);
  });
});
