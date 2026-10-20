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

// Both sides must agree: what a GitHub profile says, its owner alone wrote — they could name anyone's
// npub or website. It counts only when the person's Nostr profile points back at the account (a
// NIP-39 claim, or the account as their website). A gist proving a claim, or a root handle on the
// domain named for the account, is both sides already.
describe("ownsGitHub", () => {
  const none = { checked: true, named: [], blogHost: null, claimants: [], provenClaimants: [] };

  it("not on the GitHub side alone: its owner could name anyone", () => {
    expect(ownsGitHub({ ...none, named: [OWNER] }, "riverdev", { pubkey: OWNER }, false)).toBe(false);
    const site = { ...none, blogHost: "riverdev-home.com" };
    expect(ownsGitHub(site, "riverdev", { pubkey: OWNER, nip05: "river@riverdev-home.com" }, true)).toBe(false);
  });

  it("when the person points back: their claim, or the account as their website", () => {
    const named = { ...none, named: [OWNER] };
    expect(ownsGitHub({ ...named, claimants: [OWNER] }, "riverdev", { pubkey: OWNER }, false)).toBe(true);
    expect(ownsGitHub(named, "riverdev", { pubkey: OWNER, website: "https://github.com/RiverDev" }, false)).toBe(true);
    expect(ownsGitHub(named, "riverdev", { pubkey: OWNER, website: "github.com/riverdev/" }, false)).toBe(true);
    // Someone else's account as their website points nowhere here.
    expect(ownsGitHub(named, "riverdev", { pubkey: OWNER, website: "https://github.com/riverdev-fan" }, false)).toBe(
      false,
    );
    const site = { ...none, blogHost: "riverdev-home.com", claimants: [OWNER] };
    expect(ownsGitHub(site, "riverdev", { pubkey: OWNER, nip05: "river@riverdev-home.com" }, true)).toBe(true);
  });

  it("on a claim its gist proves, or a verified root handle on the domain named for it", () => {
    expect(ownsGitHub({ ...none, provenClaimants: [OWNER] }, "riverdev", { pubkey: OWNER }, false)).toBe(true);
    expect(ownsGitHub(none, "riverdev", { pubkey: OWNER, nip05: "_@riverdev.com" }, true)).toBe(true);
    expect(ownsGitHub(none, "riverdev", { pubkey: OWNER, nip05: "_@riverdev.com" }, false)).toBe(false);
  });

  it("never on a name alike, nor on a claim alone", () => {
    expect(ownsGitHub(none, "riverdev", { pubkey: OWNER, nip05: "riverdev@nostr.example" }, true)).toBe(false);
    expect(ownsGitHub({ ...none, claimants: [OWNER] }, "riverdev", { pubkey: OWNER }, false)).toBe(false);
  });
});
