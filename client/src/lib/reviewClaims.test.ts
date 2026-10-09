/**
 * A review's two claims read as what the reviewer is saying, and the words
 * follow what is reviewed: a person is "them", a place or software is "it".
 */
import { describe, expect, it } from "vitest";
import { reviewClaims } from "./reviewClaims";

describe("reviewClaims", () => {
  it("for a person: recommend them, or confirm it's really them", () => {
    expect(reviewClaims("person").map((c) => [c.type, c.label])).toEqual([
      ["vouch", "I recommend them"],
      ["identity", "This is really them"],
    ]);
  });

  it("for a place, software or product: recommend it, or confirm it's the real one", () => {
    expect(reviewClaims("thing").map((c) => [c.type, c.label])).toEqual([
      ["vouch", "I recommend it"],
      ["identity", "This is the real one"],
    ]);
  });
});
