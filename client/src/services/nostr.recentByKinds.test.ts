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
    expect(searchReqMock.mock.calls[0][0]).toMatchObject({ kinds: [21, 22, 34235, 34236], authors: [PK], search: "include:spam" });
    searchSubject!.next({ type: "EVENT", event: video("b".repeat(64), 300) }); // duplicate
    searchSubject!.next({ type: "EVENT", event: video("c".repeat(64), 200) });
    searchSubject!.next({ type: "EVENT", event: video("d".repeat(64), 50) });
    searchSubject!.next({ type: "EOSE" });
    const out = await p;
    expect(out.map((e) => e.id[0])).toEqual(["b", "c", "a"]);
  });

  it("a search relay that never answers doesn't hold the page hostage", async () => {
    requestAllMock.mockResolvedValue([video("a".repeat(64), 100)]);
    const out = await fetchRecentByKinds(PK, [1], 5, { timeoutMs: 30 });
    expect(out.map((e) => e.id[0])).toEqual(["a"]);
  });
});
