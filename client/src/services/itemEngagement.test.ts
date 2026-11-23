// @vitest-environment jsdom
/**
 * The relay reads behind a list item's engagement: reactions from the hub
 * and our index both (services/listReads), claimants from our index, which
 * is the one relay that can be asked for a kind 0 by its `i` tag.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  readListEvents: vi.fn(),
  fetchFromSearchRelayByFilters: vi.fn(),
  signAs: vi.fn(),
  publishTagEvent: vi.fn(),
}));
vi.mock("@/accounts/signing", () => ({
  requireActiveAccount: () => ({ pubkey: "f".repeat(64) }),
  signAs: reads.signAs,
}));
vi.mock("@/services/tags", () => ({ publishTagEvent: reads.publishTagEvent }));
vi.mock("@/config/dictionary", () => ({ dictionaryRelays: () => ["wss://dcosl.brainstorm.world"] }));
vi.mock("@/services/listReads", () => ({ readListEvents: reads.readListEvents }));
vi.mock("@/services/nostr", () => ({ fetchFromSearchRelayByFilters: reads.fetchFromSearchRelayByFilters }));

import { fetchItemReactions, fetchGitHubClaimants, publishEndorsement } from "./itemEngagement";

const A = "a".repeat(64);
const item = {
  id: "1".repeat(64),
  kind: 39999,
  pubkey: "b".repeat(64),
  tags: [
    ["d", "nous-clawds4-1vk793p"],
    ["z", "39998:x:github-accounts"],
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchItemReactions", () => {
  it("asks for reactions by the item's id and by its address, and returns whoever endorsed it", async () => {
    reads.readListEvents.mockResolvedValue([{ id: "r1", kind: 7, pubkey: A, created_at: 9, content: "+", tags: [] }]);
    const out = await fetchItemReactions(item);
    expect(out).toEqual([{ pubkey: A, at: 9 }]);
    expect(reads.readListEvents).toHaveBeenCalledWith(
      [
        { kinds: [7], "#e": [item.id], limit: 200 },
        { kinds: [7], "#a": [`39999:${item.pubkey}:nous-clawds4-1vk793p`], limit: 200 },
      ],
      expect.any(Number),
    );
  });
});

describe("fetchGitHubClaimants", () => {
  it("asks our index for profiles claiming the handle and keeps the real claims", async () => {
    reads.fetchFromSearchRelayByFilters.mockResolvedValue([
      { id: "p1", kind: 0, pubkey: A, created_at: 1, content: "{}", tags: [["i", "github:vcavallo", "proof"]] },
      {
        id: "p2",
        kind: 0,
        pubkey: "c".repeat(64),
        created_at: 1,
        content: "{}",
        tags: [["i", "twitter:vcavallo", "x"]],
      },
    ]);
    const out = await fetchGitHubClaimants("vcavallo");
    expect(out).toEqual([{ pubkey: A, proof: "proof" }]);
    expect(reads.fetchFromSearchRelayByFilters).toHaveBeenCalledWith(
      [{ kinds: [0], "#i": ["github:vcavallo"], limit: 100 }],
      expect.any(Number),
    );
  });
});

describe("fetchGitHubClaimants, many at once", () => {
  const claim = (pubkey: string, handle: string) => ({
    id: pubkey.slice(0, 4) + handle,
    kind: 0,
    pubkey,
    created_at: 1,
    content: "{}",
    tags: [["i", `github:${handle}`, ""]],
  });

  it("asks for every handle of a list in one REQ, and hands each its own claimants", async () => {
    const B = "b".repeat(64);
    reads.fetchFromSearchRelayByFilters.mockResolvedValue([claim(A, "alice"), claim(B, "bob")]);
    const [alice, bob, carol] = await Promise.all(["alice", "bob", "carol"].map(fetchGitHubClaimants));
    expect(reads.fetchFromSearchRelayByFilters).toHaveBeenCalledTimes(1);
    expect(reads.fetchFromSearchRelayByFilters).toHaveBeenCalledWith(
      [{ kinds: [0], "#i": ["github:alice", "github:bob", "github:carol"], limit: 300 }],
      expect.any(Number),
    );
    expect(alice).toEqual([{ pubkey: A, proof: null }]);
    expect(bob).toEqual([{ pubkey: B, proof: null }]);
    expect(carol).toEqual([]);
  });

  it("stays under the relay's subscription cap: fifty handles a REQ", async () => {
    reads.fetchFromSearchRelayByFilters.mockResolvedValue([]);
    await Promise.all(Array.from({ length: 120 }, (_, i) => fetchGitHubClaimants(`user${i}`)));
    const sizes = reads.fetchFromSearchRelayByFilters.mock.calls.map((c) => (c[0][0]["#i"] as string[]).length);
    expect(sizes).toEqual([50, 50, 20]);
  });

  it("asks once for a handle two rows share, and answers both", async () => {
    reads.fetchFromSearchRelayByFilters.mockResolvedValue([claim(A, "alice")]);
    const [one, two] = await Promise.all([fetchGitHubClaimants("alice"), fetchGitHubClaimants("alice")]);
    expect(reads.fetchFromSearchRelayByFilters.mock.calls[0][0][0]["#i"]).toEqual(["github:alice"]);
    expect(one).toEqual(two);
  });

  it("answers no claimants, rather than failing, when the relay can't be read", async () => {
    reads.fetchFromSearchRelayByFilters.mockRejectedValue(new Error("down"));
    expect(await fetchGitHubClaimants("alice")).toEqual([]);
  });
});

describe("publishEndorsement", () => {
  it("signs a '+' on the item as the active account and publishes it where list events go", async () => {
    const signed = { id: "s", kind: 7, pubkey: "f".repeat(64), created_at: 5, content: "+", tags: [], sig: "" };
    reads.signAs.mockResolvedValue(signed);
    reads.publishTagEvent.mockResolvedValue({ accepted: 1, total: 2 });
    const out = await publishEndorsement(item);
    expect(reads.signAs).toHaveBeenCalledWith(
      { pubkey: "f".repeat(64) },
      expect.objectContaining({
        kind: 7,
        content: "+",
        tags: expect.arrayContaining([["e", item.id, "wss://dcosl.brainstorm.world"]]),
      }),
    );
    expect(reads.publishTagEvent).toHaveBeenCalledWith(signed);
    expect(out).toEqual({ pubkey: "f".repeat(64), at: 5 });
  });
});
