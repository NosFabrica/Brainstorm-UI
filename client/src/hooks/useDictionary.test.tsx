// @vitest-environment jsdom
/**
 * The Dictionary as a reader reads it. Settings › Dictionary is an account's
 * own; search reads the same lists for anyone, signed in or not. Its headers
 * and copies render from the EventStore while the relays are asked
 * (docs/adr/0005): a copy that lands later — the house's, the reader's own —
 * changes which definition governs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { queryWrapper } from "@/test/utils";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { readAgain, DICTIONARY_READS } from "@/lib/readGeneration";

const HOUSE = "0".repeat(64);
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const GITHUB = `39998:${AVI}:github-accounts`;
vi.mock("@/hooks/useDictionaryReader", () => ({
  useDictionaryReader: () => ({ pubkey: null, taPubkey: null, settled: true }),
}));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [GITHUB], rendered: [GITHUB], known: true }),
}));
vi.mock("@/lib/houseObserverQuery", () => ({
  houseObserverQuery: { queryKey: ["house-observer"], queryFn: async () => HOUSE, staleTime: Infinity },
}));
// The house names no Assistant: its own copies are Brainstorm's.
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: async () => undefined }));
const readHeaders = vi.fn(async (_concepts: string[], _copyAuthors: string[]): Promise<unknown[]> => []);
vi.mock("@/services/dictionary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/dictionary")>()),
  readDictionaryHeaders: (concepts: string[], copyAuthors: string[]) => readHeaders(concepts, copyAuthors),
}));

import { __forgetDictionaries, useDictionary } from "./useDictionary";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});

let n = 0;
const header = (pubkey: string, tags: string[][] = [], created_at = 100) =>
  ({
    id: (++n).toString(16).padStart(64, "0"),
    kind: 39998,
    pubkey,
    created_at,
    content: "",
    sig: "s",
    tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
  }) as NostrEvent;
const held: NostrEvent[] = [];
const add = (event: NostrEvent) => {
  held.push(event);
  return eventStore.add(event);
};

beforeEach(() => {
  __forgetDictionaries();
  __resetAsks();
  for (const e of held.splice(0)) eventStore.remove(e);
  readHeaders.mockReset();
  readHeaders.mockImplementation(async () => []);
});

describe("useDictionary with no account", () => {
  it("reads nothing for an account's own Dictionary", async () => {
    renderHook(() => useDictionary(), { wrapper: queryWrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(readHeaders).not.toHaveBeenCalled();
  });

  it("reads the lists anyway when asked to for anyone", async () => {
    renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(readHeaders).toHaveBeenCalled());
    // Over the concepts the Dictionary shows, from its curators (hooks/useDictionaryConcepts), with the house's copies.
    expect(readHeaders.mock.calls[0]).toEqual([[GITHUB], [HOUSE]]);
  });
});

describe("useDictionary from the store", () => {
  it("renders what the ask stored, then a copy that lands later", async () => {
    readHeaders.mockImplementation(async () => [add(header(AVI))]);
    const { result } = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.data?.[0]?.resolved?.source).toBe("community"));
    act(() => {
      add(header(HOUSE, [["b", GITHUB, "pointer"]]));
    });
    await waitFor(() => expect(result.current.data?.[0]?.resolved?.source).toBe("house"));
  });

  it("asks again on readAgain, as an invalidation did", async () => {
    renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(readHeaders).toHaveBeenCalledTimes(1));
    await act(() => readAgain(DICTIONARY_READS));
    expect(readHeaders).toHaveBeenCalledTimes(2);
  });
});

describe("useDictionary remembered", () => {
  it("stands in with what this device last read while it is read again, then takes the new answer", async () => {
    const community = header(AVI);
    readHeaders.mockImplementation(async () => [add(community)]);
    const first = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(first.result.current.data?.[0]?.resolved?.source).toBe("community"));
    first.unmount();

    // A new visit: an empty store and no asks, and the relays not answered yet.
    __resetAsks();
    eventStore.remove(community);
    let answer!: () => void;
    readHeaders.mockImplementation(
      () =>
        new Promise((r) => {
          answer = () => r([add(header(HOUSE, [["b", GITHUB, "pointer"]]))]);
        }),
    );
    const next = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    expect(next.result.current).toMatchObject({ isPending: false });
    expect(next.result.current.data?.[0]?.resolved?.source).toBe("community");
    await waitFor(() => expect(readHeaders).toHaveBeenCalledTimes(2));
    answer();
    await waitFor(() => expect(next.result.current.data?.[0]?.resolved?.source).toBe("house"));
  });

  it("stands in for nothing it would not read", async () => {
    readHeaders.mockImplementation(async () => [add(header(AVI))]);
    const first = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(first.result.current.data?.[0]?.resolved).toBeTruthy());
    first.unmount();
    const off = renderHook(() => useDictionary(false, { anonymous: true }), { wrapper: queryWrapper() });
    expect(off.result.current.data).toBeUndefined();
  });

  it("remembers no empty answer: a read that failed is not the Dictionary", async () => {
    const first = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(first.result.current.data?.[0]?.resolved).toBeNull());
    first.unmount();
    __resetAsks();
    readHeaders.mockImplementation(() => new Promise(() => {}));
    const next = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    expect(next.result.current.data).toBeUndefined();
  });
});
