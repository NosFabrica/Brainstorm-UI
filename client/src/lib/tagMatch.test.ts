/**
 * When a query names a tag strongly enough for the tag's people to lead the
 * results — as opposed to merely mentioning it, when the tag row is the offer
 * and the list keeps the relay's order.
 */
import { describe, expect, it } from "vitest";
import { leadingTags, tagMatchStrength, withinOneEdit } from "./tagMatch";

describe("tagMatchStrength", () => {
  it("is strong when the words are the tag's name, typo or not, in any case", () => {
    expect(tagMatchStrength("verified human", "Verified Human")).toBe("strong");
    expect(tagMatchStrength("Verfied  Human", "Verified Human")).toBe("strong");
    expect(tagMatchStrength("aos 2026 participant", "AOS 2026 Participant")).toBe("strong");
  });

  it("is weak for a prefix, a part, or a single word of a longer name", () => {
    expect(tagMatchStrength("aos", "AOS 2026 Participant")).toBe("weak");
    expect(tagMatchStrength("verified", "Verified Human")).toBe("weak");
    expect(tagMatchStrength("human", "Verified Human")).toBe("weak");
    expect(tagMatchStrength("verified human being", "Verified Human")).toBe("weak");
  });
});

describe("withinOneEdit", () => {
  it("allows one insertion, deletion, substitution or swap, and nothing more", () => {
    expect(withinOneEdit("verfied", "verified")).toBe(true);
    expect(withinOneEdit("humna", "human")).toBe(true);
    expect(withinOneEdit("hunam", "human")).toBe(false);
  });
});

const tag = (name: string, people: number) => ({
  key: name,
  authorPubkey: "9".repeat(64),
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  people,
  vouches: 1,
  sharesName: 0,
  unverified: false,
});

describe("leadingTags", () => {
  it("keeps the strongly named tags that enough trusted people are on", () => {
    const tags = [tag("Verified Human", 17), tag("AOS 2026 Participant", 99), tag("Human Verifier", 1)];
    expect(leadingTags(tags, "verified human").map((t) => t.name)).toEqual(["Verified Human"]);
    expect(leadingTags(tags, "aos")).toEqual([]);
    expect(leadingTags(tags, "human verifier")).toEqual([]);
    expect(leadingTags([tag("Verified Human", 3)], "verified human")).toHaveLength(1);
  });
});
