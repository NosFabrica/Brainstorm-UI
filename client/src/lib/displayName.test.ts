import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { displayNameOf, nameIn, nameOf, profileName, shortKey, shortNpub } from "./displayName";
import { getDisplayLabel } from "./profileSearch";

const PK = "a".repeat(64);
const NPUB = nip19.npubEncode(PK);

describe("naming a person", () => {
  it("takes the display name, then the name, then a short npub", () => {
    expect(profileName({ display_name: "Ana", name: "ana" }, PK)).toBe("Ana");
    expect(profileName({ display_name: "  ", name: "ana" }, PK)).toBe("ana");
    expect(profileName(undefined, PK)).toBe(`${NPUB.slice(0, 10)}…${NPUB.slice(-4)}`);
    expect(nameOf(PK, new Map([[PK, { name: "ana" }]]))).toBe("ana");
  });

  it("never encodes something that isn't a key", () => {
    expect(shortNpub("not-a-key-at-all")).toBe("not-a-ke…");
  });
});

describe("nameIn", () => {
  it("reads display_name, then name, trimmed (NIP-01, NIP-24)", () => {
    expect(nameIn({ display_name: " Ana Ribeiro ", name: "ana" })).toBe("Ana Ribeiro");
    expect(nameIn({ name: " ana " })).toBe("ana");
  });

  it("skips a blank or non-string field rather than showing it", () => {
    expect(nameIn({ display_name: "", name: "ana" })).toBe("ana");
    expect(nameIn({ display_name: "   ", name: "ana" })).toBe("ana");
    expect(nameIn({ display_name: 42, name: "ana" })).toBe("ana");
    expect(nameIn({ display_name: " ", name: "\n" })).toBeUndefined();
  });

  it("gives undefined when there is no profile or no name in it", () => {
    expect(nameIn(undefined)).toBeUndefined();
    expect(nameIn(null)).toBeUndefined();
    expect(nameIn({})).toBeUndefined();
  });

  it("reads the deprecated displayName and username only when asked (NIP-24)", () => {
    expect(nameIn({ displayName: "Ana", username: "ana" })).toBeUndefined();
    expect(nameIn({ displayName: "Ana", name: "ana" }, { legacy: true })).toBe("Ana");
    expect(nameIn({ username: "ana" }, { legacy: true })).toBe("ana");
    // The current fields still come first.
    expect(nameIn({ display_name: "Ana", displayName: "Old" }, { legacy: true })).toBe("Ana");
    expect(nameIn({ name: "ana", username: "old" }, { legacy: true })).toBe("ana");
  });
});

describe("displayNameOf", () => {
  it("falls back to the form of key the caller shows", () => {
    expect(displayNameOf(undefined, PK)).toBe(shortNpub(PK));
    expect(displayNameOf(undefined, PK, "npub12")).toBe(`${NPUB.slice(0, 12)}…`);
    expect(displayNameOf(undefined, PK, "hex8")).toBe(`${PK.slice(0, 8)}…`);
    expect(displayNameOf({ name: " " }, PK, "hex8")).toBe(`${PK.slice(0, 8)}…`);
    expect(displayNameOf({ name: "ana" }, PK, "hex8")).toBe("ana");
  });

  it("passes the legacy option through", () => {
    expect(displayNameOf({ displayName: "Ana" }, PK, "hex8", { legacy: true })).toBe("Ana");
  });

  it("never encodes something that isn't a key", () => {
    expect(shortKey("not-a-key-at-all", "npub12")).toBe("not-a-ke…");
  });
});

describe("getDisplayLabel", () => {
  it("names a search result the same way, falling back to its npub", () => {
    expect(getDisplayLabel({ pubkey: PK, npub: NPUB, displayName: " ", name: "ana" })).toBe("ana");
    expect(getDisplayLabel({ pubkey: PK, npub: NPUB, displayName: "Ana", name: "ana" })).toBe("Ana");
    expect(getDisplayLabel({ pubkey: PK, npub: NPUB })).toBe(`${NPUB.slice(0, 12)}...`);
  });
});
