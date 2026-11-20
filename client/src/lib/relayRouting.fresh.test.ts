/**
 * The relay list a quorum is counted over is read fresh: a copy held from before the
 * reader added a relay would count it short, and a lookup nobody answered is not "no list"
 * (audit, 2026-11-12).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const held = new Map<string, NostrEvent>();
const requestNewestWithReach = vi.fn();

vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (kind: number, pubkey: string) => held.get(`${kind}:${pubkey}`) },
}));
vi.mock("./eventCache", () => ({ whenHydrated: () => Promise.resolve() }));
vi.mock("@/lib/loaders", () => ({ loadReplaceable: vi.fn(async () => undefined) }));
vi.mock("@/lib/relays", () => ({
  PROFILE_RELAYS: ["wss://default.one/", "wss://default.two/", "wss://default.three/"],
  CONTENT_RELAYS: ["wss://default.one/"],
}));
vi.mock("./relayRequest", async (original) => ({
  ...(await original<typeof import("./relayRequest")>()),
  requestNewestWithReach: (...args: unknown[]) => requestNewestWithReach(...args),
}));

import { loadFreshRelayList } from "./relayRouting";

const ALICE = "a".repeat(64);
const list = (createdAt: number, relays: string[]): NostrEvent =>
  ({
    id: String(createdAt).padStart(64, "0"),
    kind: 10002,
    pubkey: ALICE,
    created_at: createdAt,
    tags: relays.map((r) => ["r", r, "write"]),
    content: "",
    sig: "s",
  }) as NostrEvent;
const reach = (answered: number) => (asked: string[]) => ({ asked, answered: asked.slice(0, answered) });

beforeEach(() => {
  held.clear();
  requestNewestWithReach.mockReset();
});

describe("a fresh read of the relay list", () => {
  it("counts the write relays of the newest copy, not an older held one", async () => {
    held.set(`10002:${ALICE}`, list(100, ["wss://w0/"]));
    requestNewestWithReach.mockImplementation(async (asked: string[]) => ({
      newest: list(200, ["wss://w0/", "wss://w1/", "wss://w2/"]),
      reach: reach(asked.length)(asked),
      sentBy: {},
    }));
    const read = await loadFreshRelayList(ALICE);
    expect(read).toMatchObject({ status: "found" });
    expect(read.status === "found" && read.list.write).toEqual(["wss://w0/", "wss://w1/", "wss://w2/"]);
    // Asked where a list is looked up, and where the held one says they write.
    expect(requestNewestWithReach.mock.calls[0][0]).toContain("wss://w0/");
    expect(requestNewestWithReach.mock.calls[0][0]).toContain("wss://default.one/");
  });

  it("says nobody could tell when too few relays answered and nothing is held", async () => {
    requestNewestWithReach.mockImplementation(async (asked: string[]) => ({
      newest: undefined,
      reach: reach(1)(asked),
      sentBy: {},
    }));
    expect(await loadFreshRelayList(ALICE)).toEqual({ status: "unavailable" });
  });

  it("says there is none only when most of them answered without one", async () => {
    requestNewestWithReach.mockImplementation(async (asked: string[]) => ({
      newest: undefined,
      reach: reach(2)(asked),
      sentBy: {},
    }));
    expect(await loadFreshRelayList(ALICE)).toEqual({ status: "none" });
  });

  it("falls back to the held copy when no relay answered", async () => {
    held.set(`10002:${ALICE}`, list(100, ["wss://w0/"]));
    requestNewestWithReach.mockImplementation(async (asked: string[]) => ({
      newest: undefined,
      reach: reach(0)(asked),
      sentBy: {},
    }));
    const read = await loadFreshRelayList(ALICE);
    expect(read.status === "found" && read.list.write).toEqual(["wss://w0/"]);
  });
});
