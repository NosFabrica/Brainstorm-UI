/**
 * The outbox model's two halves, which this app had neither of in practice:
 * READ an author from the relays they write to, and SEND to the relays the
 * people you name read from.
 *
 * Before this module existed the routing was a synchronous peek at the event
 * store that nothing ever filled, so every read and every publish quietly used
 * the same five hardcoded relays.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const held = new Map<string, NostrEvent>();
const loadReplaceableMock = vi.fn(async (_kind: number, _pubkey: string) => undefined as NostrEvent | undefined);

vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (kind: number, pubkey: string) => held.get(`${kind}:${pubkey}`) },
}));
vi.mock("@/lib/loaders", () => ({
  loadReplaceable: (...args: unknown[]) => loadReplaceableMock(...(args as [number, string])),
}));
vi.mock("@/lib/relays", () => ({
  PROFILE_RELAYS: ["wss://default.one/", "wss://default.two/"],
  CONTENT_RELAYS: ["wss://default.one/"],
}));

import {
  dedupeRelays,
  inboxRelays,
  loadRelayList,
  normalizeRelayUrl,
  outboxRelays,
  outboxRelaysFromDb,
  parseRelayList,
  relayHintFor,
  resetRelayRoutingCache,
  MAX_RELAYS_PER_AUTHOR,
} from "./relayRouting";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);

const relayList = (pubkey: string, tags: string[][]): NostrEvent =>
  ({ id: "1".repeat(64), kind: 10002, pubkey, created_at: 1, tags, content: "", sig: "s" }) as NostrEvent;

const seed = (event: NostrEvent) => held.set(`${event.kind}:${event.pubkey}`, event);

beforeEach(() => {
  vi.clearAllMocks();
  held.clear();
  resetRelayRoutingCache();
  loadReplaceableMock.mockResolvedValue(undefined);
});

describe("reading a relay list", () => {
  it("splits read from write, and counts an unmarked relay as both", () => {
    const list = parseRelayList(
      relayList(ALICE, [
        ["r", "wss://both.example"],
        ["r", "wss://out.example", "write"],
        ["r", "wss://in.example", "read"],
      ]),
    );

    expect(list.write).toEqual(["wss://both.example", "wss://out.example"]);
    expect(list.read).toEqual(["wss://both.example", "wss://in.example"]);
  });

  /** A marker we don't recognise is a typo, and a typo must not drop a relay. */
  it("treats an unknown marker as no marker", () => {
    const list = parseRelayList(relayList(ALICE, [["r", "wss://a.example", "wrtie"]]));

    expect(list.write).toEqual(["wss://a.example"]);
    expect(list.read).toEqual(["wss://a.example"]);
  });

  it("ignores anything that isn't a relay URL", () => {
    const list = parseRelayList(
      relayList(ALICE, [["r", "https://not-a-relay.example"], ["r", ""], ["p", "wss://wrong.tag"]]),
    );

    expect(list).toEqual({ write: [], read: [] });
  });

  it("is empty for an event of the wrong kind", () => {
    expect(parseRelayList({ ...relayList(ALICE, [["r", "wss://a.example"]]), kind: 10050 })).toEqual({
      write: [],
      read: [],
    });
  });
});

describe("one relay, spelled two ways", () => {
  it("collapses a trailing slash and a capitalised host", () => {
    expect(dedupeRelays(["wss://Nos.lol/", "wss://nos.lol", "wss://other.example"])).toEqual([
      "wss://Nos.lol/",
      "wss://other.example",
    ]);
  });

  /** The pool normalizes before it dials, so rewriting the caller's strings
   *  would be churn. Only the DUPLICATE has to go. */
  it("keeps the form it was given", () => {
    expect(dedupeRelays(["wss://default.one/"])).toEqual(["wss://default.one/"]);
  });

  it("refuses anything that isn't a websocket URL", () => {
    expect(normalizeRelayUrl("https://relay.example")).toBeNull();
    expect(normalizeRelayUrl("relay.example")).toBeNull();
    expect(normalizeRelayUrl("")).toBeNull();
  });
});

