/**
 * What the network says about a list item, read from events: who endorsed
 * it (kind-7 reactions on the hub), and which Nostr profiles claim the
 * GitHub handle it names (NIP-39 `i` tags on kind 0).
 */
import { describe, expect, it } from "vitest";
import { endorsementTemplate, endorsersOf, githubClaimantsOf } from "./itemEngagement";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const reaction = (pubkey: string, created_at: number, content: string) => ({
  pubkey,
  created_at,
  content,
  kind: 7,
  tags: [],
});
const profile = (pubkey: string, created_at: number, claims: string[][]) => ({
  pubkey,
  created_at,
  kind: 0,
  content: "{}",
  tags: claims,
});

describe("endorsersOf", () => {
  it("counts each person once, at their latest positive reaction; a thumbs-down is not an endorsement", () => {
    const out = endorsersOf([
      reaction(A, 10, "+"),
      reaction(A, 20, "🔥"),
      reaction(B, 15, "-"),
      reaction(C, 5, ""),
      reaction(B, 30, "+"),
    ]);
    expect(out).toEqual([
      { pubkey: B, at: 30 },
      { pubkey: A, at: 20 },
      { pubkey: C, at: 5 },
    ]);
  });
});

describe("githubClaimantsOf", () => {
  it("keeps only profiles whose claim really is this GitHub handle, newest profile per person, however the relay matched", () => {
    const out = githubClaimantsOf(
      [
        profile(A, 10, [["i", "github:VitorPamplona", "cf19e2d1"]]),
        profile(B, 10, [["i", "twitter:vitorpamplona", "160375"]]),
        profile(C, 10, [["i", "github:vitorpamplona-fan", ""]]),
        profile(A, 20, [["i", "github:vitorpamplona", "new-proof"]]),
        profile("d".repeat(64), 10, [
          ["i", "github:other"],
          ["i", "github:vitorpamplona", "p2"],
        ]),
      ],
      "vitorpamplona",
    );
    expect(out).toEqual([
      { pubkey: A, proof: "new-proof" },
      { pubkey: "d".repeat(64), proof: "p2" },
    ]);
  });
});

describe("endorsementTemplate", () => {
  it("is a NIP-25 '+' on the item: by id and by address, with its author and kind, each pointing at the hub", () => {
    const item = { id: "1".repeat(64), kind: 39999, pubkey: B, tags: [["d", "nous-clawds4-1vk793p"]] };
    expect(endorsementTemplate(item, "wss://dcosl.brainstorm.world")).toEqual({
      kind: 7,
      content: "+",
      tags: [
        ["e", "1".repeat(64), "wss://dcosl.brainstorm.world"],
        ["a", `39999:${B}:nous-clawds4-1vk793p`, "wss://dcosl.brainstorm.world"],
        ["p", B],
        ["k", "39999"],
      ],
    });
  });
});
