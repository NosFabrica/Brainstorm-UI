// @vitest-environment node
/**
 * The facts a public profile states about itself — where its website is,
 * how to pay it — read from kind-0 fields that relays serve as-is: a
 * `website` may hold several URLs or none, a scheme or not; a lightning
 * target is a LUD-16 address or an old LNURL. Team feedback (2026-09-05):
 * "I want to read any of their website links … copy the lightning address."
 */
import { describe, expect, it } from "vitest";
import { lightningTarget, websiteLinks } from "./profileFacts";

describe("websiteLinks — every link a profile lists, readable and openable", () => {
  it("one URL: the label drops the scheme and trailing slash, the href keeps it", () => {
    expect(websiteLinks("https://megistus.xyz/")).toEqual([{ href: "https://megistus.xyz/", label: "megistus.xyz", full: "https://megistus.xyz/" }]);
  });
  it("a schemeless site gets https so it opens", () => {
    expect(websiteLinks("megistus.xyz")).toEqual([{ href: "https://megistus.xyz", label: "megistus.xyz", full: "https://megistus.xyz" }]);
  });
  it("several links split on commas and spaces, de-duplicated, at most three", () => {
    const links = websiteLinks("https://a.com, b.org  https://c.net/x https://a.com d.io");
    expect(links.map((l) => l.label)).toEqual(["a.com", "b.org", "c.net/x"]);
  });
  it("junk — the wrong type, or nothing — is no link at all", () => {
    expect(websiteLinks(123)).toEqual([]);
    expect(websiteLinks("")).toEqual([]);
    expect(websiteLinks("   ")).toEqual([]);
    expect(websiteLinks(undefined)).toEqual([]);
  });
});

describe("lightningTarget — the address to copy, and whether the zap flow can pay it", () => {
  it("a LUD-16 address shows whole and can be zapped", () => {
    expect(lightningTarget("me@wallet.com", undefined)).toEqual({ address: "me@wallet.com", display: "me@wallet.com", zappable: true });
  });
  it("an LNURL alone shows shortened, copies whole, and the zap flow cannot resolve it", () => {
    const lnurl = "lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns";
    expect(lightningTarget(undefined, lnurl)).toEqual({ address: lnurl, display: `${lnurl.slice(0, 12)}…${lnurl.slice(-6)}`, zappable: false });
  });
  it("when both are set, the address wins", () => {
    expect(lightningTarget("me@wallet.com", "lnurl1abcdefghijklmnop")?.address).toBe("me@wallet.com");
  });
  it("nothing usable is null", () => {
    expect(lightningTarget(undefined, undefined)).toBeNull();
    expect(lightningTarget("not an address", "not an lnurl")).toBeNull();
    expect(lightningTarget(42, null)).toBeNull();
    expect(lightningTarget("  ", "")).toBeNull();
  });
});
