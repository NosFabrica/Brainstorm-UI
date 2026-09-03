// @vitest-environment jsdom
/**
 * Link metadata for plain URLs — the browser can't read another site's title
 * or description (CORS), so this asks our server's unfurl proxy
 * (GET /api/unfurl?url=…, RELAY-ASKS #7). Wired ahead of the endpoint: when
 * the server answers, link cards light up; until then it fails once, quietly,
 * and stops asking for the rest of the session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<(input: string) => Promise<Response>>();
vi.stubGlobal("fetch", (input: string) => fetchMock(input));

import { fetchUnfurl, __resetUnfurl } from "./unfurl";

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const status = (code: number) => Promise.resolve(new Response("", { status: code }));

beforeEach(() => {
  vi.clearAllMocks();
  __resetUnfurl();
});

describe("fetchUnfurl", () => {
  it("asks the proxy once per URL and returns the page's card fields", async () => {
    fetchMock.mockReturnValue(ok({ data: { title: "Liverpool F.C.", description: "Professional football club", image: "https://img/lfc.jpg", siteName: "Wikipedia" } }));
    const a = await fetchUnfurl("https://en.wikipedia.org/wiki/Liverpool_F.C.");
    expect(a).toEqual({ title: "Liverpool F.C.", description: "Professional football club", image: "https://img/lfc.jpg", siteName: "Wikipedia" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://test.local/api/unfurl?url=" + encodeURIComponent("https://en.wikipedia.org/wiki/Liverpool_F.C."));
    // Memoized: the same URL never asks twice.
    await fetchUnfurl("https://en.wikipedia.org/wiki/Liverpool_F.C.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tolerates a bare (unwrapped) body and missing fields", async () => {
    fetchMock.mockReturnValue(ok({ title: "Only a title" }));
    expect(await fetchUnfurl("https://x.test/a")).toEqual({ title: "Only a title", description: null, image: null, siteName: null });
  });

  it("a page with no usable metadata is null, not a card", async () => {
    fetchMock.mockReturnValue(ok({ data: {} }));
    expect(await fetchUnfurl("https://x.test/empty")).toBeNull();
  });

  it("stops asking for the session once the endpoint says it isn't there", async () => {
    fetchMock.mockReturnValue(status(404));
    expect(await fetchUnfurl("https://x.test/one")).toBeNull();
    expect(await fetchUnfurl("https://x.test/two")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a single failing page does not trip the breaker", async () => {
    fetchMock.mockReturnValueOnce(status(502)).mockReturnValueOnce(ok({ title: "Fine" }));
    expect(await fetchUnfurl("https://x.test/broken")).toBeNull();
    expect(await fetchUnfurl("https://x.test/fine")).toMatchObject({ title: "Fine" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
