/**
 * What we publish, we hold: a successful publish lands in the EventStore, so a
 * store-first read in the same session sees our own write, not the copy it
 * loaded earlier.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

type Ok = { ok: boolean; from: string; message: string };
const publish = vi.fn(async (relays: string[]): Promise<Ok[]> =>
  relays.map((from) => ({ ok: true, from, message: "" })),
);
const relayPublish = vi.fn(async (url: string): Promise<Ok> => ({ ok: true, from: url, message: "" }));
const add = vi.fn((e: unknown) => e);

vi.mock("@/lib/relayPool", () => ({
  pool: {
    publish: (...a: unknown[]) => publish(...(a as [string[]])),
    relay: (url: string) => ({ publish: () => relayPublish(url) }),
  },
}));
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: () => undefined,
    getEvent: () => undefined,
    add: (e: unknown) => add(e),
  },
}));
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  loadReplaceable: async () => undefined,
}));
vi.mock("@/lib/relays", () => ({
  PROFILE_RELAYS: ["wss://one.example/", "wss://two.example/"],
  CONTENT_RELAYS: ["wss://one.example/"],
  SEARCH_RELAY: "wss://search.example/",
}));

import { publishToRelays } from "./nostr";
import { resetRelayRoutingCache } from "@/lib/relayRouting";

const signed = {
  id: "2".repeat(64),
  kind: 30078,
  pubkey: "a".repeat(64),
  created_at: 1,
  tags: [["d", "x"]],
  content: "{}",
  sig: "s",
} as NostrEvent;

const fail = (from: string): Ok => ({ ok: false, from, message: "blocked" });

beforeEach(() => {
  vi.clearAllMocks();
  resetRelayRoutingCache();
});

describe("publishToRelays holds what it published", () => {
  it("adds the event once a relay accepts it", async () => {
    expect((await publishToRelays(signed)).success).toBe(true);
    expect(add).toHaveBeenCalledWith(signed);
  });

  it("adds nothing when every relay refuses", async () => {
    publish.mockImplementationOnce(async (relays) => relays.map(fail));
    expect((await publishToRelays(signed)).success).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("adds nothing when the pool throws", async () => {
    publish.mockRejectedValueOnce(new Error("down"));
    expect((await publishToRelays(signed)).success).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("adds the event on the quorum path too", async () => {
    expect((await publishToRelays(signed, [], { need: 1, timeoutMs: 50 })).success).toBe(true);
    expect(add).toHaveBeenCalledWith(signed);
  });

  it("adds nothing when the quorum path gets no acceptance", async () => {
    relayPublish.mockImplementation(async (url) => fail(url));
    expect((await publishToRelays(signed, [], { need: 1, timeoutMs: 50 })).success).toBe(false);
    expect(add).not.toHaveBeenCalled();
    relayPublish.mockReset();
  });
});
