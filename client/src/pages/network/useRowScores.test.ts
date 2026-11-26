// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ConnectionItem } from "@/hooks/useSelf";

const getUserByPubkey = vi.fn();
vi.mock("@/services/api", () => ({ apiClient: { getUserByPubkey: (...a: unknown[]) => getUserByPubkey(...a) } }));

import { cacheFor, rowScoreScope, useRowScores } from "./useRowScores";

const pk = (c: string) => c.repeat(64);
const rows = (items: [string, number | null][]): Record<string, ConnectionItem[]> => ({
  followed_by: items.map(([pubkey, influence]) => ({ pubkey, influence }) as ConnectionItem),
});

beforeEach(() => getUserByPubkey.mockReset());

const viewer = pk("v");
const own = (preset: string | null = "default") => ({ house: false, viewer, preset });
const houseScope = (preset: string | null = "default") => ({ house: true, viewer, preset });

describe("cacheFor", () => {
  it("makes one cache per scope and hands the same one back", () => {
    const caches = new Map<string, Map<string, number>>();
    const house = cacheFor(caches, "house");
    expect(cacheFor(caches, "house")).toBe(house);
    expect(cacheFor(caches, "mine")).not.toBe(house);
  });
});

describe("rowScoreScope", () => {
  it("keys the reader's own scores by who reads and under which preset", () => {
    expect(rowScoreScope(own("strict"))).not.toBe(rowScoreScope(own("relaxed")));
    expect(rowScoreScope(own())).not.toBe(rowScoreScope({ ...own(), viewer: pk("w") }));
  });

  it("keys Brainstorm's by nothing else: the house read is the same for every viewer and preset", () => {
    expect(rowScoreScope(houseScope("strict"))).toBe(rowScoreScope({ house: true, viewer: pk("w"), preset: null }));
    expect(rowScoreScope(houseScope())).not.toBe(rowScoreScope(own()));
  });
});

describe("useRowScores", () => {
  it("seeds each perspective's scores from its own rows", () => {
    const { result, rerender } = renderHook(({ scope, data }) => useRowScores(scope, data), {
      initialProps: { scope: own(), data: rows([[pk("a"), 0.9]]) },
    });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.9);
    expect(result.current.trustLoadedCount).toBe(1);
    const ownCache = result.current.trustCache.current;

    rerender({ scope: houseScope(), data: rows([[pk("a"), 0.1]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.1);

    // Back to the reader's own: the first numbers are still held.
    rerender({ scope: own(), data: rows([[pk("a"), 0.9]]) });
    expect(result.current.trustCache.current).toBe(ownCache);
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.9);
  });

  it("takes a refetched row's score over the one it held", () => {
    const { result, rerender } = renderHook(({ scope, data }) => useRowScores(scope, data), {
      initialProps: { scope: own(), data: rows([[pk("a"), 0.9]]) },
    });
    const before = result.current.trustLoadedCount;
    rerender({ scope: own(), data: rows([[pk("a"), 0.5]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.5);
    expect(result.current.trustLoadedCount).toBeGreaterThan(before);
  });

  it("shows a new preset's scores, not the old preset's, once its rows land", () => {
    // A preset change invalidates the section reads: they keep the old pages
    // while they refetch, then hand over the new ones.
    const { result, rerender } = renderHook(({ scope, data }) => useRowScores(scope, data), {
      initialProps: { scope: own("default"), data: rows([[pk("a"), 0.9]]) },
    });
    rerender({ scope: own("strict"), data: rows([[pk("a"), 0.9]]) });
    rerender({ scope: own("strict"), data: rows([[pk("a"), 0.2]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.2);

    // Back to the old preset: its own numbers, not the strict ones.
    rerender({ scope: own("default"), data: rows([[pk("a"), 0.9]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.9);
  });

  it("starts another reader's scores clean", () => {
    const { result, rerender } = renderHook(({ scope, data }) => useRowScores(scope, data), {
      initialProps: { scope: own(), data: rows([[pk("a"), 0.9]]) },
    });
    rerender({ scope: { ...own(), viewer: pk("w") }, data: {} });
    expect(result.current.trustCache.current.has(pk("a"))).toBe(false);
  });

  it("asks /user/{pk} in this perspective, for the rows not yet scored only", async () => {
    getUserByPubkey.mockImplementation(async (p: string) => ({
      data: { graph: { influence: 0.3, muted_by: [pk("m")], reported_by: [{ pubkey: pk("r"), influence: 1 }] }, p },
    }));
    const { result } = renderHook(() => useRowScores(houseScope(), rows([[pk("a"), 0.9]])));
    const ask = [pk("a"), ...Array.from({ length: 9 }, (_, i) => String(i).repeat(64))];
    await act(() => result.current.fetchTrustScores(ask));

    expect(getUserByPubkey).toHaveBeenCalledTimes(9);
    expect(getUserByPubkey).not.toHaveBeenCalledWith(pk("a"), expect.anything());
    expect(getUserByPubkey).toHaveBeenCalledWith(pk("0"), { house: true });
    expect(result.current.trustCache.current.get(pk("0"))).toBe(0.3);
    expect(result.current.graphDataCache.current.get(pk("0"))).toEqual({
      muted_by: [pk("m")],
      reported_by: [pk("r")],
    });
    expect(result.current.trustLoadedCount).toBe(1 + 9);
  });

  it("holds a failed or unscored answer as null, so it isn't asked again", async () => {
    getUserByPubkey.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({ data: { influence: "n/a" } });
    const { result } = renderHook(() => useRowScores(own(), {}));
    await act(() => result.current.fetchTrustScores([pk("b"), pk("c")]));
    expect(result.current.trustCache.current.get(pk("b"))).toBeNull();
    expect(result.current.trustCache.current.get(pk("c"))).toBeNull();
    expect(result.current.graphDataCache.current.has(pk("b"))).toBe(false);

    await act(() => result.current.fetchTrustScores([pk("b"), pk("c")]));
    expect(getUserByPubkey).toHaveBeenCalledTimes(2);
  });
});
