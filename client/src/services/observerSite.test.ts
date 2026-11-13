import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITIONS_PATH, INDEX_PATH, serializeEditions, sha256Text } from "@/lib/frontPage/observerSite";
import { withPaperCsp } from "@/lib/frontPage/validate";
import { clearRelayLimitsCache } from "@/lib/relayLimits";

const PK = "a".repeat(64);

const mocks = vi.hoisted(() => ({
  site: undefined as unknown,
  answered: ["wss://write.example"] as string[],
  servers: ["https://files.example"] as string[],
  blossomLookups: 0,
  signAs: vi.fn(),
  auth: vi.fn(),
  publish: vi.fn(),
  /** This device's copies, by hash. */
  held: new Map<string, string>(),
  /** Who is signed in now. */
  active: { pubkey: "a".repeat(64), name: "A" } as { pubkey: string; name: string } | undefined,
}));

vi.mock("@/lib/blobCache", () => ({
  readBlob: (sha: string) => Promise.resolve(mocks.held.get(sha) ?? null),
  writeBlob: (sha: string, text: string) => {
    mocks.held.set(sha, text);
    return Promise.resolve();
  },
}));

vi.mock("@/lib/relayRequest", async (orig) => ({
  ...(await orig<object>()),
  requestNewestWithReach: () =>
    Promise.resolve({ newest: mocks.site, reach: { asked: ["wss://write.example"], answered: mocks.answered } }),
}));
vi.mock("@/lib/relayRouting", () => ({
  outboxRelays: () => Promise.resolve(["wss://write.example"]),
  loadRelayList: () => Promise.resolve({ read: [], write: ["wss://write.example"] }),
}));
vi.mock("@/lib/blossomServers", async (orig) => ({
  ...(await orig<object>()),
  loadBlossomServers: () => {
    mocks.blossomLookups++;
    return Promise.resolve({ servers: mocks.servers, found: mocks.servers.length > 0 });
  },
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { add: vi.fn(), getReplaceable: () => undefined } }));
vi.mock("@/accounts/signing", () => ({
  activeAccount: () => mocks.active,
  signAs: (...args: unknown[]) => mocks.signAs(...args),
}));
vi.mock("@/services/blossom", async (orig) => ({
  ...(await orig<object>()),
  nostrAuthHeader: (...args: unknown[]) => mocks.auth(...args),
}));
vi.mock("@/services/nostr", () => ({ publishToRelays: (...args: unknown[]) => mocks.publish(...args) }));

import {
  fetchBlob,
  leadHeadline,
  loadObserverSite,
  loadRunnerSite,
  publishToObserver,
  PublishError,
} from "./observerSite";

const PAPER = `<!doctype html><html><body><header class="masthead"><h1>The Nostr Observer</h1></header><h2 class="lead-head">Twelve relays, one lesson</h2></body></html>`;
const NOV11 = Date.UTC(2026, 10, 11, 9, 0);

let blobs: Map<string, string>;
let puts: { url: string; body: string }[];

