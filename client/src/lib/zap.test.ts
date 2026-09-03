/**
 * Who a zap is published as. The failure this guards is silent: gate attribution
 * on anything but "an Account can sign this" and zaps go out anonymously with no
 * error and nothing on screen to say the name is missing.
 */
import { describe, expect, it } from "vitest";

import { acceptsZaps, canAttributeZap, type LnurlPayParams } from "./zap";

const params = (over: Partial<LnurlPayParams> = {}): LnurlPayParams => ({
  callback: "https://example.test/lnurlp/callback",
  minSendable: 1000,
  maxSendable: 100_000_000,
  metadata: "[]",
  commentAllowed: 0,
  allowsNostr: true,
  nostrPubkey: "c".repeat(64),
  domain: "example.test",
  lnurlUrl: "https://example.test/.well-known/lnurlp/alice",
  ...over,
});

const account = { id: "acc-1", pubkey: "a".repeat(64) };

describe("whether the provider takes a zap at all", () => {
  it("needs both the flag and the key it signs receipts with", () => {
    expect(acceptsZaps(params())).toBe(true);
    expect(acceptsZaps(params({ allowsNostr: false }))).toBe(false);
    expect(acceptsZaps(params({ nostrPubkey: undefined }))).toBe(false);
    expect(acceptsZaps(null)).toBe(false);
  });
});

describe("whether the zap carries the zapper's name", () => {
  it("is yes as soon as an Account is there to sign it", () => {
    expect(canAttributeZap(params(), account)).toBe(true);
  });

  it("is no when nobody is signed in — that is the anonymous zap", () => {
    expect(canAttributeZap(params(), undefined)).toBe(false);
  });

  it("is no when the provider wouldn't publish the zap anyway", () => {
    expect(canAttributeZap(params({ allowsNostr: false }), account)).toBe(false);
  });

  it("survives a lapsed Session — signing is not the backend's business", () => {
    // an Account whose Session has been cleared can still sign a kind-9734
    expect(canAttributeZap(params(), { ...account, metadata: { session: undefined } })).toBe(true);
  });
});
