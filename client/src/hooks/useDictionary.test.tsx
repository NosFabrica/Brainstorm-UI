// @vitest-environment jsdom
/**
 * The Dictionary as a reader reads it. Settings › Dictionary is an account's
 * own; search reads the same lists for anyone, signed in or not.
 */
import { describe, expect, it, vi } from "vitest";
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

import { useDictionary } from "./useDictionary";

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
    // Over the concepts the Dictionary shows, from its list (hooks/useDictionaryConcepts).
    expect(loadDictionary.mock.calls[0][1]).toEqual([GITHUB]);
  });
});
