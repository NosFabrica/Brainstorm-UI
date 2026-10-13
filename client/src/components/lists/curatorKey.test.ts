/**
 * A curator's key where there is no profile name: an npub, or what came when
 * that isn't a key — and never a throw, whatever an index event carries.
 */
import { describe, expect, it } from "vitest";
import { nip19 } from "nostr-tools";
import { shortNpub } from "@/components/messages/people";
import { curatorKey } from "./curatorKey";

const HEX = "a".repeat(64);

describe("curatorKey", () => {
  it("encodes a hex key as an npub", () => {
    expect(curatorKey(HEX)).toBe(nip19.npubEncode(HEX));
  });

  it("returns what is not a key as it came", () => {
    expect(curatorKey("not-a-key")).toBe("not-a-key");
  });

  it("returns an empty string for a pubkey that is missing or empty", () => {
    expect(curatorKey(undefined as unknown as string)).toBe("");
    expect(curatorKey(null as unknown as string)).toBe("");
    expect(curatorKey("")).toBe("");
  });

  it("returns a number as text", () => {
    expect(curatorKey(42 as unknown as string)).toBe("42");
  });
});

// The short key List Management shows is the one Messages shows: it has to bear an index event's authors too.
describe("shortNpub", () => {
  it("is the npub's start and end", () => {
    const npub = nip19.npubEncode(HEX);
    expect(shortNpub(HEX)).toBe(`${npub.slice(0, 10)}…${npub.slice(-4)}`);
  });

  it("does not throw for a pubkey that is not a string", () => {
    expect(shortNpub(undefined as unknown as string)).toBe("…");
    expect(shortNpub(null as unknown as string)).toBe("…");
    expect(shortNpub("")).toBe("…");
    expect(shortNpub(42 as unknown as string)).toBe("42…");
    expect(shortNpub("not-a-key")).toBe("not-a-ke…");
  });
});
