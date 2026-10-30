// @vitest-environment jsdom
/**
 * The shortest-path requests: the full Path network, and hops alone. And the
 * Assistant's routes: a failure keeps its status and says whether its words
 * are the server's own (`AssistantRouteError`), which the Treasure Map's Turn
 * off and its retry read; an answer that isn't a check means no route here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/api";
import { AssistantRouteError, PathNetworkTooLargeError, TreasureMapUnavailableError } from "@/services/api/users";

const auth = vi.hoisted(() => ({ fetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>() }));
vi.mock("@/services/api/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  authenticatedFetch: (url: string, init?: RequestInit) => auth.fetch(url, init),
}));

afterEach(() => vi.unstubAllGlobals());

describe("the Assistant's routes, when they fail", () => {
  const TOO_MANY =
    "Your Treasure Map names more than 64 keys, too many to check, so your Assistant's Treasure Map couldn't be checked.";
  const answer = (status: number, body: string) => auth.fetch.mockResolvedValue(new Response(body, { status }));
  const failure = (call: Promise<unknown>) =>
    call.then(
      () => expect.unreachable(),
      (e: unknown) => e,
    );

  it("keep the status, and the server's sentence as said", async () => {
    answer(422, JSON.stringify({ detail: TOO_MANY }));
    const err = await failure(apiClient.getAssistantTreasureMap());
    expect(err).toBeInstanceOf(AssistantRouteError);
    expect(err).toMatchObject({ status: 422, said: true, message: TOO_MANY });
  });

  it("an answer without a sentence is ours, with its status, and not said", async () => {
    answer(500, "Internal Server Error");
    expect(await failure(apiClient.getAssistantTreasureMap())).toMatchObject({
      status: 500,
      said: false,
      message: "Couldn't check your Assistant's Treasure Map (500)",
    });
    // A validation error's detail is a list, not a sentence.
    answer(422, JSON.stringify({ detail: [{ loc: ["body", "on"], msg: "Input should be a valid boolean" }] }));
    expect(await failure(apiClient.setAssistantTreasureMap(true))).toMatchObject({
      status: 422,
      said: false,
      message: "Couldn't publish your Assistant's Treasure Map (422)",
    });
  });

  it("a 404 or 405 is no such route here", async () => {
    for (const status of [404, 405]) {
      answer(status, "{}");
      expect(await failure(apiClient.getAssistantTreasureMap())).toBeInstanceOf(TreasureMapUnavailableError);
    }
  });
});

describe("getAssistantTreasureMap: an answer that isn't a check means no route", () => {
  it.each([
    ["a profile from GET /user/{pubkey}", JSON.stringify({ code: 200, data: { followed_by: [] } })],
    ["a page that isn't JSON", "<!doctype html><title>app</title>"],
    ["an empty body", ""],
  ])("%s", async (_what, body) => {
    auth.fetch.mockResolvedValue(new Response(body, { status: 200 }));
    await expect(apiClient.getAssistantTreasureMap()).rejects.toBeInstanceOf(TreasureMapUnavailableError);
  });

  it("a body that fails to arrive is a failure, not a missing route", async () => {
    const broken = new ReadableStream({
      start: (c) => c.error(new DOMException("signal timed out", "TimeoutError")),
    });
    auth.fetch.mockResolvedValue(new Response(broken, { status: 200 }));
    const err = await apiClient.getAssistantTreasureMap().catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(TreasureMapUnavailableError);
  });
});

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
