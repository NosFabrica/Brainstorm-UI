// @vitest-environment jsdom
/**
 * fetchAddressableEvents, the way fetchEventsByIds already works: the content
 * relays first, the search relay — whose corpus is WIDER — as the last resort.
 * Benjamin, over GitCitadel Publishing's wiki articles (kind 30818) that
 * search lists but /a/… could not open: their naddr carries no relay hints,
 * the content relays never had them, and the search relay that indexed them
 * was never asked. "Found it in search, couldn't open it" — the same fix.
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
  eventStore: { getEvent: () => undefined, getReplaceable: () => undefined, add: (event: NostrEvent) => event },
}));

let searchRelaySubject: Subject<{ type: string; event?: NostrEvent }> | null = null;
const searchReqMock = vi.fn((_filter: unknown) => {
  searchRelaySubject = new Subject();
  return new Observable((subscriber) => {
    const inner = searchRelaySubject!.subscribe(subscriber);
    return () => inner.unsubscribe();
  });
});
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({ req: (filter: unknown) => searchReqMock(filter) }),
}));

import { fetchAddressableEvents } from "./nostr";
import { PROFILE_RELAYS } from "@/lib/relays";

const GITCITADEL = "3e1ad0f3a5d3c12245db7788546c43ade3d97c6e046c594f6017cd6cd4164690";
const isis = (): NostrEvent =>
  ({ id: "1".repeat(64), kind: 30818, pubkey: GITCITADEL, tags: [["d", "isis"], ["title", "Isis"]], content: "*Isis* was a major goddess", created_at: 1, sig: "s" }) as NostrEvent;
const ptr = { kind: 30818, pubkey: GITCITADEL, identifier: "isis", relays: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  searchRelaySubject = null;
});

describe("fetchAddressableEvents", () => {
  it("an address with no relay hints still asks the default content relays", async () => {
    requestAllMock.mockResolvedValueOnce([isis()]);
    const map = await fetchAddressableEvents([ptr], ptr.relays);
    expect(map.get(`30818:${GITCITADEL}:isis`)?.tags).toContainEqual(["title", "Isis"]);
    expect(requestAllMock.mock.calls[0][0]).toEqual(PROFILE_RELAYS);
    expect(searchReqMock).not.toHaveBeenCalled();
  });

  it("falls back to the search relay (with a lens) for an address the content relays lack", async () => {
    requestAllMock.mockResolvedValueOnce([]);
    const pending = fetchAddressableEvents([ptr], ptr.relays);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    const filter = searchReqMock.mock.calls[0][0] as { kinds: number[]; authors: string[]; "#d": string[]; search: string };
    expect(filter.kinds).toEqual([30818]);
    expect(filter.authors).toEqual([GITCITADEL]);
    expect(filter["#d"]).toEqual(["isis"]);
    expect(filter.search).toBe("include:spam");
    searchRelaySubject!.next({ type: "EVENT", event: isis() });
    searchRelaySubject!.next({ type: "EOSE" });
    const map = await pending;
    expect(map.get(`30818:${GITCITADEL}:isis`)?.content).toContain("Isis");
  });

  it("asks the search relay only for what is still missing, keyed as requested", async () => {
    const other = { kind: 30023, pubkey: "a".repeat(64), identifier: "post", relays: [] as string[] };
    const post = { ...isis(), id: "2".repeat(64), kind: 30023, pubkey: other.pubkey, tags: [["d", "post"]] } as NostrEvent;
    requestAllMock.mockResolvedValueOnce([post]);
    const pending = fetchAddressableEvents([ptr, other], []);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    const filter = searchReqMock.mock.calls[0][0] as { kinds: number[]; authors: string[]; "#d": string[] };
    expect(filter.kinds).toEqual([30818]);
    expect(filter["#d"]).toEqual(["isis"]);
    searchRelaySubject!.next({ type: "EOSE" });
    const map = await pending;
    expect([...map.keys()]).toEqual([`30023:${other.pubkey}:post`]);
  });
});
