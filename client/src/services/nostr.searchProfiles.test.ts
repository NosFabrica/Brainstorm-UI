// @vitest-environment jsdom
/** Admin people search reads the shared SearchOverTrust relay, which refuses a read naming no observer. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

const requestAllMock =
  vi.fn<(relays: string[], filter: { search?: string }, timeoutMs: number) => Promise<NostrEvent[]>>();
vi.mock("@/lib/relayRequest", () => ({
  requestAll: (...args: Parameters<typeof requestAllMock>) => requestAllMock(...args),
  requestAllByRelay: vi.fn(),
  requestNewest: vi.fn(),
  requestOne: vi.fn(),
}));
let relay: { url: string } | null = { url: "wss://search.example/" };
vi.mock("@/lib/searchRelay", () => ({ searchRelay: () => relay }));
const houseMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: () => houseMock() }));

import { searchNostrProfiles } from "./nostr";

const HOUSE = "b".repeat(64);

const profile = (pubkey: string, kind = 0): NostrEvent => ({
  id: pubkey.slice(0, 63) + kind,
  kind,
  pubkey,
  created_at: 1,
  content: JSON.stringify({ name: "jack" }),
  tags: [],
  sig: "s",
});

const sentSearch = () => requestAllMock.mock.calls[0][1].search;

beforeEach(() => {
  relay = { url: "wss://search.example/" };
  houseMock.mockReset();
  requestAllMock.mockReset();
  requestAllMock.mockResolvedValue([]);
});

describe("searchNostrProfiles", () => {
  it("reads the search relay through the house observer", async () => {
    houseMock.mockResolvedValue(HOUSE);
    requestAllMock.mockResolvedValue([profile("a".repeat(64))]);
    const results = await searchNostrProfiles("jack");
    expect(requestAllMock.mock.calls[0][0]).toEqual(["wss://search.example/"]);
    expect(sentSearch()).toBe(`jack observer:${HOUSE}`);
    expect(results).toMatchObject([{ pubkey: "a".repeat(64), name: "jack" }]);
  });

  it.each([
    ["unresolved", () => houseMock.mockResolvedValue(null)],
    ["failed", () => houseMock.mockRejectedValue(new Error("nostr.json unreachable"))],
  ])("waives the observer with include:spam when the house observer is %s", async (_, arrange) => {
    arrange();
    await searchNostrProfiles("jack");
    expect(sentSearch()).toBe("jack include:spam");
  });

  it("keeps an observer the query already names", async () => {
    houseMock.mockResolvedValue(HOUSE);
    await searchNostrProfiles(`jack observer:${"c".repeat(64)}`);
    expect(sentSearch()).toBe(`jack observer:${"c".repeat(64)}`);
  });

  it("keeps only kind-0 events, one per pubkey", async () => {
    houseMock.mockResolvedValue(HOUSE);
    requestAllMock.mockResolvedValue([
      profile("c".repeat(64), 30382),
      profile("d".repeat(64)),
      { ...profile("d".repeat(64)), id: "e".repeat(64) },
    ]);
    expect((await searchNostrProfiles("jack")).map((r) => r.pubkey)).toEqual(["d".repeat(64)]);
  });

  it("is empty without a search relay", async () => {
    relay = null;
    expect(await searchNostrProfiles("jack")).toEqual([]);
    expect(requestAllMock).not.toHaveBeenCalled();
  });
});
