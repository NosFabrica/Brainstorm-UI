import { describe, expect, it } from "vitest";

import { personMatches } from "./personMatch";

/**
 * Keyword search through a follow or follower list (issue #310): find one
 * person among hundreds by whatever you remember of them — their name, their
 * handle, the start of their npub — however it is capitalised or accented.
 */
const PUBKEY = "d57e38191258b7cc6613ed3a9b81f5f1ec4d1b0e9e9b8b4f7a2d6c3e1f0a9b8c";
// The npub of PUBKEY, from nostr-tools' nip19 — a fixed fact, not derived here.
const NPUB = "npub164lrsxgjtzmucesna5afhq0478ky6xcwn6dcknm694kru8c2nwxqgyxg6q";

const lira = { pubkey: PUBKEY, name: "lira_dev", display_name: "Lira Ødegaard", nip05: "lira@nostr.example" };

describe("personMatches", () => {
  it("finds a person by part of their display name, whatever the case", () => {
    expect(personMatches("lira", lira)).toBe(true);
    expect(personMatches("ØDEG", lira)).toBe(true);
  });

  it("ignores accents, so 'odegaard' finds Ødegaard", () => {
    expect(personMatches("odegaard", lira)).toBe(true);
  });

  it("finds a person by their handle or their NIP-05", () => {
    expect(personMatches("lira_dev", lira)).toBe(true);
    expect(personMatches("nostr.example", lira)).toBe(true);
  });

  it("finds a person by the start of their npub or hex key", () => {
    expect(personMatches(NPUB.slice(0, 12), lira)).toBe(true);
    expect(personMatches(NPUB, lira)).toBe(true);
    expect(personMatches("d57e3819", lira)).toBe(true);
  });

  it("needs every word of the query to match somewhere", () => {
    expect(personMatches("lira nostr", lira)).toBe(true);
    expect(personMatches("lira zebra", lira)).toBe(false);
  });

  it("matches nobody on nothing but their key when they have no profile yet", () => {
    const bare = { pubkey: PUBKEY };
    expect(personMatches("lira", bare)).toBe(false);
    expect(personMatches("d57e", bare)).toBe(true);
  });

  it("an empty or blank query matches everyone", () => {
    expect(personMatches("", lira)).toBe(true);
    expect(personMatches("   ", { pubkey: PUBKEY })).toBe(true);
  });
});
