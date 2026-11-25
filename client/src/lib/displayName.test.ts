import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { nameOf, profileName, shortNpub } from "./displayName";

const PK = "a".repeat(64);

describe("naming a person", () => {
  it("takes the display name, then the name, then a short npub", () => {
    expect(profileName({ display_name: "Ana", name: "ana" }, PK)).toBe("Ana");
    expect(profileName({ display_name: "  ", name: "ana" }, PK)).toBe("ana");
    const npub = nip19.npubEncode(PK);
    expect(profileName(undefined, PK)).toBe(`${npub.slice(0, 10)}…${npub.slice(-4)}`);
    expect(nameOf(PK, new Map([[PK, { name: "ana" }]]))).toBe("ana");
  });

  it("never encodes something that isn't a key", () => {
    expect(shortNpub("not-a-key-at-all")).toBe("not-a-ke…");
  });
});
