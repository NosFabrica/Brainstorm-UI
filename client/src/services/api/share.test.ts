// @vitest-environment jsdom
/** Short links on the wire: an entity in, a code and its full path out. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/services/api";

const HEX = "f4d1866e8599563c52ceeedf11c28b8567e465c6e9a91df92add535d57f02ab0";
const NPUB = "npub17ngcvm59n9trc5kwam03rs5ts4n7gewxax53m7f2m4f464ls92cqr5qjta";

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, data?: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data }), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createShortUrl", () => {
  it("mints a code for an entity and reads back the code and full path", async () => {
    const fetchMock = respond(200, {
      shortCode: "AB3XK9QZ",
      kind: "profile",
      key: HEX,
      relays: [],
      path: `/p/${NPUB}`,
    });

    const link = await apiClient.createShortUrl({ kind: "profile", key: HEX, relays: ["wss://relay.example"] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/shorturl$/);
    expect(JSON.parse(init.body as string)).toEqual({ kind: "profile", key: HEX, relays: ["wss://relay.example"] });
    expect(link).toEqual({ shortCode: "AB3XK9QZ", kind: "profile", key: HEX, relays: [], path: `/p/${NPUB}` });
  });

  it("leaves relays out of the request when the caller has none", async () => {
    const fetchMock = respond(200, {
      shortCode: "AB3XK9QZ",
      kind: "hashtag",
      key: "nostr",
      relays: [],
      path: "/t/nostr",
    });

    await apiClient.createShortUrl({ kind: "hashtag", key: "nostr" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ kind: "hashtag", key: "nostr" });
  });

  it("fails with the status on a rejected mint", async () => {
    respond(429);

    await expect(apiClient.createShortUrl({ kind: "profile", key: HEX })).rejects.toMatchObject({ status: 429 });
  });
});

describe("resolveShortUrl", () => {
  it("reads back the entity and the path to continue to", async () => {
    respond(200, { kind: "event", key: "e".repeat(64), relays: ["wss://relay.example"], path: "/e/nevent1abc" });

    const resolved = await apiClient.resolveShortUrl("AB3XK9QZ");

    expect(resolved).toEqual({
      kind: "event",
      key: "e".repeat(64),
      relays: ["wss://relay.example"],
      path: "/e/nevent1abc",
    });
  });

  it("fails with 404 for an unknown code", async () => {
    respond(404);

    await expect(apiClient.resolveShortUrl("NOPE")).rejects.toMatchObject({ status: 404 });
  });
});
