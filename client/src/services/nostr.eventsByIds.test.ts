// @vitest-environment jsdom
/**
 * fetchEventsByIds, upgraded for the search era: the event store answers
 * first (search hits are stored on arrival), the content relays fill the
 * gaps, and the search relay — whose corpus is WIDER than the content
 * relays' — answers for ids they never had, asked beside them. That hop is
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
  // lib/eventStore's verified-deletion seam (useStoreEvents reads it): nothing deleted here.
  isDeleted: () => false,
  deletions$: { subscribe: () => ({ unsubscribe: () => {} }) },
  eventStore: {
    getEvent: (id: string) => storeEvents.get(id),
    getReplaceable: () => undefined,
    add: (event: NostrEvent) => event,
  },
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

import { fetchEventsByIds } from "./nostr";
import { PROFILE_RELAYS, SEARCH_RELAY } from "@/lib/relays";

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

  it("asks only for the ids it doesn't hold, when some are missing", async () => {
    storeEvents.set(ID_A, ev(ID_A));
    requestAllMock.mockResolvedValueOnce([ev(ID_B)]);
    const events = await fetchEventsByIds([ID_A, ID_B], ["wss://content.example/"]);
    expect(events.map((e) => e.id).sort()).toEqual([ID_A, ID_B]);
    expect((requestAllMock.mock.calls[0] as unknown[])[1]).toEqual({ ids: [ID_B] });
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

  // The default set includes the search relay. It used to be asked through the
  // pool AND then again on its own once the others came back empty: the same
  // question to the same socket, in series.
  it("asks the search relay once, beside the content relays — never again after them", async () => {
    requestAllMock.mockResolvedValueOnce([]);
    const pending = fetchEventsByIds([ID_B]);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalledTimes(1));
    const asked = (requestAllMock.mock.calls[0] as unknown[])[0] as string[];
    expect(asked).not.toContain(SEARCH_RELAY);
    expect(asked).toEqual(PROFILE_RELAYS.filter((r) => r !== SEARCH_RELAY));
    searchRelaySubject!.next({ type: "EOSE" });
    expect(await pending).toEqual([]);
    expect(searchReqMock).toHaveBeenCalledTimes(1);
  });

  it("stops waiting on the search relay once the content relays deliver", async () => {
    requestAllMock.mockResolvedValueOnce([ev(ID_B)]);
    // The search relay never answers: the call must not wait out its deadline.
    const events = await fetchEventsByIds([ID_B]);
    expect(events.map((e) => e.id)).toEqual([ID_B]);
  });

  it("keeps the search relay as the last resort for relays named without it", async () => {
    requestAllMock.mockResolvedValueOnce([]);
    const pending = fetchEventsByIds([ID_B], ["wss://named.example/"]);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    expect((requestAllMock.mock.calls[0] as unknown[])[0]).toEqual(["wss://named.example/"]);
    searchRelaySubject!.next({ type: "EVENT", event: ev(ID_B) });
    searchRelaySubject!.next({ type: "EOSE" });
    expect((await pending).map((e) => e.id)).toEqual([ID_B]);
  });
});

describe("fetchEventsByIds, called twice in one turn", () => {
  const ID_C = "c".repeat(64);
  const OTHER = ["wss://elsewhere.example/"];

  it("asks once for both callers' ids, and hands each its own", async () => {
    requestAllMock.mockResolvedValueOnce([ev(ID_A), ev(ID_B), ev(ID_C)]);
    const [pinned, quoted] = await Promise.all([
      fetchEventsByIds([ID_A], OTHER),
      fetchEventsByIds([ID_B, ID_C], OTHER),
    ]);
    expect(requestAllMock).toHaveBeenCalledTimes(1);
    const askedFilter = (requestAllMock.mock.calls[0] as unknown[])[1] as { ids: string[] };
    expect([...askedFilter.ids].sort()).toEqual([ID_A, ID_B, ID_C]);
    expect(pinned.map((e) => e.id)).toEqual([ID_A]);
    expect(quoted.map((e) => e.id).sort()).toEqual([ID_B, ID_C]);
  });

  it("keeps asks to different relays apart", async () => {
    // Every id asked for is found, so neither ask falls through to the search relay.
    requestAllMock.mockImplementation(((_relays: unknown, filter: { ids: string[] }) =>
      Promise.resolve(filter.ids.map(ev))) as unknown as () => Promise<NostrEvent[]>);
    await Promise.all([fetchEventsByIds([ID_A], OTHER), fetchEventsByIds([ID_B], ["wss://another.example/"])]);
    expect(requestAllMock).toHaveBeenCalledTimes(2);
  });
});
