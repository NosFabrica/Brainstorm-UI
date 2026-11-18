// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { inviteThrough, retiredBy, retiredStatus } from "./retired";

/**
 * A Retired account: one its owner no longer uses, and says so (CONTEXT.md).
 * The record names the owner's Current account, so every surface that shows
 * the retired one can point a reader to where the person is now.
 */
const hex = (npub: string) => nip19.decode(npub).data as string;
// The first record, as the team gave it: the retired account, and its owner's current one.
const RETIRED = hex("npub18nw7u79dx7gnrnmr8h557m9ryhv36ulqmrmelwgd0py5slf7ttzssyxtdv");
const CURRENT = hex("npub1gcxzte5zlkncx26j68ez60fzkvtkm9e0vrwdcvsjakxf9mu9qewqlfnj5z");

describe("retiredStatus — is this account Retired, and where is its owner now", () => {
  it("knows the first retired account and its owner's current one", () => {
    expect(retiredStatus(RETIRED)).toEqual({ pubkey: RETIRED, currentPubkey: CURRENT });
  });

  it("reads a key whatever its case", () => {
    expect(retiredStatus(RETIRED.toUpperCase())?.currentPubkey).toBe(CURRENT);
  });

  it("answers null for the current account, anyone else, and no key at all", () => {
    expect(retiredStatus(CURRENT)).toBeNull();
    expect(retiredStatus("a".repeat(64))).toBeNull();
    expect(retiredStatus("")).toBeNull();
  });
});

describe("retiredBy — the same record from the Current account's side", () => {
  it("names the account its owner retired", () => {
    expect(retiredBy(CURRENT)).toEqual({ pubkey: RETIRED, currentPubkey: CURRENT });
    expect(retiredBy(CURRENT.toUpperCase())?.pubkey).toBe(RETIRED);
  });

  it("answers null for an account that retired nothing", () => {
    expect(retiredBy(RETIRED)).toBeNull();
    expect(retiredBy("a".repeat(64))).toBeNull();
  });
});

// A signed-out visitor is invited to join "connected to" the profile they are on. On a Retired
// account that would connect them to an account nobody uses.
describe("inviteThrough — whose invitation a profile's Join offers", () => {
  it("offers the owner's current account on a retired profile", () => {
    expect(inviteThrough(RETIRED)).toBe(CURRENT);
  });

  it("offers the profile's own account everywhere else", () => {
    expect(inviteThrough(CURRENT)).toBe(CURRENT);
    expect(inviteThrough("a".repeat(64))).toBe("a".repeat(64));
  });
});