beforeEach(() => {
  clearRelayLimitsCache();
  mocks.site = undefined;
  mocks.answered = ["wss://write.example"];
  mocks.servers = ["https://files.example"];
  mocks.blossomLookups = 0;
  mocks.held.clear();
  mocks.active = { pubkey: PK, name: "A" };
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
  it("first publish: three files, one upload token each, /index.html is today's paper", async () => {
    const out = await publishToObserver(input);
    expect(mocks.auth).toHaveBeenCalledTimes(3);
    for (const call of mocks.auth.mock.calls) {
      expect((call[0].tags as string[][]).filter((t) => t[0] === "x")).toHaveLength(1);
    }
    expect(puts).toHaveLength(3);
    expect(mocks.blossomLookups).toBe(1);
    expect(out.servers).toEqual(["https://files.example"]);

    const manifest = mocks.signAs.mock.calls[0][1];
    expect(manifest.kind).toBe(35128);
    // The published copy carries the app's CSP, so its hash is of that copy.
    const today = await sha256Text(withPaperCsp(PAPER));
    expect(blobs.get(today)).toContain("Content-Security-Policy");
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

  it("uploads nowhere the reader didn't choose: no Blossom server list, no publish", async () => {
    mocks.servers = [];
    const failure = await publishToObserver(input).catch((e) => e);
    expect(failure).toBeInstanceOf(PublishError);
    expect(failure.reason).toBe("no-servers");
    expect(puts).toHaveLength(0);
    expect(mocks.signAs).not.toHaveBeenCalled();
  });

  it("writes nothing when none of the reader's relays answered the read", async () => {
    mocks.answered = [];
    const failure = await publishToObserver(input).catch((e) => e);
    expect(failure.reason).toBe("unreadable");
    expect(puts).toHaveLength(0);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("mirrors to every server in parallel, best effort beyond the first that takes each file", async () => {
    mocks.servers = ["https://down.example", "https://files.example"];
    const real = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        url.startsWith("https://down.example") ? new Response("", { status: 503 }) : real(url, init),
      ),
    );
    const out = await publishToObserver(input);
    expect(out.servers).toEqual(["https://files.example", "https://down.example"]);
    expect(mocks.signAs.mock.calls[0][1].tags.filter((t: string[]) => t[0] === "server")).toEqual([
      ["server", "https://files.example"],
      ["server", "https://down.example"],
    ]);
  });

  it("keeps days the dated paths serve that editions.json missed, and never lets a future day lead", async () => {
    const json = serializeEditions({
      v: 1,
      title: "Lira's Observer",
      editions: [{ day: "2026-11-10", path: "/2026-11-10.html", sha256: "1".repeat(64), headline: "Yesterday" }],
    });
    const jsonHash = await sha256Text(json);
    blobs.set(jsonHash, json);
    mocks.site = {
      kind: 35128,
      pubkey: PK,
      created_at: 1,
      tags: [
        ["d", "observer"],
        ["path", "/2026-11-10.html", "1".repeat(64)],
        ["path", "/2026-11-09.html", "9".repeat(64)],
        ["path", "/2099-01-01.html", "7".repeat(64)],
        ["path", "/2026-02-30.html", "8".repeat(64)],
        ["path", EDITIONS_PATH, jsonHash],
      ],
    };
    const out = await publishToObserver({ ...input, printedAt: Date.now() });
    const days = out.editions.map((e) => e.day);
    expect(days).toContain("2026-11-09");
    expect(days).not.toContain("2026-02-30");
    expect(out.editions.find((e) => e.day === "2026-11-10")?.headline).toBe("Yesterday");
    const manifest = mocks.signAs.mock.calls[0][1];
    const today = await sha256Text(withPaperCsp(PAPER));
    expect(manifest.tags).toContainEqual(["path", INDEX_PATH, today]);
  });

  it("rolls off to the tag limit a write relay publishes in its NIP-11 document", async () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    mocks.site = {
      kind: 35128,
      pubkey: PK,
      created_at: 1,
      tags: [["d", "observer"], ...days.map((d) => ["path", `/${d}.html`, "1".repeat(64)])],
    };
    const real = globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        url.startsWith("https://write.example") && !init?.method
          ? new Response(JSON.stringify({ limitation: { max_event_tags: 16 } }))
          : real(url, init),
      ),
    );
    await publishToObserver(input);
    const manifest = mocks.signAs.mock.calls[0][1];
    // signAs adds one client tag, so the manifest it is handed leaves room for it.
    expect(manifest.tags.length).toBeLessThanOrEqual(15);
    expect(
      manifest.tags.filter((t: string[]) => /^\/\d{4}-\d{2}-\d{2}\.html$/.test(t[1] ?? "")).length,
    ).toBeGreaterThan(0);
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

describe("loadRunnerSite", () => {
  const RUNNER = "b".repeat(64);
  const runnerSite = async (over: Record<string, unknown> = {}) => {
    const json = serializeEditions({
      v: 1,
      title: "Lira's Observer",
      editions: [{ day: "2026-11-12", path: "/2026-11-12.html", sha256: "3".repeat(64), printedAt: 1794480000 }],
    });
    const hash = await sha256Text(json);
    blobs.set(hash, json);
    return {
      kind: 35128,
      pubkey: RUNNER,
      created_at: 1,
      tags: [
        ["d", "observer"],
        ["p", PK],
        ["path", "/2026-11-12.html", "3".repeat(64)],
        ["path", EDITIONS_PATH, hash],
      ],
      ...over,
    };
  };

  it("reads the Assistant's site for this reader, its files on the reader's servers", async () => {
    mocks.site = await runnerSite();
    const site = await loadRunnerSite(RUNNER, PK);
    expect(site.event).not.toBeNull();
    expect(site.index.editions.map((e) => [e.day, e.printedAt])).toEqual([["2026-11-12", 1794480000]]);
    expect(site.servers).toEqual(["https://files.example"]);
  });

  it("ignores a site by another key, or one that doesn't tag this reader", async () => {
    mocks.site = await runnerSite({ pubkey: "c".repeat(64) });
    expect((await loadRunnerSite(RUNNER, PK)).event).toBeNull();
    mocks.site = await runnerSite({
      tags: [
        ["d", "observer"],
        ["p", "d".repeat(64)],
      ],
    });
    expect((await loadRunnerSite(RUNNER, PK)).index.editions).toEqual([]);
    mocks.site = await runnerSite({ tags: [["d", "observer"]] });
    expect((await loadRunnerSite(RUNNER, PK)).event).toBeNull();
  });
});

describe("fetchBlob", () => {
  it("hashes the bytes as served, and compares in lower case", async () => {
    const text = "<p>caf\u00e9</p>";
    const hash = await sha256Text(text);
    blobs.set(hash, text);
    expect(await fetchBlob(hash.toUpperCase(), ["https://files.example"])).toBe(text);
    // Bytes that aren't valid UTF-8 can't decode to the same string another file has.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([0xff, 0xfe]), { status: 200 })),
    );
    const bad = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([0xff, 0xfe]))), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    expect(await fetchBlob(bad, ["https://files.example"])).toBeNull();
  });
});

