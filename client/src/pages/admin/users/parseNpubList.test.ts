import { nip19 } from "nostr-tools";
import { describe, expect, it } from "vitest";
import { parseNpubList } from "./parseNpubList";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("parseNpubList", () => {
  it("takes npubs and hex keys, one per line or comma-separated", () => {
    const { added, errors } = parseNpubList(`${nip19.npubEncode(A)}\n${B.toUpperCase()}, `, []);
    expect(added).toEqual([
      { pubkey: A, npub: nip19.npubEncode(A) },
      { pubkey: B, npub: nip19.npubEncode(B) },
    ]);
    expect(errors).toEqual([]);
  });

  it("adds each key once, and none already queued", () => {
    const { added } = parseNpubList(`${A}\n${A}\n${B}`, [{ pubkey: B }]);
    expect(added.map((p) => p.pubkey)).toEqual([A]);
  });

  it("returns what isn't a key, cut short", () => {
    const { added, errors } = parseNpubList("not a key at all really\nnpub1broken", []);
    expect(added).toEqual([]);
    expect(errors).toEqual(["not a key at all rea...", "npub1broken..."]);
  });
});
