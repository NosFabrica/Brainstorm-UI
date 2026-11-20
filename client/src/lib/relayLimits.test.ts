import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRelayLimitsCache, parseRelayLimits, relayInfoUrl, relayLimits } from "./relayLimits";

beforeEach(() => clearRelayLimitsCache());
afterEach(() => vi.unstubAllGlobals());

describe("relayInfoUrl", () => {
  it("reads wss as https and ws as http, keeping host and path", () => {
    expect(relayInfoUrl("wss://relay.example/nostr")).toBe("https://relay.example/nostr");
    expect(relayInfoUrl("ws://localhost:7777")).toBe("http://localhost:7777/");
    expect(relayInfoUrl("not a url")).toBeNull();
    expect(relayInfoUrl("ftp://x.example")).toBeNull();
  });
});

describe("parseRelayLimits", () => {
  it("reads the two limits and treats anything malformed as absent", () => {
    expect(parseRelayLimits({ limitation: { max_message_length: 131072, max_event_tags: 2000 } })).toEqual({
      maxMessageLength: 131072,
      maxEventTags: 2000,
    });
    expect(parseRelayLimits({ limitation: { max_message_length: "big", max_event_tags: -1 } })).toEqual({
      maxMessageLength: null,
      maxEventTags: null,
    });
    expect(parseRelayLimits(null)).toEqual({ maxMessageLength: null, maxEventTags: null });
    expect(parseRelayLimits({ name: "no limitation block" })).toEqual({ maxMessageLength: null, maxEventTags: null });
  });
});

describe("relayLimits", () => {
  it("asks each relay for its document, and a failing, slow or silent relay reads as no limits", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Accept).toBe("application/nostr+json");
      if (url.startsWith("https://a.example")) {
        return Promise.resolve(
          new Response(JSON.stringify({ limitation: { max_message_length: 65536, max_event_tags: 100 } })),
        );
      }
      if (url.startsWith("https://down.example")) return Promise.resolve(new Response("", { status: 502 }));
      if (url.startsWith("https://garbage.example")) return Promise.resolve(new Response("<html>"));
      // Never answers: only the timeout ends it.
      return new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError"))),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const limits = await relayLimits(
      ["wss://a.example", "wss://down.example", "wss://garbage.example", "wss://slow.example"],
      50,
    );
    expect(limits).toEqual([
      { maxMessageLength: 65536, maxEventTags: 100 },
      { maxMessageLength: null, maxEventTags: null },
      { maxMessageLength: null, maxEventTags: null },
      { maxMessageLength: null, maxEventTags: null },
    ]);
  });

  it("asks a relay once per session, failures included", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await relayLimits(["wss://r.example/"]);
    await relayLimits(["wss://r.example"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