describe("where to read an author's events", () => {
  it("puts their write relays ahead of our defaults", async () => {
    seed(relayList(ALICE, [["r", "wss://alice.example", "write"], ["r", "wss://alice-in.example", "read"]]));

    const relays = await outboxRelays(ALICE);

    expect(relays[0]).toBe("wss://alice.example");
    expect(relays).toContain("wss://default.one/");
    // Her INBOX is not where she publishes.
    expect(relays).not.toContain("wss://alice-in.example");
  });

  it("loads the list when the store hasn't got it — the whole point", async () => {
    loadReplaceableMock.mockResolvedValue(relayList(ALICE, [["r", "wss://alice.example"]]));

    expect(await outboxRelays(ALICE)).toContain("wss://alice.example");
    expect(loadReplaceableMock).toHaveBeenCalledWith(10002, ALICE, expect.anything());
  });

  /** The synchronous variant can only answer from the store — which is exactly
   *  why it must not be the one routing decisions are made with. */
  it("answers with the fallback alone when nothing is loaded", () => {
    expect(outboxRelaysFromDb(ALICE)).toEqual(["wss://default.one/", "wss://default.two/"]);
  });

  it("falls back cleanly for an author who never published a list", async () => {
    expect(await outboxRelays(ALICE)).toEqual(["wss://default.one/", "wss://default.two/"]);
  });

  it("keeps a long list from turning one read into a dozen sockets", async () => {
    seed(relayList(ALICE, Array.from({ length: 12 }, (_, i) => ["r", `wss://r${i}.example`])));

    const relays = await outboxRelays(ALICE, []);

    expect(relays).toHaveLength(MAX_RELAYS_PER_AUTHOR);
  });

  it("unions several authors", async () => {
    seed(relayList(ALICE, [["r", "wss://alice.example"]]));
    seed(relayList(BOB, [["r", "wss://bob.example"]]));

    expect(await outboxRelays([ALICE, BOB], [])).toEqual(["wss://alice.example", "wss://bob.example"]);
  });

  it("asks once for an author it has already missed on", async () => {
    await outboxRelays(ALICE);
    await outboxRelays(ALICE);

    expect(loadReplaceableMock).toHaveBeenCalledTimes(1);
  });
});

describe("where to send an event that names someone", () => {
  it("uses their READ relays — the half that makes a mention arrive", async () => {
    seed(relayList(BOB, [["r", "wss://bob-out.example", "write"], ["r", "wss://bob-in.example", "read"]]));

    const relays = await inboxRelays([BOB]);

    expect(relays).toEqual(["wss://bob-in.example"]);
  });

  /** An inbox set is something a publish ADDS to the author's own relays, so
   *  defaulting it to ours would only restate the floor the caller has. */
  it("is empty, not defaulted, for someone with no list", async () => {
    expect(await inboxRelays([BOB])).toEqual([]);
  });
});

describe("relay hints", () => {
  it("names the author's first write relay", () => {
    seed(relayList(ALICE, [["r", "wss://alice.example"]]));

    expect(relayHintFor(ALICE)).toBe("wss://alice.example");
  });

  /** A wrong hint sends readers somewhere the event definitely is not. */
  it("is left off rather than guessed", () => {
    expect(relayHintFor(ALICE)).toBeUndefined();
  });

  /**
   * A hint is read while BUILDING an event, so it must never reach the relays:
   * that would be dead time between the user's click and the signer prompt, for
   * a field that is optional by design.
   */
  it("never waits on the network", () => {
    relayHintFor(ALICE);

    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });
});

describe("a pubkey that isn't one", () => {
  it("never reaches the relays", async () => {
    expect(await loadRelayList("not-a-pubkey")).toBeNull();
    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });
});
