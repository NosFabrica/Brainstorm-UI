/**
 * Multi-author routing: which relays to open for a set of authors, and which
 * authors each one is asked about.
 *
 * The flat `outboxRelays` union is right for one author and wrong at scale —
 * it sends every relay the same enormous `authors` array, nearly all of it
 * people that relay has never carried. This is the shape the query wants.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { normalizeURL } from "applesauce-core/helpers/url";
import { createFilterMap } from "applesauce-core/helpers/relay-selection";

const held = new Map<string, NostrEvent>();
const loadReplaceableMock = vi.fn(async () => undefined as NostrEvent | undefined);

vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (k: number, p: string) => held.get(`${k}:${p}`) },
}));
vi.mock("@/lib/loaders", () => ({
  loadReplaceable: (...a: unknown[]) => loadReplaceableMock(...(a as [])),
}));
vi.mock("@/lib/relays", () => ({
  PROFILE_RELAYS: ["wss://floor.example/"],
  CONTENT_RELAYS: ["wss://floor.example/"],
}));

import { planOutboxReads, resetRelayRoutingCache } from "./relayRouting";

const pk = (c: string) => c.repeat(64);
const ALICE = pk("a");
const BOB = pk("b");
const CAROL = pk("c");

const relayList = (pubkey: string, urls: string[]): NostrEvent =>
  ({
    id: "1".repeat(64),
    kind: 10002,
    pubkey,
    created_at: 1,
    tags: urls.map((u) => ["r", u]),
    content: "",
    sig: "s",
  }) as NostrEvent;

const seed = (e: NostrEvent) => held.set(`${e.kind}:${e.pubkey}`, e);
const authorsOn = (plan: Awaited<ReturnType<typeof planOutboxReads>>, relay: string) =>
  (plan.outboxes[relay] ?? []).map((u) => u.pubkey).sort();

beforeEach(() => {
  held.clear();
  resetRelayRoutingCache();
  vi.clearAllMocks();
  loadReplaceableMock.mockResolvedValue(undefined);
});

describe("planning a multi-author read", () => {
  it("asks each relay only about the authors it serves", async () => {
    seed(relayList(ALICE, ["wss://one.example"]));
    seed(relayList(BOB, ["wss://two.example"]));

    const plan = await planOutboxReads([ALICE, BOB], []);

    expect(authorsOn(plan, normalizeURL("wss://one.example"))).toEqual([ALICE]);
    expect(authorsOn(plan, normalizeURL("wss://two.example"))).toEqual([BOB]);
  });

  it("puts authors who share a relay on one connection", async () => {
    seed(relayList(ALICE, ["wss://shared.example"]));
    seed(relayList(BOB, ["wss://shared.example"]));

    const plan = await planOutboxReads([ALICE, BOB], []);

    expect(plan.relays).toHaveLength(1);
    expect(authorsOn(plan, normalizeURL("wss://shared.example"))).toEqual([ALICE, BOB].sort());
  });

  /**
   * The keying trap. `RelayPool` keys its connections by `normalizeURL`, which
   * KEEPS a trailing slash, while `dedupeRelays` drops it. A plan keyed the
   * other way looks fine and matches nothing: every relay would be asked for an
   * empty author list and the read would come back silently empty.
   */
  it("keys relays exactly as the pool does", async () => {
    seed(relayList(ALICE, ["wss://one.example"]));

    const plan = await planOutboxReads([ALICE], []);

    for (const relay of plan.relays) expect(relay).toBe(normalizeURL(relay));
    const filters = createFilterMap(plan.outboxes, { kinds: [1] });
    expect(filters[normalizeURL("wss://one.example")]).toMatchObject({ authors: [ALICE] });
  });

  it("looks for an author with no relay list on the fallback", async () => {
    const plan = await planOutboxReads([ALICE], ["wss://floor.example/"]);

    expect(authorsOn(plan, normalizeURL("wss://floor.example/"))).toEqual([ALICE]);
  });

  /**
   * A budget of one cannot cover three authors on three different relays. The
   * ones squeezed out must land on the floor — dropping them would be an author
   * we silently never asked about, which reads as "they have posted nothing".
   */
  it("never silently drops an author the budget could not cover", async () => {
    seed(relayList(ALICE, ["wss://one.example"]));
    seed(relayList(BOB, ["wss://two.example"]));
    seed(relayList(CAROL, ["wss://three.example"]));

    const plan = await planOutboxReads([ALICE, BOB, CAROL], ["wss://floor.example/"], {
      maxConnections: 1,
    });

    const covered = new Set(Object.values(plan.outboxes).flat().map((u) => u.pubkey));
    expect(covered).toEqual(new Set([ALICE, BOB, CAROL]));
  });

  /**
   * The floor is a fallback, not a fan-out. Adding every squeezed-out author to
   * every fallback relay is the undirected broadcast this function replaces,
   * and it pushes the plan past its own budget besides.
   */
  it("puts the authors it could not cover on ONE floor relay", async () => {
    seed(relayList(ALICE, ["wss://one.example"]));
    seed(relayList(BOB, ["wss://two.example"]));
    seed(relayList(CAROL, ["wss://three.example"]));
    const floor = ["wss://f1.example/", "wss://f2.example/", "wss://f3.example/"];

    const plan = await planOutboxReads([ALICE, BOB, CAROL], floor, { maxConnections: 1 });

    const used = floor.filter((relay) => plan.outboxes[relay]?.length);
    expect(used).toHaveLength(1);
  });

  it("holds the budget even when the floor has to catch someone", async () => {
    seed(relayList(ALICE, ["wss://one.example"]));
    seed(relayList(BOB, ["wss://two.example"]));
    seed(relayList(CAROL, ["wss://three.example"]));

    const plan = await planOutboxReads([ALICE, BOB, CAROL], ["wss://f1.example/", "wss://f2.example/"], {
      maxConnections: 1,
    });

    // the selected one, plus at most a single fallback
    expect(plan.relays.length).toBeLessThanOrEqual(2);
  });

  it("holds the connection budget", async () => {
    for (const [i, author] of [ALICE, BOB, CAROL].entries()) {
      seed(relayList(author, [`wss://r${i}.example`]));
    }

    const plan = await planOutboxReads([ALICE, BOB, CAROL], [], { maxConnections: 2 });

    expect(plan.relays.length).toBeLessThanOrEqual(2);
  });

  it("is empty for no authors, and asks nothing", async () => {
    const plan = await planOutboxReads([], ["wss://floor.example/"]);

    expect(plan).toEqual({ relays: [], outboxes: {} });
    expect(loadReplaceableMock).not.toHaveBeenCalled();
  });
});
