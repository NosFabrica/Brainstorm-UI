import { describe, expect, it } from "vitest";
import { readRelease } from "./release";

const DEV = "d".repeat(64);
const STRANGER = "5".repeat(64);
const release = (tags: string[][], pubkey = STRANGER) => ({ pubkey, tags, content: "" });

describe("whose app a release is (NIP-51's `a`)", () => {
  it("is the app's when the app is the release's signer's", () => {
    const r = readRelease(release([["a", `32267:${STRANGER}:org.mine`]]));
    expect(r.app?.address).toBe(`32267:${STRANGER}:org.mine`);
    expect(r.claimedApp).toBeNull();
  });

  it("is only a claim when the app is someone else's: anyone can name any app", () => {
    const r = readRelease(release([["a", `32267:${DEV}:com.popular`, "wss://r.example"]]));
    expect(r.app).toBeNull();
    expect(r.claimedApp).toEqual({ address: `32267:${DEV}:com.popular`, relay: "wss://r.example" });
    // The key in an address is case-blind.
    expect(readRelease(release([["a", `32267:${STRANGER.toUpperCase()}:org.mine`]])).app).not.toBeNull();
  });

  it("NIP-82's `i` is always the publisher's own app", () => {
    const r = readRelease(
      release([
        ["i", "org.mine"],
        ["version", "1.0"],
      ]),
    );
    expect(r.app?.address).toBe(`32267:${STRANGER}:org.mine`);
    expect(r.claimedApp).toBeNull();
  });
});
