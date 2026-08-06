import { describe, it, expect } from "vitest";
import { corroborations, onlySelfDeclared } from "./tagCounts";

/**
 * These pin the split between the number the PROTOCOL wants and the number the
 * COPY wants. `applications` counts distinct asserters including the subject
 * (ACCEPTANCE C1: our net has to match the reference instance's). The UI says
 * how many OTHER people vouched. Confusing the two is what would make a tag
 * somebody gave themselves read as "1 person added this".
 */

describe("onlySelfDeclared", () => {
  it("is true when the subject is the only asserter", () => {
    expect(onlySelfDeclared({ applications: 1, selfDeclared: true })).toBe(true);
  });

  it("is false as soon as anyone else vouches", () => {
    expect(onlySelfDeclared({ applications: 2, selfDeclared: true })).toBe(false);
  });

  it("is false for a tag the subject never claimed", () => {
    expect(onlySelfDeclared({ applications: 1, selfDeclared: false })).toBe(false);
  });

  it("holds at zero — a withdrawn self-declaration is still not corroborated", () => {
    expect(onlySelfDeclared({ applications: 0, selfDeclared: true })).toBe(true);
  });
});

describe("corroborations", () => {
  it("discounts the subject's own assertion", () => {
    expect(corroborations({ applications: 3, selfDeclared: true })).toBe(2);
  });

  it("counts everyone when the subject stayed out of it", () => {
    expect(corroborations({ applications: 3, selfDeclared: false })).toBe(3);
  });

  it("reports nobody for a purely self-declared tag", () => {
    expect(corroborations({ applications: 1, selfDeclared: true })).toBe(0);
  });

  it("never goes negative", () => {
    // Shouldn't arise — selfDeclared implies the subject is counted — but a
    // clamped floor beats rendering "-1 people added this" if it ever does.
    expect(corroborations({ applications: 0, selfDeclared: true })).toBe(0);
  });
});
