// @vitest-environment jsdom
/**
 * fetchCollectionProducts and fetchListingFamily ask the search relay and the
 * seller's own relays together. The search relay needs no routing, so it is
 * asked while the seller's outbox is still being looked up; and a lagging
 * relay's older version of a listing is not handed back beside the newer one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const requestAllMock = vi.fn((_relays: string[], _filter: unknown) => Promise.resolve([] as NostrEvent[]));
vi.mock("@/lib/relayRequest", () => ({
  requestAll: (relays: string[], filter: unknown) => requestAllMock(relays, filter),
  requestAllByRelay: vi.fn(),
  requestNewest: vi.fn(),
  requestNewestWithReach: vi.fn(),
  requestOne: vi.fn(),
}));
vi.mock("@/lib/eventStore", () => ({
  eventStore: { getEvent: () => undefined, getReplaceable: () => undefined, add: (e: NostrEvent) => e },
}));
let searchSubject: Subject<{ type: string; event?: NostrEvent }> | null = null;
const searchReqMock = vi.fn((_filter: unknown) => {
  searchSubject = new Subject();
  return new Observable((subscriber) => {
    const inner = searchSubject!.subscribe(subscriber);
    return () => inner.unsubscribe();
  });
});
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({ req: (filter: unknown) => searchReqMock(filter) }),
}));
// The seller's relay list: held until the test lets it answer.
let answerOutbox: (relays: string[]) => void = () => {};
vi.mock("@/lib/relayRouting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/relayRouting")>()),
  outboxRelays: () => new Promise<string[]>((resolve) => (answerOutbox = resolve)),
}));

import { fetchCollectionProducts, fetchListingFamily } from "./nostr";

const SELLER = "c".repeat(64);
const COLLECTION = `30405:${SELLER}:wallets`;
const listing = (id: string, d: string, created_at: number, extra: string[][] = []): NostrEvent =>
  ({
    id,
    kind: 30402,
    pubkey: SELLER,
    created_at,
    content: "",
    tags: [["d", d], ["title", d], ["a", COLLECTION], ...extra],
    sig: "s",
  }) as NostrEvent;

beforeEach(() => {
  requestAllMock.mockReset();
  requestAllMock.mockResolvedValue([]);
  searchReqMock.mockClear();
  searchSubject = null;
});

describe("fetchCollectionProducts", () => {
  it("asks the search relay before the seller's outbox is known", async () => {
    const pending = fetchCollectionProducts(SELLER, COLLECTION, 2000);
    await Promise.resolve();
    expect(searchReqMock).toHaveBeenCalledTimes(1);
    expect(requestAllMock).not.toHaveBeenCalled();
    answerOutbox(["wss://own.example/"]);
    await vi.waitFor(() => expect(requestAllMock).toHaveBeenCalledTimes(1));
    searchSubject!.next({ type: "EOSE" });
    await pending;
  });

  it("hands back one version per listing: the newest, wherever it came from", async () => {
    const onSale = listing("a".repeat(64), "jade", 100);
    const hidden = listing("b".repeat(64), "jade", 200, [["visibility", "hidden"]]);
    const other = listing("d".repeat(64), "tzt", 150);
    requestAllMock.mockResolvedValue([onSale, other]);
    const pending = fetchCollectionProducts(SELLER, COLLECTION, 2000);
    await Promise.resolve();
    searchSubject!.next({ type: "EVENT", event: hidden });
    searchSubject!.next({ type: "EOSE" });
    answerOutbox(["wss://own.example/"]);
    expect((await pending).map((e) => e.id)).toEqual([hidden.id, other.id]);
  });
});

describe("fetchListingFamily", () => {
  it("asks the search relay before the seller's outbox is known", async () => {
    const pending = fetchListingFamily(SELLER, `30402:${SELLER}:jade`, 2000);
    await Promise.resolve();
    expect(searchReqMock).toHaveBeenCalledTimes(1);
    expect(requestAllMock).not.toHaveBeenCalled();
    answerOutbox(["wss://own.example/"]);
    await vi.waitFor(() => expect(requestAllMock).toHaveBeenCalledTimes(2));
    searchSubject!.next({ type: "EOSE" });
    await pending;
  });
});
