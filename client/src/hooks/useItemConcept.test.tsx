// @vitest-environment jsdom
/**
 * An item's governing definition is decided from the headers in the
 * EventStore (docs/adr/0005), which the page's concept batch fills: a copy
 * that lands later — the reader's own, the house's — governs from then on.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { queryWrapper } from "@/test/utils";

const HOUSE = "0".repeat(64);
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const GITHUB = `39998:${AVI}:github-accounts`;
const batch = vi.hoisted(() => vi.fn(async (_reader: unknown, _concept: string): Promise<unknown> => null));
vi.mock("@/services/conceptBatch", () => ({ resolveConceptBatched: batch }));
vi.mock("@/hooks/useDictionaryReader", () => ({
  useDictionaryReader: () => ({ pubkey: null, taPubkey: null, settled: true }),
}));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [GITHUB], rendered: [GITHUB], known: true }),
}));
vi.mock("@/lib/houseObserverQuery", () => ({
  houseObserverQuery: { queryKey: ["house-observer"], queryFn: async () => HOUSE, staleTime: Infinity },
}));
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: async () => undefined }));

import { useItemConcept } from "./useItemConcept";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => __resetAsks());

let n = 0;
const header = (pubkey: string, tags: string[][] = []) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 39998,
    pubkey,
    created_at: 100 + n,
    content: "",
    sig: "s",
    tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
  }) as NostrEvent;
const item = { kind: 39999, tags: [["z", GITHUB]] };

describe("useItemConcept", () => {
  it("resolves the concept from what the batch stored, then a copy that lands later", async () => {
    batch.mockImplementation(async () => {
      eventStore.add(header(AVI));
      return null;
    });
    const { result } = renderHook(() => useItemConcept(item), { wrapper: queryWrapper() });
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.data?.source).toBe("community"));
    expect(batch).toHaveBeenCalledWith({ pubkey: null, taPubkey: null }, GITHUB);
    act(() => {
      eventStore.add(header(HOUSE, [["b", GITHUB, "pointer"]]));
    });
    await waitFor(() => expect(result.current.data?.source).toBe("house"));
  });

  it("asks nothing for an item of a concept the app does not render", async () => {
    const other = `39998:${AVI}:nowhere`;
    const { result } = renderHook(() => useItemConcept({ kind: 39999, tags: [["z", other]] }), {
      wrapper: queryWrapper(),
    });
    // Not one of the concepts the app renders: nothing is asked.
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.data).toBeUndefined();
    expect(batch).not.toHaveBeenCalledWith(expect.anything(), other);
  });
});
