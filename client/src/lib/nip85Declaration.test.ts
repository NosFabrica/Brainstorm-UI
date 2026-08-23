import { describe, expect, it } from "vitest";
import type { NostrEvent } from "applesauce-core/helpers";

import { declaresTrustProvider } from "./nip85Declaration";

const TA = "a".repeat(64);
const OTHER_TA = "b".repeat(64);
const RELAY = "wss://nip85.example.com";

function event10040(tags: string[][]): NostrEvent {
  return {
    id: "0".repeat(64),
    pubkey: "c".repeat(64),
    created_at: 1700000000,
    kind: 10040,
    tags,
    content: "",
    sig: "d".repeat(128),
  };
}

describe("declaresTrustProvider", () => {
  it("accepts a declaration naming our TA on our relay for both rank and followers", () => {
    const event = event10040([
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(true);
  });

  it("rejects a declaration pointing at a different TA", () => {
    const event = event10040([
      ["30382:rank", OTHER_TA, RELAY],
      ["30382:followers", OTHER_TA, RELAY],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(false);
  });

  // Brainstorm publishes both metrics; a rank-only declaration is stale or
  // partial, and prompting for a re-sign is the remedy.
  it("rejects when the followers tag is missing", () => {
    const event = event10040([["30382:rank", TA, RELAY]]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(false);
  });

  it("rejects when the relay hint differs", () => {
    const event = event10040([
      ["30382:rank", TA, "wss://elsewhere.example.com"],
      ["30382:followers", TA, "wss://elsewhere.example.com"],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(false);
  });

  // An empty-tags 10040 is the NIP-85 deactivation form.
  it("rejects a deactivation (empty tag list)", () => {
    expect(declaresTrustProvider(event10040([]), TA, RELAY)).toBe(false);
  });

  // Guards the caller that hasn't been assigned a TA yet — an empty expected
  // key must never accidentally match a malformed tag.
  it("rejects when the expected TA is empty", () => {
    const event = event10040([
      ["30382:rank", "", RELAY],
      ["30382:followers", "", RELAY],
    ]);
    expect(declaresTrustProvider(event, "", RELAY)).toBe(false);
  });

  it("accepts when matching tags sit among unrelated ones", () => {
    const event = event10040([
      ["30382:rank", OTHER_TA, RELAY],
      ["30382:rank", TA, RELAY],
      ["30382:followers", TA, RELAY],
      ["30382:hops", TA, RELAY],
    ]);
    expect(declaresTrustProvider(event, TA, RELAY)).toBe(true);
  });
});
