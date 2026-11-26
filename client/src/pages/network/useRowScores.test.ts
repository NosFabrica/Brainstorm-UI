// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ConnectionItem } from "@/hooks/useSelf";

const getUserByPubkey = vi.fn();
vi.mock("@/services/api", () => ({ apiClient: { getUserByPubkey: (...a: unknown[]) => getUserByPubkey(...a) } }));

import { cacheFor, useRowScores } from "./useRowScores";

const pk = (c: string) => c.repeat(64);
const rows = (items: [string, number | null][]): Record<string, ConnectionItem[]> => ({
  followed_by: items.map(([pubkey, influence]) => ({ pubkey, influence }) as ConnectionItem),
});

beforeEach(() => getUserByPubkey.mockReset());

describe("cacheFor", () => {
  it("makes one cache per perspective and hands the same one back", () => {
    const caches = new Map<boolean, Map<string, number>>();
    const house = cacheFor(caches, true);
    expect(cacheFor(caches, true)).toBe(house);
    expect(cacheFor(caches, false)).not.toBe(house);
  });
});

describe("useRowScores", () => {
  it("seeds each perspective's scores from its own rows, once per pubkey", () => {
    const { result, rerender } = renderHook(({ house, data }) => useRowScores(house, data), {
      initialProps: { house: false, data: rows([[pk("a"), 0.9]]) },
    });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.9);
    expect(result.current.trustLoadedCount).toBe(1);

    // A later page with a new score for a held row doesn't overwrite it.
    rerender({ house: false, data: rows([[pk("a"), 0.5]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.9);

    rerender({ house: true, data: rows([[pk("a"), 0.1]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.1);

    // Back to the reader's own: the first numbers are still held.
    rerender({ house: false, data: rows([[pk("a"), 0.1]]) });
    expect(result.current.trustCache.current.get(pk("a"))).toBe(0.9);
  });

  it("asks /user/{pk} in this perspective, for the rows not yet scored only", async () => {
    getUserByPubkey.mockImplementation(async (p: string) => ({
      data: { graph: { influence: 0.3, muted_by: [pk("m")], reported_by: [{ pubkey: pk("r"), influence: 1 }] }, p },
    }));
    const { result } = renderHook(() => useRowScores(true, rows([[pk("a"), 0.9]])));
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
    const { result } = renderHook(() => useRowScores(false, {}));
    await act(() => result.current.fetchTrustScores([pk("b"), pk("c")]));
    expect(result.current.trustCache.current.get(pk("b"))).toBeNull();
    expect(result.current.trustCache.current.get(pk("c"))).toBeNull();
    expect(result.current.graphDataCache.current.has(pk("b"))).toBe(false);

    await act(() => result.current.fetchTrustScores([pk("b"), pk("c")]));
    expect(getUserByPubkey).toHaveBeenCalledTimes(2);
  });
});