describe("fetchBlob, from this device and in parallel", () => {
  it("answers from this device's copy without asking a server", async () => {
    mocks.held.set("3".repeat(64), "<p>held</p>");
    expect(await fetchBlob("3".repeat(64), ["https://files.example"])).toBe("<p>held</p>");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps what a server served, for next time", async () => {
    const text = "<p>kept</p>";
    const hash = await sha256Text(text);
    blobs.set(hash, text);
    await fetchBlob(hash, ["https://files.example"]);
    expect(mocks.held.get(hash)).toBe(text);
  });

  it("isn't held up by a server that hangs: the others are asked at once", async () => {
    const text = "<p>fast</p>";
    const hash = await sha256Text(text);
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        asked.push(url);
        if (url.startsWith("https://slow.example")) {
          return new Promise((_, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
          );
        }
        return Promise.resolve(new Response(text, { status: 200 }));
      }),
    );
    expect(await fetchBlob(hash, ["https://slow.example", "https://fast.example"])).toBe(text);
    expect(asked).toEqual([`https://slow.example/${hash}`, `https://fast.example/${hash}`]);
  });

  it("gives a hanging server its own deadline, and answers null when none serves it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
      ),
    );
    expect(await fetchBlob("4".repeat(64), ["https://slow.example"], { timeoutMs: 10 })).toBeNull();
  });
});

describe("publishing keeps the uploaded files on this device", () => {
  it("holds the paper and the site's index by their hashes", async () => {
    const out = await publishToObserver({ pubkey: PK, html: PAPER, name: "Lira", printedAt: NOV11 });
    const html = withPaperCsp(PAPER);
    expect(mocks.held.get(await sha256Text(html))).toBe(html);
    expect(out.editions).toHaveLength(1);
    const index = [...mocks.held.values()].find((t) => t.startsWith("{"));
    expect(index && JSON.parse(index).editions).toHaveLength(1);
  });
});

describe("leadHeadline", () => {
  it("takes the brief's lead headline, never the masthead", () => {
    expect(leadHeadline(PAPER)).toBe("Twelve relays, one lesson");
    expect(leadHeadline(`<header class="masthead"><h1>Paper</h1></header><h2>Plain lead</h2>`)).toBe("Plain lead");
    expect(leadHeadline("<p>nothing</p>")).toBeNull();
  });
});

describe("publishing as the account it started for (audit, 2026-11-12)", () => {
  it("signs every upload token with that account, even when another signs in meanwhile", async () => {
    const started = mocks.active;
    mocks.auth.mockImplementation(async () => {
      // Account B signs in while the first token is out.
      mocks.active = { pubkey: "b".repeat(64), name: "B" };
      return "Nostr x";
    });
    await publishToObserver(input);
    expect(mocks.auth).toHaveBeenCalledTimes(3);
    for (const call of mocks.auth.mock.calls) expect(call[1]).toBe(started);
    expect(mocks.signAs.mock.calls[0][0]).toBe(started);
  });

  it("stops, publishing nothing, once its signal aborts", async () => {
    const controller = new AbortController();
    mocks.auth.mockImplementation(async () => {
      controller.abort();
      return "Nostr x";
    });
    await expect(publishToObserver({ ...input, signal: controller.signal })).rejects.toThrow();
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(puts).toHaveLength(0);
    expect(mocks.signAs).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
