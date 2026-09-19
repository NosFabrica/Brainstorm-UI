import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NostrEvent } from "nostr-tools";

/**
 * Where a TAG READ goes.
 *
 * The kit's routing rule — stated in `config/tagging.ts` and on `fetchTagEvents`
 * itself — is "reads query the hub ∪ the user's read relays; publishes go to the
 * hub ∪ the user's write relays". Only the publish half was ever true. The read
 * half asked the hub and nothing else, so a tagging that reached the hub was
 * found and one that only reached the relays the viewer actually reads was not.
 */

const VIEWER = "a".repeat(64);
const HUB = "wss://hub.example";

const relay = vi.hoisted(() => ({ reads: [] as string[][] }));
const account = vi.hoisted(() => ({ current: null as { pubkey: string } | null }));
const store = vi.hoisted(() => ({ held: new Map<string, unknown>() }));

vi.mock("@/services/nostr", () => ({
  fetchEventsByFilter: async (_filter: unknown, relays: string[]) => {
    relay.reads.push(relays);
    return [] as NostrEvent[];
  },
  fetchProfileMap: async () => new Map(),
  hasLocalSecretKey: () => false,
  publishRelaysFor: async () => [],
  publishToRelays: async () => ({ success: true }),
  pool: { publish: async () => [] },
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => account.current,
  requireActiveAccount: () => account.current,
  signAs: async (_a: unknown, t: unknown) => t,
}));

vi.mock("@/config/tagging", async (original) => ({
  ...(await original<typeof import("@/config/tagging")>()),
  tagRelays: () => [HUB],
}));

vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (kind: number, pubkey: string) => store.held.get(`${kind}:${pubkey}`) },
}));
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  loadReplaceable: async () => undefined,
}));

const relayList = (tags: string[][]): NostrEvent =>
  ({ id: "1".repeat(64), kind: 10002, pubkey: VIEWER, created_at: 1, tags, content: "", sig: "s" }) as NostrEvent;

/** Any tag read — they all funnel through `fetchTagEvents`. */
async function readSomeTags() {
  const { fetchTagDetail } = await import("./tags");
  await fetchTagDetail(VIEWER, "musician").catch(() => undefined);
  return relay.reads;
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  relay.reads = [];
  store.held.clear();
  account.current = null;
  const { resetRelayRoutingCache } = await import("@/lib/relayRouting");
  resetRelayRoutingCache();
});

describe("which relays a tag read asks", () => {
  it("adds the viewer's own read relays to the hub", async () => {
    account.current = { pubkey: VIEWER };
    store.held.set(`10002:${VIEWER}`, relayList([["r", "wss://mine-in.example", "read"]]));

    const reads = await readSomeTags();

    expect(reads.length).toBeGreaterThan(0);
    for (const relays of reads) {
      expect(relays).toContain("wss://mine-in.example");
      expect(relays).toContain(HUB);
    }
  });

  /** The rule says READ relays; a write-only relay is not one. */
  it("leaves out a relay the viewer only writes to", async () => {
    account.current = { pubkey: VIEWER };
    store.held.set(
      `10002:${VIEWER}`,
      relayList([["r", "wss://mine-out.example", "write"], ["r", "wss://mine-in.example", "read"]]),
    );

    for (const relays of await readSomeTags()) {
      expect(relays).not.toContain("wss://mine-out.example");
    }
  });

  /** An unmarked `r` tag is both, which is what almost every relay list holds. */
  it("takes an unmarked relay, so an ordinary list covers what the viewer wrote", async () => {
    account.current = { pubkey: VIEWER };
    store.held.set(`10002:${VIEWER}`, relayList([["r", "wss://mine.example"]]));

    for (const relays of await readSomeTags()) {
      expect(relays).toContain("wss://mine.example");
    }
  });

  it("is the hub alone for a logged-out visitor", async () => {
    const reads = await readSomeTags();

    expect(reads.length).toBeGreaterThan(0);
    for (const relays of reads) expect(relays).toEqual([HUB]);
  });

  it("is the hub alone for a viewer who has published no relay list", async () => {
    account.current = { pubkey: VIEWER };

    for (const relays of await readSomeTags()) expect(relays).toEqual([HUB]);
  });
});
