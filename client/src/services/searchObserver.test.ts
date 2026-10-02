// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetServerStatus, reportApiFailure } from "@/lib/serverStatus";
import { isSearchObserverOnRelay } from "./searchObserver";

const api = vi.hoisted(() => ({ base: "http://test.local" }));
vi.mock("@/services/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/core")>()),
  getBrainstormApi: () => api.base,
}));

const USER = "a".repeat(64);

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  api.base = "http://test.local";
  __resetServerStatus();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("isSearchObserverOnRelay", () => {
  it("asks our API's ORE-05 to rank through the user, and is true on 200", async () => {
    reply(200, { results: [], ttl: 300 });
    expect(await isSearchObserverOnRelay(USER)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://test.local/search/pubkeys");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "include:spam",
      algorithm: "relevance-pov",
      pov: USER,
      limit: 1,
    });
  });

  it("sends no session token: the endpoint is public", async () => {
    reply(200, { results: [], ttl: 300 });
    await isSearchObserverOnRelay(USER);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has("access_token")).toBe(false);
  });

  it("is false while the relay is still mirroring the user's scores (202)", async () => {
    reply(202, { status: "computing", retry_after: 60 });
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
  });

  it("is false when the relay cannot rank through the user (422)", async () => {
    reply(422, { error: "the pov has no trust provider list" });
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
  });

  it("is false when the API errors", async () => {
    reply(503, { error: "busy" });
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
  });

  it("does not feed the server-down detector on a 503", async () => {
    reportApiFailure("/user/aaa/overview");
    reply(503, { error: "busy" });
    await isSearchObserverOnRelay(USER);
    await new Promise((r) => setTimeout(r, 0));
    // A second failing route would have earned a health probe: none went out.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is false without an API base, and does not ask", async () => {
    api.base = "";
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is false when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await isSearchObserverOnRelay(USER)).toBe(false);
  });
});
