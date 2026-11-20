import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { entityPathForSegment } from "./resolveNostrEntity";

const PK = "f".repeat(64);
const ID = "e".repeat(64);
const npub = nip19.npubEncode(PK);
const nprofile = nip19.nprofileEncode({ pubkey: PK, relays: ["wss://relay.example/"] });
const note = nip19.noteEncode(ID);
const nevent = nip19.neventEncode({ id: ID, relays: ["wss://relay.example/"] });
const naddr = nip19.naddrEncode({ kind: 30023, pubkey: PK, identifier: "post" });

describe("entityPathForSegment", () => {
  it("sends a person's id to /p/ and an event's to /e/", () => {
    expect(entityPathForSegment(npub)).toBe(`/p/${npub}`);
    expect(entityPathForSegment(nprofile)).toBe(`/p/${nprofile}`);
    expect(entityPathForSegment(note)).toBe(`/e/${note}`);
    expect(entityPathForSegment(nevent)).toBe(`/e/${nevent}`);
    expect(entityPathForSegment(naddr)).toBe(`/e/${naddr}`);
  });

  it("takes a nostr: URI, encoded or not, and an all-caps id from a QR", () => {
    expect(entityPathForSegment(`nostr:${nevent}`)).toBe(`/e/${nevent}`);
    expect(entityPathForSegment(`nostr%3A${npub}`)).toBe(`/p/${npub}`);
    expect(entityPathForSegment(npub.toUpperCase())).toBe(`/p/${npub}`);
  });

  it("leaves everything else to the not-found page", () => {
    for (const segment of ["about", "nostr", "notes", PK, `x${npub}`, `${npub}x!`, npub.slice(0, 30), "%E0%A4%A"]) {
      expect(entityPathForSegment(segment)).toBeNull();
    }
  });
});
