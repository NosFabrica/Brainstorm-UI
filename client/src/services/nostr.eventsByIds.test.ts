// @vitest-environment jsdom
/**
 * fetchEventsByIds, upgraded for the search era: the event store answers
 * first (search hits are stored on arrival), the content relays fill the
 * gaps, and the search relay — whose corpus is WIDER than the content
 * relays' — is the last resort for ids they never had. That last hop is
 * what fixes "found it in search, couldn't open it".
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

const storeEvents = new Map<string, NostrEvent>();
vi.mock("@/lib/eventStore", () => ({
  eventStore: {
    getEvent: (id: string) => storeEvents.get(id),
    getReplaceable: () => undefined,
    add: (event: NostrEvent) => event,
  },
}));

let searchRelaySubject: Subject<{ type: string; event?: NostrEvent }> | null = null;
const searchReqMock = vi.fn((filter: unknown) => {
  searchRelaySubject = new Subject();
  searchReqMock.mock.lastCall; // filter recorded via mock args
  return new Observable((subscriber) => {
    const inner = searchRelaySubject!.subscribe(subscriber);
    return () => inner.unsubscribe();
  });
});
vi.mock("@/lib/searchRelay", () => ({
  searchRelay: () => ({ req: (filter: unknown) => searchReqMock(filter) }),
}));

import { fetchEventsByIds } from "./nostr";

function ev(id: string): NostrEvent {
  return { id, kind: 1, pubkey: "a".repeat(64), tags: [], content: "x", created_at: 1, sig: "s" } as NostrEvent;
}

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  storeEvents.clear();
  searchRelaySubject = null;
});

describe("fetchEventsByIds", () => {
  it("answers from the event store without touching the network", async () => {
    storeEvents.set(ID_A, ev(ID_A));
    const events = await fetchEventsByIds([ID_A]);
    expect(events.map((e) => e.id)).toEqual([ID_A]);
    expect(requestAllMock).not.toHaveBeenCalled();
    expect(searchReqMock).not.toHaveBeenCalled();
  });

  it("falls back to the search relay (with a lens) for ids the content relays lack", async () => {
    requestAllMock.mockResolvedValueOnce([]); // content relays: nothing
    const pending = fetchEventsByIds([ID_B]);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    const filter = searchReqMock.mock.calls[0][0] as { ids: string[]; search: string };
    expect(filter.ids).toEqual([ID_B]);
    expect(filter.search).toBe("include:spam"); // the relay refuses lens-less reads
    searchRelaySubject!.next({ type: "EVENT", event: ev(ID_B) });
    searchRelaySubject!.next({ type: "EOSE" });
    const events = await pending;
    expect(events.map((e) => e.id)).toEqual([ID_B]);
  });

  it("skips the fallback when the content relays deliver", async () => {
    requestAllMock.mockResolvedValueOnce([ev(ID_B)]);
    const events = await fetchEventsByIds([ID_B]);
    expect(events.map((e) => e.id)).toEqual([ID_B]);
    expect(searchReqMock).not.toHaveBeenCalled();
  });
});
