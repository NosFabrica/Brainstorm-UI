// @vitest-environment jsdom
/**
 * Link metadata for plain URLs — the browser can't read another site's title
 * or description (CORS), so this asks our own origin, which nginx proxies to
 * the link-preview service.
 *
 * Same-origin is the part worth pinning: the service reads `Sec-Fetch-Site`
 * to pick a rate-limit tier, so asking the API host instead would put our own
 * SPA in the tight one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", (input: string, init?: RequestInit) => fetchMock(input, init));

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
    expect(a).toEqual({ kind: "page", title: "Liverpool F.C.", description: "Professional football club", image: "https://img/lfc.jpg", siteName: "Wikipedia" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Memoized: the same URL never asks twice.
    await fetchUnfurl("https://en.wikipedia.org/wiki/Liverpool_F.C.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks our own origin, not the API host, so the request counts as same-origin", async () => {
    fetchMock.mockReturnValue(ok({ data: { title: "x" } }));
    await fetchUnfurl("https://en.wikipedia.org/wiki/Liverpool_F.C.");
    const asked = fetchMock.mock.calls[0][0];
    expect(asked).toBe("/link-preview?url=" + encodeURIComponent("https://en.wikipedia.org/wiki/Liverpool_F.C."));
    // A relative path is what keeps it same-origin; an absolute one to the API
    // host would land the SPA in the untrusted rate-limit tier.
    expect(asked.startsWith("http")).toBe(false);
  });

  it("gives up rather than hanging when the proxy never answers", async () => {
    fetchMock.mockReturnValue(ok({ data: { title: "x" } }));
    await fetchUnfurl("https://x.test/a");
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("tolerates a bare (unwrapped) body and missing fields", async () => {
    fetchMock.mockReturnValue(ok({ title: "Only a title" }));
    expect(await fetchUnfurl("https://x.test/a")).toEqual({ kind: "page", title: "Only a title", description: null, image: null, siteName: null });
  });

  it("passes through an image link the proxy recognised", async () => {
    fetchMock.mockReturnValue(ok({ data: { kind: "image", image: "https://m.test/19886", title: null } }));
    expect(await fetchUnfurl("https://m.test/19886")).toMatchObject({ kind: "image", image: "https://m.test/19886" });
  });

  it("a video answer is kept even with no title, since the clip is the content", async () => {
    fetchMock.mockReturnValue(ok({ data: { kind: "video", url: "https://cdn.test/v/1" } }));
    expect(await fetchUnfurl("https://cdn.test/v/1")).toMatchObject({ kind: "video" });
  });

  it("a page with no usable metadata is null, not a card", async () => {
    fetchMock.mockReturnValue(ok({ data: {} }));
    expect(await fetchUnfurl("https://x.test/empty")).toBeNull();
  });

  it("one failing page does not stop the next from being asked", async () => {
    // The endpoint exists now, so a 404 is this page's answer, not evidence the
    // proxy is missing. An earlier version opened a session-wide breaker here,
    // which turned one bad link into no cards at all for the rest of the visit.
    fetchMock.mockReturnValueOnce(status(404)).mockReturnValueOnce(ok({ title: "Fine" }));
    expect(await fetchUnfurl("https://x.test/one")).toBeNull();
    expect(await fetchUnfurl("https://x.test/two")).toMatchObject({ title: "Fine" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never opens more than four sockets at once", async () => {
    let peak = 0;
    let open = 0;
    fetchMock.mockImplementation(() => {
      open += 1;
      peak = Math.max(peak, open);
      return new Promise((resolve) =>
        setTimeout(() => {
          open -= 1;
          resolve(new Response(JSON.stringify({ data: { title: "t" } }), { status: 200 }));
        }, 5),
      );
    });
    await Promise.all(Array.from({ length: 20 }, (_, i) => fetchUnfurl(`https://x.test/${i}`)));
    expect(peak).toBeLessThanOrEqual(4);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});
