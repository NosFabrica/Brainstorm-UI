// @vitest-environment node
/**
 * Show and Tell for an event's guests: everyone who said yes is counted ("N going"), those the
 * reader trusts are counted apart ("K you trust") and shown first, and the reader's own yes is
 * always shown to them, first.
 */
import { describe, expect, it } from "vitest";
import { goingThroughLens } from "./eventGoing";

const [A, B, C, D, ME] = ["a", "b", "c", "d", "e"].map((c) => c.repeat(64));
const trusts =
  (...pks: string[]) =>
  (pk: string) =>
    pks.includes(pk);

describe("goingThroughLens", () => {
  it("counts everyone, and those the reader trusts apart, trusted faces first", () => {
    // Newest answer first: A, B, C, D. The reader trusts C and D.
    const got = goingThroughLens([A, B, C, D], trusts(C, D), null, 5);
    expect(got).toEqual({ going: 4, trusted: 2, faces: [C, D, A, B], mine: false });
  });

  it("shows the reader's own yes first, and never counts them as someone they trust", () => {
    const got = goingThroughLens([A, ME, B], trusts(ME, B), ME, 5);
    expect(got).toEqual({ going: 3, trusted: 1, faces: [ME, B, A], mine: true });
  });

  it("stops the faces at the limit, and trusts nobody while the lens is unknown", () => {
    const got = goingThroughLens([A, B, C, D], () => false, ME, 3);
    expect(got).toEqual({ going: 4, trusted: 0, faces: [A, B, C], mine: false });
  });
});
