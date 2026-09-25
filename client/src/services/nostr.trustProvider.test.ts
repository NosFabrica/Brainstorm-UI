// @vitest-environment jsdom
/**
 * Every reader of a kind-10040 acts on it — merges into it and publishes it
 * back, clears the local "activated" flag, picks the scorer. Held copies are
 * kept until evicted, so the read always goes to the relays, newest wins, and
 * a held copy counts only as a candidate: newer when the relays lag, the
 * answer when no relay does. A failed read must never look like "declared
 * nothing", or a merge would publish over the user's other providers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const requestNewestMock = vi.fn<(relays: string[]) => Promise<NostrEvent | undefined>>(async () => undefined);
vi.mock("@/lib/relayRequest", () => ({
  requestAll: vi.fn(),
  requestAllByRelay: vi.fn(),
  requestNewest: (relays: string[]) => requestNewestMock(relays),
  requestOne: vi.fn(),
}));
const heldMock = vi.fn<() => NostrEvent | undefined>(() => undefined);
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getReplaceable: () => heldMock(), getEvent: () => undefined, add: (e: NostrEvent) => e },
}));
vi.mock("@/lib/relayRouting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/relayRouting")>()),
  outboxRelays: async (_pk: string, fallback: string[]) => ["wss://own.example/", ...fallback],
}));

import { fetchTrustProviderList } from "./nostr";

const PK = "6".repeat(64);
const declaration = (created_at: number) =>
  ({ id: String(created_at).padStart(64, "0"), kind: 10040, pubkey: PK, created_at, content: "", tags: [["30382:rank", "a".repeat(64), "wss://ta/"]], sig: "s" }) as NostrEvent;

beforeEach(() => {
  requestNewestMock.mockReset();
  heldMock.mockReset();
});

describe("fetchTrustProviderList", () => {
  it("asks the relays even when a copy is held, and takes theirs when it is newer", async () => {
    heldMock.mockReturnValue(declaration(100));
    requestNewestMock.mockResolvedValue(declaration(200));
    expect((await fetchTrustProviderList(PK))?.created_at).toBe(200);
    expect(requestNewestMock.mock.calls[0][0]).toContain("wss://own.example/");
  });

  it("keeps the held copy when it is the newer one — published here, relays not caught up", async () => {
    heldMock.mockReturnValue(declaration(300));
    requestNewestMock.mockResolvedValue(declaration(200));
    expect((await fetchTrustProviderList(PK))?.created_at).toBe(300);
  });

  it("answers with the held copy when no relay answers, never with nothing", async () => {
    heldMock.mockReturnValue(declaration(100));
    requestNewestMock.mockResolvedValue(undefined);
    expect((await fetchTrustProviderList(PK))?.created_at).toBe(100);
  });
});
