/**
 * Building short share links.
 *
 * Degrading to the long URL is the query's job in SharePage — see
 * ShareUrl.test.tsx — so that a failure isn't cached as if it were an answer.
 *
 * Issue: .scratch/shorturl/issues/04-share-short-link.md
 */
import { describe, expect, it } from "vitest";

import { MAX_SHARE_RELAYS, shortLinkPath, shortLinkUrl } from "./shortLink";

const ORIGIN = "https://brainstorm.world";
const LONG = `${ORIGIN}/p/npub1abc`;
const CODE = "AB3XK9QZ";

describe("building the link", () => {
  it("puts the code on its own path", () => {
    expect(shortLinkPath(CODE)).toBe("/s/AB3XK9QZ");
  });

  it("builds an absolute url from an origin", () => {
    expect(shortLinkUrl(ORIGIN, CODE)).toBe("https://brainstorm.world/s/AB3XK9QZ");
  });

  it("does not care how long the code is", () => {
    // The server may lengthen codes later; already-shared links must keep working.
    expect(shortLinkPath("AB3X")).toBe("/s/AB3X");
    expect(shortLinkPath("AB3XK9QZWXYZ")).toBe("/s/AB3XK9QZWXYZ");
  });

  it("trims a trailing slash on the origin so the url has no double slash", () => {
    expect(shortLinkUrl(`${ORIGIN}/`, CODE)).toBe(`${ORIGIN}/s/${CODE}`);
  });
});

describe("the relay cap", () => {
  it("matches what the server will store", () => {
    // Sending more is a 422, and the sheet would silently fall back forever.
    expect(MAX_SHARE_RELAYS).toBe(7);
  });
});
