/**
 * Building short share links.
 *
 * Degrading to the long URL is the query's job in SharePage — see
 * ShareUrl.test.tsx — so that a failure isn't cached as if it were an answer.
 *
 * Issue: .scratch/shorturl/issues/04-share-short-link.md
 */
import { describe, expect, it } from "vitest";

import { MAX_SHARE_RELAYS, hashtagKey, isReadableHashtag, qrPayload, shortLinkPath, shortLinkUrl } from "./shortLink";

const ORIGIN = "https://brainstorm.world";
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

describe("the QR payload", () => {
  it("uppercases a short link so the QR reaches alphanumeric mode", () => {
    // QR's alphanumeric mode costs 5.5 bits/char instead of 8, but the library
    // picks ONE mode for the whole string — a single lowercase character
    // anywhere drops the entire payload to byte mode.
    expect(qrPayload("https://brainstorm.world/s/ab3xk9qz")).toBe("HTTPS://BRAINSTORM.WORLD/S/AB3XK9QZ");
  });

  it("leaves a canonical profile link alone", () => {
    // npub is bech32; uppercasing it is not ours to risk, and the win only
    // applies to short links anyway.
    const canonical = "https://brainstorm.world/p/npub17ngcvm59n9trc5kwam03rs5ts4n7gewxax53m7f2m4f464ls92cqr5qjta";
    expect(qrPayload(canonical)).toBe(canonical);
  });

  it("survives an empty url", () => {
    expect(qrPayload("")).toBe("");
  });

  it("leaves someone else's /s/ path alone", () => {
    // A URL merely ending in an /s/<segment> is not one of ours; uppercasing
    // another site's path could well break it.
    const foreign = "https://docs.example.com/guide/s/intro";
    expect(qrPayload(foreign)).toBe(foreign);
  });

  it("leaves a link carrying a query or fragment alone", () => {
    // Query values and fragments are case-sensitive. Our links never carry
    // one, so bail rather than risk corrupting it for a few modules.
    const q = "https://brainstorm.world/s/ab3xk9qz?ref=x";
    const h = "https://brainstorm.world/s/ab3xk9qz#top";
    expect(qrPayload(q)).toBe(q);
    expect(qrPayload(h)).toBe(h);
  });

  it("survives a value that isn't a url at all", () => {
    expect(qrPayload("not a url")).toBe("not a url");
  });

  it("is idempotent", () => {
    const once = qrPayload("https://brainstorm.world/s/ab3xk9qz");
    expect(qrPayload(once)).toBe(once);
  });
});

describe("a hashtag's key, normalised as the server stores it", () => {
  it("trims, lowercases and drops one leading #", () => {
    expect(hashtagKey("  #Bitcoin ")).toBe("bitcoin");
  });

  it("drops only one #", () => {
    expect(hashtagKey("##nostr")).toBe("#nostr");
  });

  it("leaves an inner # alone", () => {
    expect(hashtagKey("c#")).toBe("c#");
  });

  it("is empty for a word longer than the server takes", () => {
    expect(hashtagKey("x".repeat(64))).toBe("x".repeat(64));
    expect(hashtagKey("x".repeat(65))).toBe("");
  });

  it("is empty for a word the server refuses (inner whitespace or a slash)", () => {
    expect(hashtagKey("foo bar")).toBe("");
    expect(hashtagKey("foo\tbar")).toBe("");
    expect(hashtagKey("a/b")).toBe("");
  });
});

describe("isReadableHashtag", () => {
  it("is a plain word of up to 12 characters", () => {
    expect(isReadableHashtag("nostr")).toBe(true);
    expect(isReadableHashtag("x".repeat(12))).toBe(true);
    expect(isReadableHashtag("x".repeat(13))).toBe(false);
    expect(isReadableHashtag("bitcoin_dev-1")).toBe(false);
    expect(isReadableHashtag("btc-dev_2")).toBe(true);
  });

  it("is never a word its link would percent-encode", () => {
    expect(isReadableHashtag("c++")).toBe(false);
    expect(isReadableHashtag("日本")).toBe(false);
    expect(isReadableHashtag("")).toBe(false);
  });
});
