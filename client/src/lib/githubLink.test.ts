/**
 * When a GitHub account and a Nostr profile are one person — only on proof,
 * never on a name alike: the GitHub profile names the npub (only its owner
 * can edit it), its website is the domain the profile's verified handle
 * stands on, the profile claims the account (NIP-39) with a gist on it that
 * carries the npub, or the verified handle is the root of the domain named
 * for the account (lib/ownedAccount).
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { gistProves, ownsGitHub, pubkeysNamedIn } from "./githubLink";

const OWNER = "a1".repeat(32);
const OTHER = "b2".repeat(32);
const npub = (hex: string) => nip19.npubEncode(hex);

describe("pubkeysNamedIn", () => {
  it("finds the npubs a GitHub profile's links and words carry, once each", () => {
    expect(
      pubkeysNamedIn([
        `https://njump.me/${npub(OWNER)}`,
        `nostr: ${npub(OTHER)} and again https://nosta.me/${npub(OWNER)}`,
        null,
        "npub1notarealkey",
      ]),
    ).toEqual([OWNER, OTHER]);
  });
});

describe("gistProves", () => {
  it("proves a claim when the gist is the account's own and carries the claimer's npub", () => {
    expect(gistProves({ owner: "RiverDev", text: `Verifying my Nostr key: ${npub(OWNER)}` }, "riverdev", OWNER)).toBe(
      true,
    );
    expect(gistProves({ owner: "someoneelse", text: npub(OWNER) }, "riverdev", OWNER)).toBe(false);
    expect(gistProves({ owner: "riverdev", text: npub(OTHER) }, "riverdev", OWNER)).toBe(false);
  });
});

describe("ownsGitHub", () => {
  const none = { checked: true, named: [], blogHost: null, provenClaimants: [] };

  it("on the GitHub profile naming their npub, no handle needed", () => {
    expect(ownsGitHub({ ...none, named: [OWNER] }, "riverdev", { pubkey: OWNER }, false)).toBe(true);
    expect(ownsGitHub({ ...none, named: [OTHER] }, "riverdev", { pubkey: OWNER }, false)).toBe(false);
  });

  it("on the GitHub website being their verified handle's domain", () => {
    const site = { ...none, blogHost: "riverdev-home.com" };
    expect(ownsGitHub(site, "riverdev", { pubkey: OWNER, nip05: "river@riverdev-home.com" }, true)).toBe(true);
    // Unverified, the handle is only a claim anyone could make.
    expect(ownsGitHub(site, "riverdev", { pubkey: OWNER, nip05: "river@riverdev-home.com" }, false)).toBe(false);
  });

  it("on a claim its gist proves", () => {
    expect(ownsGitHub({ ...none, provenClaimants: [OWNER] }, "riverdev", { pubkey: OWNER }, false)).toBe(true);
  });

  it("on a verified root handle on the domain named for the account", () => {
    expect(ownsGitHub(none, "riverdev", { pubkey: OWNER, nip05: "_@riverdev.com" }, true)).toBe(true);
    expect(ownsGitHub(none, "riverdev", { pubkey: OWNER, nip05: "_@riverdev.com" }, false)).toBe(false);
  });

  it("never on a name alike", () => {
    expect(ownsGitHub(none, "riverdev", { pubkey: OWNER, nip05: "riverdev@nostr.example" }, true)).toBe(false);
  });
});
