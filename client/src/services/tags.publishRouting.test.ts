import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

/**
 * Where a TAG PUBLISH goes: the hub ∪ the author's own write relays, per the
 * kit's routing rule, and nothing else.
 *
 * The app's general publish path floors every event with `PROFILE_RELAYS`.
 * That floor is right for a note and wrong here — it scatters assertions
 * across five general relays no tag reader queries, and it overrides a user
 * who narrowed their set in Settings.
 */

const VIEWER = "a".repeat(64);
const HUB = "wss://hub.example/";

const published = vi.hoisted(() => ({ relays: [] as string[][] }));
const store = vi.hoisted(() => ({ held: new Map<string, unknown>() }));

vi.mock("@/services/nostr", () => ({
  pool: {
    publish: async (relays: string[]) => {
      published.relays.push(relays);
      return relays.map((from) => ({ ok: true, from, message: "" }));
    },
  },
  fetchEventsByFilter: async () => [],
  fetchProfileMap: async () => new Map(),
  hasLocalSecretKey: () => false,
  publishToRelays: async () => ({ success: true }),
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => ({ pubkey: VIEWER }),
  requireActiveAccount: () => ({ pubkey: VIEWER }),
  signAs: async (_a: unknown, t: Record<string, unknown>) => ({ ...t, pubkey: VIEWER, id: "e".repeat(64) }),
}));

vi.mock("@/config/tagging", async (original) => ({
  ...(await original<typeof import("@/config/tagging")>()),
  tagRelays: () => [HUB],
}));

vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: (kind: number, pubkey: string) => store.held.get(`${kind}:${pubkey}`) },
}));
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
  loadReplaceable: async () => undefined,
}));
vi.mock("@/lib/relays", () => ({
  PROFILE_RELAYS: ["wss://default-one.example/", "wss://default-two.example/"],
  CONTENT_RELAYS: ["wss://default-one.example/"],
}));

const relayList = (): NostrEvent =>
  ({
    id: "1".repeat(64), kind: 10002, pubkey: VIEWER, created_at: 1, content: "", sig: "s",
    tags: [["r", "wss://mine.example", "write"]],
  }) as NostrEvent;

async function pin() {
  const { pinTag } = await import("./tags");
  const { resetRelayRoutingCache } = await import("@/lib/relayRouting");
  resetRelayRoutingCache();
  await pinTag({ authorPubkey: VIEWER, slug: "musician", tagEventId: "f".repeat(64) });
  return published.relays[0] ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  published.relays = [];
  store.held.clear();
});

describe("which relays a tag publish reaches", () => {
  it("is the hub plus the author's own write relays", async () => {
    store.held.set(`10002:${VIEWER}`, relayList());

    const relays = await pin();

    expect(relays).toContain(HUB);
    expect(relays).toContain("wss://mine.example/");
  });

  /** The floor the general publish path adds has no business on this surface. */
  it("does not scatter the assertion across the app's default relays", async () => {
    store.held.set(`10002:${VIEWER}`, relayList());

    const relays = await pin();

    expect(relays).not.toContain("wss://default-one.example/");
    expect(relays).not.toContain("wss://default-two.example/");
  });

  /** A user who narrowed their set in Settings must not be widened past it. */
  it("is the hub alone for an author with no relay list", async () => {
    expect(await pin()).toEqual([HUB]);
  });
});
