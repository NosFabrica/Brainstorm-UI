// @vitest-environment jsdom
/**
 * fetchRecentByKinds feeds the public profile's content blocks. Benjamin,
 * over a DiVine creator's page reading "Nothing public yet": "divine accounts
 * should be showing their media content". Probed 2026-09-03: Mooseum's twelve
 * videos are kind 34236 on OUR search relay; the content relays and DiVine's
 * own relay didn't return them. So the search relay — whose corpus is wider —
 * is asked alongside the author's outbox relays, and the results merge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Observable, Subject } from "rxjs";
import type { NostrEvent } from "nostr-tools";

const requestAllMock = vi.fn<() => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock("@/lib/relayRequest", () => ({
  requestAll: (...args: unknown[]) => requestAllMock(...(args as [])),
  requestNewest: vi.fn(),
  requestNewestRaw: vi.fn(),
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

// NIP-65 routing asks for the author's kind-10002 before a content read;
// these cases are about relay FAN-OUT, so the lookup answers "nothing".
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  loadReplaceable: async () => undefined,
}));

import { fetchRecentByKinds } from "./nostr";

const PK = "91ac02c1490ca2f1f78ed7c2b55d6513bf0b9bdaaf40037eb63820f616c7ba9f";
const video = (id: string, created_at: number): NostrEvent =>
  ({ id, kind: 34236, pubkey: PK, tags: [["d", id], ["imeta", "url https://cdn.divine.video/x.mp4", "m video/mp4"]], content: "", created_at, sig: "s" }) as NostrEvent;

beforeEach(() => {
  vi.clearAllMocks();
  searchSubject = null;
});

describe("fetchRecentByKinds", () => {
  it("asks the search relay too, merges with the content relays, newest first, deduped", async () => {
    requestAllMock.mockResolvedValue([video("a".repeat(64), 100), video("b".repeat(64), 300)]);
    const p = fetchRecentByKinds(PK, [21, 22, 34235, 34236], 3);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(1));
    // One ask, so one filter on the wire — a batch is what makes it an array.
    expect(searchReqMock.mock.calls[0][0]).toMatchObject({ kinds: [21, 22, 34235, 34236], authors: [PK], search: "include:spam" });
    searchSubject!.next({ type: "EVENT", event: video("b".repeat(64), 300) }); // duplicate
    searchSubject!.next({ type: "EVENT", event: video("c".repeat(64), 200) });
    searchSubject!.next({ type: "EVENT", event: video("d".repeat(64), 50) });
    searchSubject!.next({ type: "EOSE" });
    const out = await p;
    expect(out.map((e) => e.id[0])).toEqual(["b", "c", "a"]);
  });

  // Zap Cooking's overwritten recipes (2026-09-24): content "", a tombstone
  // tag, a "[Deleted]" title — from the search relay and the content relays
  // alike. The profile's blocks never see them.
  it("drops a husk deleted by overwriting, whichever relay it came from", async () => {
    const husk = (id: string, created_at: number): NostrEvent =>
      ({ id, kind: 30023, pubkey: PK, tags: [["d", id], ["deleted", "true"], ["title", "[Deleted]"]], content: "", created_at, sig: "s" }) as NostrEvent;
    const article = (id: string, created_at: number): NostrEvent =>
      ({ id, kind: 30023, pubkey: PK, tags: [["d", id], ["title", "Cheese foam tea"]], content: "# Cheese foam tea", created_at, sig: "s" }) as NostrEvent;
    requestAllMock.mockResolvedValue([husk("a".repeat(64), 400), article("b".repeat(64), 300)]);
    const p = fetchRecentByKinds(PK, [30023], 5);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(1));
    searchSubject!.next({ type: "EVENT", event: husk("c".repeat(64), 500) });
    searchSubject!.next({ type: "EVENT", event: article("d".repeat(64), 200) });
    searchSubject!.next({ type: "EOSE" });
    const out = await p;
    expect(out.map((e) => e.id[0])).toEqual(["b", "d"]);
  });

  // The knowledge panel asks the same person four separate questions the moment
  // it settles on them — listings, media, streams, tracks — and the results page
  // asks a fifth. The relay works a socket's REQs as a queue, so they go as one.
  it("asks one question when several are asked about the same person at once", async () => {
    requestAllMock.mockResolvedValue([]);
    const listings = fetchRecentByKinds(PK, [30402], 12);
    const media = fetchRecentByKinds(PK, [1, 21, 22, 34236], 40);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(1));

    const filters = searchReqMock.mock.calls[0][0] as Array<{ kinds: number[]; limit: number; authors: string[] }>;
    expect(filters).toHaveLength(2);
    expect(filters.map((f) => f.kinds)).toEqual([[30402], [1, 21, 22, 34236]]);
    expect(filters.map((f) => f.limit)).toEqual([12, 40]);
    expect(filters.every((f) => f.authors[0] === PK)).toBe(true);
    // The content relays are asked once too, with the same pair.
    expect(requestAllMock).toHaveBeenCalledTimes(1);

    const listing = { id: "l1", kind: 30402, pubkey: PK, tags: [["d", "l1"], ["title", "Mug"], ["price", "12", "USD"]], content: "", created_at: 500, sig: "s" } as NostrEvent;
    searchSubject!.next({ type: "EVENT", event: listing });
    searchSubject!.next({ type: "EVENT", event: video("v1".padEnd(64, "0"), 400) });
    searchSubject!.next({ type: "EOSE" });

    // Each caller gets its own kinds back, and nobody else's.
    expect((await listings).map((e) => e.id)).toEqual(["l1"]);
    expect((await media).map((e) => e.kind)).toEqual([34236]);
  });

  it("keeps different people apart", async () => {
    requestAllMock.mockResolvedValue([]);
    const OTHER = "c".repeat(64);
    void fetchRecentByKinds(PK, [1], 5);
    void fetchRecentByKinds(OTHER, [1], 5);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(2));
  });


  it("answers everyone sharing a request when it fails, rather than leaving them waiting", async () => {
    requestAllMock.mockRejectedValue(new Error("relays gone"));
    const listings = fetchRecentByKinds(PK, [30402], 12, { timeoutMs: 50 });
    const media = fetchRecentByKinds(PK, [1, 21], 40, { timeoutMs: 50 });
    expect(await listings).toEqual([]);
    expect(await media).toEqual([]);
  });

  it("a search relay that never answers doesn't hold the page hostage", async () => {
    requestAllMock.mockResolvedValue([video("a".repeat(64), 100)]);
    const out = await fetchRecentByKinds(PK, [34236], 5, { timeoutMs: 30 });
    expect(out.map((e) => e.id[0])).toEqual(["a"]);
  });
});
