// @vitest-environment jsdom
/**
 * The Connection page's set of paths: the first answer renders at once, the
 * sampled rest arrive behind it, and a shuffle asks afresh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

const ME = "a".repeat(64), T = "f".repeat(64), C1 = "1".repeat(64), C2 = "2".repeat(64);
let served: string[][] = [];
let calls = 0;
const getShortestPath = vi.fn(async () => ({ from: ME, to: T, reachable: true, hops: 2, path: served[calls++ % served.length], pathCount: 3, pathCountCapped: false, maxHops: 6 }));
vi.mock("@/services/api", () => ({ apiClient: { getShortestPath: (o: unknown) => getShortestPath(o) } }));

import { usePathSet } from "./usePathSet";

beforeEach(() => {
  vi.clearAllMocks();
  calls = 0;
  served = [[ME, C1, T], [ME, C2, T], [ME, C1, T]];
});

describe("usePathSet", () => {
  it("shows the first path the moment it lands, then the sampled rest behind it", async () => {
    const { result } = renderHook(() => usePathSet(ME, T, { enabled: true, nonce: 0 }), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.head?.path).toEqual([ME, C1, T]));
    // The probe's path is in `paths` from the moment it lands (the sampled rest may already be there too — mocks answer at once).
    expect(result.current.paths[0]).toEqual([ME, C1, T]);
    await waitFor(() => expect(result.current.sampling).toBe(false));
    expect(result.current.paths).toEqual([[ME, C1, T], [ME, C2, T]]);
    expect(result.current.checked).toBe(2);
    expect(result.current.complete).toBe(false); // 3 exist, 2 found
    expect(getShortestPath).toHaveBeenCalledWith({ from: ME, to: T });
  });

  it("a new nonce asks afresh; disabled asks nothing", async () => {
    const { result, rerender } = renderHook(({ nonce, enabled }) => usePathSet(ME, T, { enabled, nonce }), { wrapper: queryWrapper(), initialProps: { nonce: 0, enabled: false } });
    expect(getShortestPath).not.toHaveBeenCalled();
    rerender({ nonce: 0, enabled: true });
    await waitFor(() => expect(result.current.sampling).toBe(false));
    const before = getShortestPath.mock.calls.length;
    rerender({ nonce: 1, enabled: true });
    await waitFor(() => expect(getShortestPath.mock.calls.length).toBeGreaterThan(before));
  });
});
