// @vitest-environment jsdom
/**
 * The Connection page's Path network: one request for the whole network, and
 * hops alone when the server can't compute it in time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

const ME = "a".repeat(64),
  T = "f".repeat(64),
  C1 = "1".repeat(64),
  C2 = "2".repeat(64);

const api = vi.hoisted(() => ({
  getShortestPath: vi.fn(),
  getShortestHops: vi.fn(),
}));
vi.mock("@/services/api", () => ({ apiClient: api }));

import { PathNetworkTooLargeError } from "@/services/api/users";
import { usePathNetwork } from "./usePathNetwork";

const response = {
  from: ME,
  to: T,
  reachable: true,
  hops: 2,
  pathCount: 2,
  layers: [[C1, C2]],
  links: [],
  maxHops: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getShortestPath.mockResolvedValue(response);
  api.getShortestHops.mockResolvedValue({ from: ME, to: T, reachable: true, hops: 4, maxHops: 30 });
});

describe("usePathNetwork", () => {
  it("asks once for the whole network", async () => {
    const { result } = renderHook(() => usePathNetwork(ME, T, { enabled: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.network).toBeDefined());
    expect(result.current.network).toEqual(response);
    expect(result.current.tooLarge).toBe(false);
    expect(api.getShortestPath).toHaveBeenCalledTimes(1);
    expect(api.getShortestPath).toHaveBeenCalledWith({ from: ME, to: T });
    expect(api.getShortestHops).not.toHaveBeenCalled();
  });

  it("too large to compute: falls back to hops alone, with no network", async () => {
    api.getShortestPath.mockRejectedValue(new PathNetworkTooLargeError());
    const { result } = renderHook(() => usePathNetwork(ME, T, { enabled: true }), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.hops?.hops).toBe(4));
    expect(result.current.tooLarge).toBe(true);
    expect(result.current.network).toBeUndefined();
    expect(result.current.isPending).toBe(false);
    expect(api.getShortestHops).toHaveBeenCalledWith({ from: ME, to: T });
  });

  it("disabled asks nothing", () => {
    renderHook(() => usePathNetwork(ME, T, { enabled: false }), { wrapper: queryWrapper() });
    expect(api.getShortestPath).not.toHaveBeenCalled();
  });
});
