import { describe, expect, it } from "vitest";
import type { NostrEvent } from "applesauce-core/helpers";

import { declaresLists, declaresTrustProvider, describeDesignation, listRows, mergeDesignation } from "./nip85Declaration";

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

// Trusted Lists are published by the same Brainstorm assistant; other apps find
// them through the 10040. Adding them must not cost the user anything already
// in their 10040 — another provider's rows included.
describe("listRows / mergeDesignation", () => {
  const LISTS = { key: "e".repeat(64), relay: "wss://nip85-staging.example" };

  it("names the assistant for every Trusted List kind", () => {
    expect(listRows(LISTS)).toEqual([
      ["30392", LISTS.key, LISTS.relay],
      ["30393", LISTS.key, LISTS.relay],
      ["30394", LISTS.key, LISTS.relay],
    ]);
  });

  it("replaces only the rows it sets and keeps every other tag", () => {
    const existing = [
      ["30382:rank", OTHER_TA, RELAY],
      ["30382:hops", OTHER_TA, RELAY],
      ["30383:rank", "f".repeat(64), "wss://someone-else.example"],
    ];
    const merged = mergeDesignation(existing, [["30382:rank", TA, RELAY], ["30382:followers", TA, RELAY], ...listRows(LISTS)]);

    expect(merged).toContainEqual(["30382:hops", OTHER_TA, RELAY]);
    expect(merged).toContainEqual(["30383:rank", "f".repeat(64), "wss://someone-else.example"]);
    expect(merged).toContainEqual(["30382:rank", TA, RELAY]);
    expect(merged).not.toContainEqual(["30382:rank", OTHER_TA, RELAY]);
    expect(merged.filter((t) => t[0] === "30382:rank")).toHaveLength(1);
    expect(merged).toContainEqual(["30394", LISTS.key, LISTS.relay]);
  });
});

describe("declaresLists", () => {
  const LISTS = { key: "e".repeat(64), relay: "wss://nip85-staging.example" };

  it("is true only when every list kind names the assistant on its relay", () => {
    expect(declaresLists(event10040([["30382:rank", TA, RELAY], ...listRows(LISTS)]), LISTS)).toBe(true);
    // A trailing slash is the same relay.
    expect(declaresLists(event10040(listRows({ ...LISTS, relay: `${LISTS.relay}/` })), LISTS)).toBe(true);
  });

  it("is false with a kind missing, another key, or no 10040 at all", () => {
    expect(declaresLists(event10040(listRows(LISTS).slice(0, 2)), LISTS)).toBe(false);
    expect(declaresLists(event10040(listRows({ ...LISTS, key: OTHER_TA })), LISTS)).toBe(false);
    expect(declaresLists(undefined, LISTS)).toBe(false);
  });
});

/**
 * A 10040 read for people. Every one on the search relay is a Brainstorm
 * activation — empty content, rows pointing at scores.brainstorm.world — and
 * rendered as a blank "Post" row and an empty page (Benjamin, 2026-09-23,
 * `kind:10040` on Everything). The description is what a row and a page say.
 */
describe("describeDesignation", () => {
  it("names the signals, the lists, and the provider, for an activation of ours", () => {
    const d = describeDesignation(event10040([
      ["30382:rank", TA, "wss://scores.brainstorm.world"],
      ["30382:followers", TA, "wss://scores.brainstorm.world"],
      ["30392", TA, "wss://scores.brainstorm.world"],
      ["30393", TA, "wss://scores.brainstorm.world"],
    ]));
    expect(d.signals).toEqual(["Rank", "Followers"]);
    expect(d.lists).toBe(true);
    expect(d.providers).toEqual([{ pubkey: TA, relay: "wss://scores.brainstorm.world", brainstorm: true }]);
    expect(d.summary).toBe("Activated Brainstorm trust signals · Rank, Followers, Trusted Lists");
  });

  it("says whose signals they are when the provider is not ours", () => {
    const d = describeDesignation(event10040([["30382:rank", OTHER_TA, "wss://nip85.example.com"]]));
    expect(d.signals).toEqual(["Rank"]);
    expect(d.lists).toBe(false);
    expect(d.providers).toEqual([{ pubkey: OTHER_TA, relay: "wss://nip85.example.com", brainstorm: false }]);
    expect(d.summary).toBe("Trusts a provider for Rank");
  });

  it("an empty designation says so", () => {
    expect(describeDesignation(event10040([])).summary).toBe("No trust provider designated");
  });
});
