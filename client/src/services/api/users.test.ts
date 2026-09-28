// @vitest-environment jsdom
/**
 * The shortest-path request: the page now asks the server to send its list
 * of paths, bounded, and reads it back when a server does.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/api";

afterEach(() => vi.unstubAllGlobals());

describe("getShortestPath", () => {
  it("bounds the list it asks for with maxPaths, and reads the paths a server sends back", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { from: "a", to: "b", reachable: true, hops: 2, path: ["a", "c", "b"], pathCount: 2, pathCountCapped: false, maxHops: 6, paths: [["a", "c", "b"], ["a", "d", "b"]] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await apiClient.getShortestPath({ from: "a", to: "b", maxPaths: 50 });
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("maxPaths")).toBe("50");
    expect(r.paths).toEqual([["a", "c", "b"], ["a", "d", "b"]]);
  });

  it("asks as before when no bound is given", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { path: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await apiClient.getShortestPath({ from: "a", to: "b" });
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.has("maxPaths")).toBe(false);
  });
});
