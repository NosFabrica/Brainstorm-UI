// @vitest-environment jsdom
/**
 * fetchAddressableEvents, the way fetchEventsByIds already works: the content
 * relays, and beside them the search relay — whose corpus is WIDER.
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
const heldMock = vi.fn<(kind: number, pubkey: string, identifier?: string) => NostrEvent | undefined>(() => undefined);
vi.mock("@/lib/eventStore", () => ({
  // lib/eventStore's verified-deletion seam (useStoreEvents reads it): nothing deleted here.
  isDeleted: () => false,
  deletions$: { subscribe: () => ({ unsubscribe: () => {} }) },
  eventStore: {
    getEvent: () => undefined,
    getReplaceable: (kind: number, pubkey: string, identifier?: string) => heldMock(kind, pubkey, identifier),
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
// NIP-65 routing asks for the author's kind-10002 before a content read;
// these cases are about relay FAN-OUT, so the lookup answers "nothing".
vi.mock("@/lib/loaders", () => ({
  addressLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  idLoader: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
  loadReplaceable: async () => undefined,
}));

import { fetchAddressableEvents, fetchFromSearchRelayByFilters, querySearchRelay } from "./nostr";
import { PROFILE_RELAYS, SEARCH_RELAY } from "@/lib/relays";

/** The default set as the pool is asked it: the search relay has a leg of its own. */
const BESIDES_SEARCH = PROFILE_RELAYS.filter((r) => r !== SEARCH_RELAY);

const GITCITADEL = "3e1ad0f3a5d3c12245db7788546c43ade3d97c6e046c594f6017cd6cd4164690";
const isis = (): NostrEvent =>
  ({
    id: "1".repeat(64),
    kind: 30818,
    pubkey: GITCITADEL,
    tags: [
      ["d", "isis"],
      ["title", "Isis"],
    ],
    content: "*Isis* was a major goddess",
    created_at: 1,
    sig: "s",
  }) as NostrEvent;
const ptr = { kind: 30818, pubkey: GITCITADEL, identifier: "isis", relays: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  heldMock.mockImplementation(() => undefined);
  searchRelaySubject = null;
});

