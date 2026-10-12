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
}));
vi.mock("@/services/listReads", () => ({ readListEvents: reads.readListEvents }));
vi.mock("@/services/nostr", () => ({ fetchFromSearchRelayByFilters: reads.fetchFromSearchRelayByFilters }));

import { fetchItemReactions, fetchGitHubClaimants } from "./itemEngagement";

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
