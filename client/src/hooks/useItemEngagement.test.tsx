// @vitest-environment jsdom
/**
 * A list item's endorsements and GitHub claimants render from the EventStore
 * while the relays are asked (docs/adr/0005), not from a react-query snapshot:
 * a reaction that lands later — the reader's own among them — shows.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";

const claimantProfiles = vi.fn(async (_handle: string): Promise<NostrEvent[]> => []);
vi.mock("@/services/itemEngagement", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/itemEngagement")>();
  return {
    ...actual,
    readItemReactions: async () => [],
    fetchGitHubClaimantProfiles: (handle: string) => claimantProfiles(handle),
    publishEndorsement: vi.fn(),
  };
});

import { useItemEngagement } from "./useItemEngagement";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

const ITEM = { id: "9".repeat(64), kind: 39999, pubkey: "a".repeat(64), tags: [["d", "x"]] };
let n = 0;
const reaction = (pubkey: string, content = "+") =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 7,
    pubkey,
    created_at: 100 + n,
    content,
    sig: "s",
    tags: [["e", ITEM.id]],
  }) as NostrEvent;

describe("useItemEngagement", () => {
  it("shows a reaction that reaches the store after the ask", async () => {
    const { result } = renderHook(() => useItemEngagement(ITEM, null));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.endorsers).toEqual([]);
    act(() => {
      eventStore.add(reaction("b".repeat(64)));
    });
    await waitFor(() => expect(result.current.endorsers.map((e) => e.pubkey)).toEqual(["b".repeat(64)]));
  });

  it("names the profiles that claim the handle", async () => {
    const claimer = {
      id: "c".repeat(64),
      kind: 0,
      pubkey: "c".repeat(64),
      created_at: 1,
      content: "{}",
      sig: "s",
      tags: [["i", "github:Alice", "gist"]],
    } as NostrEvent;
    claimantProfiles.mockResolvedValueOnce([claimer]);
    const { result } = renderHook(() => useItemEngagement({ ...ITEM, id: "8".repeat(64) }, "alice"));
    await waitFor(() => expect(result.current.claimants).toEqual([{ pubkey: claimer.pubkey, proof: "gist" }]));
    expect(claimantProfiles).toHaveBeenCalledWith("alice");
  });
});
