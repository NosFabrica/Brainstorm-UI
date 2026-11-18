// @vitest-environment jsdom
/**
 * The Dictionary as a reader reads it. Settings › Dictionary is an account's
 * own; search reads the same lists for anyone, signed in or not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

vi.mock("@/hooks/useDictionaryReader", () => ({
  useDictionaryReader: () => ({ pubkey: null, taPubkey: null, settled: true }),
}));
const GITHUB = "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts";
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [GITHUB], rendered: [GITHUB], known: true }),
}));
const loadDictionary = vi.fn(async (_reader: unknown, ..._rest: unknown[]) => []);
vi.mock("@/services/dictionary", () => ({
  loadDictionary: (reader: unknown, ...rest: unknown[]) => loadDictionary(reader, ...rest),
}));

import { __forgetDictionaries, useDictionary } from "./useDictionary";

beforeEach(() => {
  __forgetDictionaries();
  loadDictionary.mockReset();
  loadDictionary.mockImplementation(async () => []);
});

describe("useDictionary with no account", () => {
  it("reads nothing for an account's own Dictionary", async () => {
    renderHook(() => useDictionary(), { wrapper: queryWrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(loadDictionary).not.toHaveBeenCalled();
  });

  it("reads the lists anyway when asked to for anyone", async () => {
    renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(loadDictionary).toHaveBeenCalled());
    expect(loadDictionary.mock.calls[0][0]).toEqual({ pubkey: null, taPubkey: null });
    // Over the concepts the Dictionary shows, from its curators (hooks/useDictionaryConcepts).
    expect(loadDictionary.mock.calls[0][1]).toEqual([GITHUB]);
  });
});

describe("useDictionary remembered", () => {
  const entry = { communityCoordinate: GITHUB, resolved: null, inDictionary: false, items: [] };

  it("stands in with what this device last read while it is read again, then takes the new answer", async () => {
    loadDictionary.mockImplementation(async () => [entry] as never);
    const first = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(first.result.current.data).toEqual([entry]));
    first.unmount();

    // A new visit: a fresh cache, and the relays not answered yet.
    let answer!: (entries: never) => void;
    loadDictionary.mockImplementation(() => new Promise((r) => (answer = r)));
    const next = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    expect(next.result.current).toMatchObject({ data: [entry], isPending: false });
    await waitFor(() => expect(loadDictionary).toHaveBeenCalledTimes(2));
    const changed = { ...entry, inDictionary: true };
    answer([changed] as never);
    await waitFor(() => expect(next.result.current.data).toEqual([changed]));
  });

  it("stands in for nothing it would not read", async () => {
    loadDictionary.mockImplementation(async () => [entry] as never);
    const first = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(first.result.current.data).toEqual([entry]));
    first.unmount();
    const off = renderHook(() => useDictionary(false, { anonymous: true }), { wrapper: queryWrapper() });
    expect(off.result.current.data).toBeUndefined();
  });

  it("remembers no empty answer: a read that failed is not the Dictionary", async () => {
    renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(loadDictionary).toHaveBeenCalled());
    const next = renderHook(() => useDictionary(true, { anonymous: true }), { wrapper: queryWrapper() });
    expect(next.result.current.data).toBeUndefined();
  });
});