describe("fetchAddressableEvents", () => {
  it("an address with no relay hints still asks the default content relays — and search beside them", async () => {
    requestAllMock.mockResolvedValueOnce([isis()]);
    const map = await fetchAddressableEvents([ptr], ptr.relays);
    expect(map.get(`30818:${GITCITADEL}:isis`)?.tags).toContainEqual(["title", "Isis"]);
    expect(requestAllMock.mock.calls[0][0]).toEqual(BESIDES_SEARCH);
    // Asked once, on its own leg, and let go once the others had the address.
    expect(searchReqMock).toHaveBeenCalledTimes(1);
  });

  // An article page waited for every relay to say "nothing else" after the
  // article had already arrived (5.5s on a page whose author lists a dead
  // relay, 2026-09-24). A read for named addresses is done the moment every
  // one of them has a copy; the store keeps refreshing newer versions later.
  it("asks the read to stop the moment every wanted address has a copy", async () => {
    requestAllMock.mockResolvedValueOnce([isis()]);
    await fetchAddressableEvents([ptr], ptr.relays);
    const opts = requestAllMock.mock.calls[0][3] as { enough?: (collected: Map<string, NostrEvent>) => boolean };
    expect(opts?.enough).toBeTypeOf("function");
    const other = { ...isis(), id: "2".repeat(64), tags: [["d", "osiris"]] } as NostrEvent;
    expect(opts.enough!(new Map([[other.id, other]]))).toBe(false);
    expect(
      opts.enough!(
        new Map([
          [other.id, other],
          [isis().id, isis()],
        ]),
      ),
    ).toBe(true);
  });

  it("falls back to the search relay (with a lens) for an address the content relays lack", async () => {
    requestAllMock.mockResolvedValueOnce([]);
    const pending = fetchAddressableEvents([ptr], ptr.relays);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    const filter = searchReqMock.mock.calls[0][0] as {
      kinds: number[];
      authors: string[];
      "#d": string[];
      search: string;
    };
    expect(filter.kinds).toEqual([30818]);
    expect(filter.authors).toEqual([GITCITADEL]);
    expect(filter["#d"]).toEqual(["isis"]);
    expect(filter.search).toBe("include:spam");
    searchRelaySubject!.next({ type: "EVENT", event: isis() });
    searchRelaySubject!.next({ type: "EOSE" });
    const map = await pending;
    expect(map.get(`30818:${GITCITADEL}:isis`)?.content).toContain("Isis");
  });

  // It used to be asked through the pool, as one of the default set, and then
  // again for whatever was still missing: the same socket, in series.
  it("asks the search relay once, beside the others — never again for what is missing", async () => {
    const other = { kind: 30023, pubkey: "a".repeat(64), identifier: "post", relays: [] as string[] };
    const post = {
      ...isis(),
      id: "2".repeat(64),
      kind: 30023,
      pubkey: other.pubkey,
      tags: [["d", "post"]],
    } as NostrEvent;
    requestAllMock.mockResolvedValueOnce([post]);
    const pending = fetchAddressableEvents([ptr, other], []);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    const filter = searchReqMock.mock.calls[0][0] as { kinds: number[]; authors: string[]; "#d": string[] };
    expect(filter.kinds).toEqual(expect.arrayContaining([30818, 30023]));
    expect(filter["#d"]).toEqual(expect.arrayContaining(["isis", "post"]));
    searchRelaySubject!.next({ type: "EOSE" });
    const map = await pending;
    expect([...map.keys()]).toEqual([`30023:${other.pubkey}:post`]);
    expect(searchReqMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the search relay as the last resort for relays named without it", async () => {
    requestAllMock.mockResolvedValue([]);
    const pending = fetchAddressableEvents([ptr], ["wss://named.example/"]);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    expect(requestAllMock.mock.calls[0][0]).toEqual(["wss://named.example/"]);
    searchRelaySubject!.next({ type: "EVENT", event: isis() });
    searchRelaySubject!.next({ type: "EOSE" });
    expect((await pending).has(`30818:${GITCITADEL}:isis`)).toBe(true);
    requestAllMock.mockReset();
    requestAllMock.mockResolvedValue([]);
  });

  // An naddr's relay hint is where the author said to look — but only a hint:
  // it joins the default set rather than replacing it (Vitor, 2026-09-24).
  it("asks an naddr's own relay hint beside the default relays", async () => {
    requestAllMock.mockResolvedValueOnce([isis()]);
    await fetchAddressableEvents([{ ...ptr, relays: ["wss://hint.example/"] }]);
    const asked = requestAllMock.mock.calls[0][0] as unknown as string[];
    expect(asked).toEqual(expect.arrayContaining([...BESIDES_SEARCH, "wss://hint.example/"]));
  });

  it("counts a copy the store holds — still asks the relays for a newer one, the search relay once", async () => {
    heldMock.mockImplementation((kind, pubkey, identifier) =>
      kind === 30818 && pubkey === GITCITADEL && identifier === "isis" ? isis() : undefined,
    );
    requestAllMock.mockResolvedValueOnce([]);
    const pending = fetchAddressableEvents([ptr]);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    searchRelaySubject!.next({ type: "EOSE" });
    const map = await pending;
    expect(map.get(`30818:${GITCITADEL}:isis`)?.content).toContain("Isis");
    expect(requestAllMock).toHaveBeenCalled();
    expect(searchReqMock).toHaveBeenCalledTimes(1);
  });

  it("a newer copy from the relays wins over the held one", async () => {
    heldMock.mockImplementation(() => isis());
    requestAllMock.mockResolvedValueOnce([{ ...isis(), id: "9".repeat(64), created_at: 2, content: "edited" }]);
    const map = await fetchAddressableEvents([ptr]);
    expect(map.get(`30818:${GITCITADEL}:isis`)?.content).toBe("edited");
  });

  // NIP-01: on a tie the lower id wins — not whichever relay answered first.
  it("two copies of the same age: the lower id wins, whichever arrived first", async () => {
    const high = { ...isis(), id: "f".repeat(64), content: "high" };
    const low = { ...isis(), id: "0".repeat(64), content: "low" };
    requestAllMock.mockResolvedValueOnce([high, low]);
    const map = await fetchAddressableEvents([ptr], ptr.relays, 6000, { askSearch: false });
    expect(map.get(`30818:${GITCITADEL}:isis`)?.content).toBe("low");
  });
});

// Words in a filter's search are what it asks for; the lens joins them rather than replacing them.
describe("fetchFromSearchRelayByFilters", () => {
  it("keeps a filter's search words, adding the include:spam lens", async () => {
    searchReqMock.mockClear();
    const pending = fetchFromSearchRelayByFilters([{ kinds: [31923], search: "Austin" }], 1000);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    expect((searchReqMock.mock.calls[0][0] as { search: string }).search).toBe("Austin include:spam");
    searchRelaySubject!.next({ type: "EOSE" });
    await pending;
  });
});

// The event page asks search on a leg of its own (services/eventPageLoad).
describe("fetchAddressableEvents for an event page", () => {
  it("askSearch: false leaves the search relay alone, even with the address missing", async () => {
    requestAllMock.mockResolvedValue([]);
    const map = await fetchAddressableEvents([ptr], ptr.relays, 1000, { askSearch: false });
    expect(map.size).toBe(0);
    expect(searchReqMock).not.toHaveBeenCalled();
  });

  it("newest: a first copy is not enough — every relay is waited out", async () => {
    requestAllMock.mockResolvedValue([isis()]);
    await fetchAddressableEvents([ptr], ptr.relays, 1000, { askSearch: false, newest: true });
    const opts = (requestAllMock.mock.calls[0] as unknown[])[3] as { enough: (m: Map<string, NostrEvent>) => boolean };
    expect(opts.enough(new Map([[isis().id, isis()]]))).toBe(false);
  });
});

// Deciding to push into search needs "search said no" told apart from "search said nothing".
describe("querySearchRelay", () => {
  it("is answered on EOSE", async () => {
    const pending = querySearchRelay([{ ids: ["1".repeat(64)] }], 1000);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    searchRelaySubject!.next({ type: "EVENT", event: isis() });
    searchRelaySubject!.next({ type: "EOSE" });
    expect(await pending).toEqual({ events: [isis()], answered: true });
  });

  it("is not answered when refused", async () => {
    const pending = querySearchRelay([{ ids: ["1".repeat(64)] }], 1000);
    await vi.waitFor(() => expect(searchReqMock).toHaveBeenCalled());
    searchRelaySubject!.next({ type: "CLOSED" });
    expect(await pending).toEqual({ events: [], answered: false });
  });
});
