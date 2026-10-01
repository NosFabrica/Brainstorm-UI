// @vitest-environment jsdom
/**
 * The shortest-path requests: the full Path network, and hops alone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/api";
import { PathNetworkTooLargeError } from "@/services/api/users";

afterEach(() => vi.unstubAllGlobals());

describe("getShortestPath", () => {
  it("asks for the Path network and reads layers and links back", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              from: "a",
              to: "b",
              reachable: true,
              hops: 3,
              pathCount: 2,
              layers: [["c", "d"], ["e"]],
              links: [[[0], [0]]],
              maxHops: 30,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await apiClient.getShortestPath({ from: "a", to: "b" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect([...url.searchParams.keys()].sort()).toEqual(["from", "to"]);
    expect(r).toMatchObject({ pathCount: 2, layers: [["c", "d"], ["e"]], links: [[[0], [0]]] });
  });

  it("a 504 means the network is too large to compute, told apart from other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 504 })),
    );
    await expect(apiClient.getShortestPath({ from: "a", to: "b" })).rejects.toBeInstanceOf(PathNetworkTooLargeError);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    await expect(apiClient.getShortestPath({ from: "a", to: "b" })).rejects.not.toBeInstanceOf(
      PathNetworkTooLargeError,
    );
  });
});

describe("getShortestHops", () => {
  it("asks for hops only and reads reachable/hops back", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { from: "a", to: "b", reachable: true, hops: 2, pathCount: null, layers: [], links: [], maxHops: 30 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await apiClient.getShortestHops({ from: "a", to: "b" });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/shortestPath");
    expect(url.searchParams.get("only")).toBe("hops");
    expect(url.searchParams.get("from")).toBe("a");
    expect(url.searchParams.get("to")).toBe("b");
    expect(r).toMatchObject({ reachable: true, hops: 2 });
  });
});
