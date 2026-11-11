import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITIONS_PATH, INDEX_PATH, serializeEditions, sha256Text } from "@/lib/frontPage/observerSite";

const PK = "a".repeat(64);

const mocks = vi.hoisted(() => ({
  site: undefined as unknown,
  servers: ["https://files.example"] as string[],
  signAs: vi.fn(),
  auth: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/loaders", () => ({ loadReplaceable: () => Promise.resolve(mocks.site) }));
vi.mock("@/lib/relayRouting", () => ({ outboxRelays: () => Promise.resolve(["wss://write.example"]) }));
vi.mock("@/lib/blossomServers", async (orig) => ({
  ...(await orig<object>()),
  loadBlossomServers: () => Promise.resolve({ servers: mocks.servers, found: true }),
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: vi.fn(), getReplaceable: () => undefined } }));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: PK }),
  signAs: (...args: unknown[]) => mocks.signAs(...args),
}));
vi.mock("@/services/blossom", async (orig) => ({
  ...(await orig<object>()),
  nostrAuthHeader: (...args: unknown[]) => mocks.auth(...args),
}));
vi.mock("@/services/nostr", () => ({ publishToRelays: (...args: unknown[]) => mocks.publish(...args) }));

import { leadHeadline, loadObserverSite, publishToObserver, PublishError } from "./observerSite";

const PAPER = `<!doctype html><html><body><header class="masthead"><h1>The Nostr Observer</h1></header><h2 class="lead-head">Twelve relays, one lesson</h2></body></html>`;
const NOV11 = Date.UTC(2026, 10, 11, 9, 0);

let blobs: Map<string, string>;
let puts: { url: string; body: string }[];

beforeEach(() => {
  mocks.site = undefined;
  mocks.servers = ["https://files.example"];
  mocks.signAs
    .mockReset()
    .mockImplementation((_a, t) => Promise.resolve({ ...t, id: "e".repeat(64), pubkey: PK, sig: "s" }));
  mocks.auth.mockReset().mockResolvedValue("Nostr x");
  mocks.publish.mockReset().mockResolvedValue({ success: true });
  blobs = new Map();
  puts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = await (init.body as Blob).text();
        const sha256 = await sha256Text(body);
        puts.push({ url, body });
        blobs.set(sha256, body);
        return new Response(JSON.stringify({ sha256, url: `${url}/${sha256}` }), { status: 200 });
      }
      const hash = url.split("/").pop()!;
      const body = blobs.get(hash);
      return body === undefined ? new Response("", { status: 404 }) : new Response(body, { status: 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const input = {
  pubkey: PK,
  html: PAPER,
  name: "Lira",
  printedAt: NOV11,
  headline: "Twelve relays, one lesson",
  code: "D35280",
  posts: 412,
  quotesVerified: 3,
};

describe("publishToObserver", () => {
  it("first publish: three files under one upload signature, /index.html is today's paper", async () => {
    const out = await publishToObserver(input);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    const authTags = mocks.auth.mock.calls[0][0].tags as string[][];
    expect(authTags.filter((t) => t[0] === "x")).toHaveLength(3);
    expect(puts).toHaveLength(3);

    const manifest = mocks.signAs.mock.calls[0][1];
    expect(manifest.kind).toBe(35128);
    const today = await sha256Text(PAPER);
    expect(manifest.tags).toContainEqual(["path", INDEX_PATH, today]);
    expect(manifest.tags).toContainEqual(["path", "/2026-11-11.html", today]);
    expect(manifest.tags).toContainEqual(["title", "Lira's Observer"]);
    expect(manifest.tags).toContainEqual(["server", "https://files.example"]);
    expect(manifest.tags.find((t: string[]) => t[0] === "x")?.[2]).toBe("aggregate");
    expect(out.editions.map((e) => e.day)).toEqual(["2026-11-11"]);
    expect(out.url).toMatch(/observer\.nsite\.lol$/);

    const json = manifest.tags.find((t: string[]) => t[1] === EDITIONS_PATH)[2];
    expect(JSON.parse(blobs.get(json)!).editions[0]).toMatchObject({
      day: "2026-11-11",
      headline: "Twelve relays, one lesson",
      posts: 412,
    });
  });

  it("builds on the site there is: keeps earlier days, and stamps after the copy it read", async () => {
    const earlier = {
      v: 1 as const,
      title: "Lira's Observer",
      editions: [{ day: "2026-11-10", path: "/2026-11-10.html", sha256: "1".repeat(64), headline: "Yesterday" }],
    };
    const json = serializeEditions(earlier);
    const jsonHash = await sha256Text(json);
    blobs.set(jsonHash, json);
    const future = Math.floor(Date.now() / 1000) + 3600;
    mocks.site = {
      kind: 35128,
      pubkey: PK,
      created_at: future,
      tags: [
        ["d", "observer"],
        ["path", "/2026-11-10.html", "1".repeat(64)],
        ["path", EDITIONS_PATH, jsonHash],
        ["server", "https://files.example"],
      ],
    };
    const out = await publishToObserver(input);
    expect(out.editions.map((e) => e.day)).toEqual(["2026-11-11", "2026-11-10"]);
    expect(out.editions[1].headline).toBe("Yesterday");
    expect(mocks.signAs.mock.calls[0][1].created_at).toBe(future + 1);
  });

  it("rebuilds from the path tags when editions.json comes back with the wrong bytes", async () => {
    mocks.site = {
      kind: 35128,
      pubkey: PK,
      created_at: 1,
      tags: [
        ["d", "observer"],
        ["path", "/2026-11-09.html", "9".repeat(64)],
        ["path", EDITIONS_PATH, "f".repeat(64)],
      ],
    };
    blobs.set("f".repeat(64), "tampered");
    const out = await publishToObserver(input);
    expect(out.editions.map((e) => e.day)).toEqual(["2026-11-11", "2026-11-09"]);
  });

  it("publishes nothing when no server takes the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    await expect(publishToObserver(input)).rejects.toBeInstanceOf(PublishError);
    expect(mocks.signAs).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe("loadObserverSite", () => {
  it("lists only the days the manifest still serves", async () => {
    const json = serializeEditions({
      v: 1,
      title: "T",
      editions: [
        { day: "2026-11-11", path: "/2026-11-11.html", sha256: "2".repeat(64) },
        { day: "2026-11-10", path: "/2026-11-10.html", sha256: "1".repeat(64) },
      ],
    });
    const hash = await sha256Text(json);
    blobs.set(hash, json);
    mocks.site = {
      kind: 35128,
      pubkey: PK,
      created_at: 1,
      tags: [
        ["path", "/2026-11-11.html", "2".repeat(64)],
        ["path", EDITIONS_PATH, hash],
      ],
    };
    const site = await loadObserverSite(PK);
    expect(site.index.editions.map((e) => e.day)).toEqual(["2026-11-11"]);
  });

  it("is empty for a reader with no site yet", async () => {
    const site = await loadObserverSite(PK);
    expect(site.event).toBeNull();
    expect(site.index.editions).toEqual([]);
  });
});

describe("leadHeadline", () => {
  it("takes the brief's lead headline, never the masthead", () => {
    expect(leadHeadline(PAPER)).toBe("Twelve relays, one lesson");
    expect(leadHeadline(`<header class="masthead"><h1>Paper</h1></header><h2>Plain lead</h2>`)).toBe("Plain lead");
    expect(leadHeadline("<p>nothing</p>")).toBeNull();
  });
});
