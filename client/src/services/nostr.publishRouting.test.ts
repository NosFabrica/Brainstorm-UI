/**
 * Where a publish actually goes.
 *
 * `publishToRelays` used to take a `relays` argument and ignore it, and it
 * resolved the author's outbox from a store nothing ever filled — so in
 * practice every event this app signed went to the same five hardcoded relays,
 * and nothing it published ever reached the people it named.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const publish = vi.fn(async (relays: string[]) => relays.map((from) => ({ ok: true, from, message: "" })));
const held = new Map<string, NostrEvent>();
const loadReplaceableMock = vi.fn(async () => undefined as NostrEvent | undefined);

vi.mock("@/lib/relayPool", () => ({ pool: { publish: (...a: unknown[]) => publish(...(a as [string[]])) } }));
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getReplaceable: (kind: number, pubkey: string) => held.get(`${kind}:${pubkey}`),
    getEvent: () => undefined,
    add: (e: unknown) => e,
  },
}));
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  loadReplaceable: () => loadReplaceableMock(),
}));
vi.mock("@/lib/relays", () => ({
  PROFILE_RELAYS: ["wss://default.one/"],
  CONTENT_RELAYS: ["wss://default.one/"],
}));

import { publishRelaysFor, publishToRelays } from "./nostr";
import { resetRelayRoutingCache } from "@/lib/relayRouting";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);

const relayList = (pubkey: string, tags: string[][]): NostrEvent =>
  ({ id: "1".repeat(64), kind: 10002, pubkey, created_at: 1, tags, content: "", sig: "s" }) as NostrEvent;

const event = (kind: number, tags: string[][] = []): NostrEvent =>
  ({ id: "2".repeat(64), kind, pubkey: ME, created_at: 1, tags, content: "", sig: "s" }) as NostrEvent;

const seed = (e: NostrEvent) => held.set(`${e.kind}:${e.pubkey}`, e);

beforeEach(() => {
  vi.clearAllMocks();
  held.clear();
  resetRelayRoutingCache();
  loadReplaceableMock.mockResolvedValue(undefined);
});

describe("routing a publish", () => {
  it("sends to the author's own write relays, not only to ours", async () => {
    seed(relayList(ME, [["r", "wss://mine.example", "write"]]));

    expect(await publishRelaysFor(event(1))).toEqual(["wss://mine.example/", "wss://default.one/"]);
  });

  /**
   * The inbox half. A vouch, an RSVP, a report or a reply that lands only on the
   * author's relays never reaches the person it is about — they read elsewhere,
   * which is the entire reason they published a relay list.
   */
  it("also sends to the READ relays of everyone the event names", async () => {
    seed(relayList(THEM, [["r", "wss://their-out.example", "write"], ["r", "wss://their-in.example", "read"]]));

    const relays = await publishRelaysFor(event(1, [["p", THEM]]));

    expect(relays).toContain("wss://their-in.example/");
    expect(relays).not.toContain("wss://their-out.example/");
  });

  /** A kind-3 names everyone you follow and is addressed to none of them. */
  it("does not broadcast a follow list to every inbox it lists", async () => {
    seed(relayList(THEM, [["r", "wss://their-in.example", "read"]]));

    expect(await publishRelaysFor(event(3, [["p", THEM]]))).not.toContain("wss://their-in.example/");
  });

  /**
   * A report is a claim ABOUT someone, not a message TO them. An inbox you can
   * write to with an accusation is a harassment vector, so reports and disputed
   * tags stay on the author's own relays.
   */
  it("does not deliver a report or a tag assertion to its subject", async () => {
    seed(relayList(THEM, [["r", "wss://their-in.example", "read"]]));

    for (const kind of [1984, 9999, 39999]) {
      expect(await publishRelaysFor(event(kind, [["p", THEM]]))).not.toContain("wss://their-in.example/");
    }
  });

  /** A vouch, by contrast, is something its subject would want to hear about. */
  it("does deliver a vouch to the person vouched for", async () => {
    seed(relayList(THEM, [["r", "wss://their-in.example", "read"]]));

    expect(await publishRelaysFor(event(31871, [["p", THEM]]))).toContain("wss://their-in.example/");
  });

  it("never routes back to the author's own inbox for naming themself", async () => {
    seed(relayList(ME, [["r", "wss://my-in.example", "read"], ["r", "wss://my-out.example", "write"]]));

    expect(await publishRelaysFor(event(1, [["p", ME]]))).not.toContain("wss://my-in.example/");
  });

  /** This argument used to be silently discarded, which is why `services/tags`
   *  had to hand-roll `pool.publish` to reach the tag hub at all. */
  it("unions the caller's extra relays instead of ignoring them", async () => {
    await publishToRelays(event(1), ["wss://hub.example"]);

    expect(publish.mock.calls[0][0]).toContain("wss://hub.example/");
  });

  it("does not open two sockets for two spellings of one relay", async () => {
    seed(relayList(ME, [["r", "wss://default.one"]]));

    expect(await publishRelaysFor(event(1))).toHaveLength(1);
  });

  it("still publishes somewhere when the routing lookup fails outright", async () => {
    loadReplaceableMock.mockRejectedValue(new Error("relays down"));

    expect(await publishRelaysFor(event(1, [["p", THEM]]))).toEqual(["wss://default.one/"]);
  });

  it("reports how broadly it landed, not just that one relay said ok", async () => {
    seed(relayList(ME, [["r", "wss://mine.example"]]));
    publish.mockResolvedValueOnce([
      { ok: true, from: "wss://mine.example/", message: "" },
      { ok: false, from: "wss://default.one/", message: "rate-limited" },
    ]);

    expect(await publishToRelays(event(1))).toMatchObject({ success: true, accepted: 1, total: 2 });
  });
});
