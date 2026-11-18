/**
 * An event's page asks the search relay and the pointer's relays at once, shows
 * whichever finds it first, and hands search what it lacks or holds older.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";

type SearchAnswer = { events: NostrEvent[]; answered: boolean };
const search = vi.fn<(filters: Record<string, unknown>[], ms: number) => Promise<SearchAnswer>>();
const addressable = vi.fn<(...args: unknown[]) => Promise<Map<string, NostrEvent>>>();
vi.mock("@/services/nostr", () => ({
  querySearchRelay: (filters: Record<string, unknown>[], ms: number) => search(filters, ms),
  fetchAddressableEvents: (...args: unknown[]) => addressable(...args),
}));
const requestAll = vi.fn<(relays: string[], filter: unknown, ms: number, opts?: unknown) => Promise<NostrEvent[]>>();
vi.mock("@/lib/relayRequest", async (orig) => ({
  ...(await orig<typeof import("@/lib/relayRequest")>()),
  requestAll: (relays: string[], filter: unknown, ms: number, opts?: unknown) => requestAll(relays, filter, ms, opts),
}));
const seed = vi.fn<(event: NostrEvent) => void>();
vi.mock("@/services/searchSeed", async (orig) => ({
  ...(await orig<typeof import("@/services/searchSeed")>()),
  seedSearchRelay: (event: NostrEvent) => seed(event),
}));

import { loadAddressForPage, loadEventForPage } from "./eventPageLoad";
import { SEARCH_RELAY } from "@/lib/relays";

const PK = "f".repeat(64);
const ID = "a".repeat(64);
const HINT = "wss://hint.example/";
const note = (over: Partial<NostrEvent> = {}): NostrEvent =>
  ({ id: ID, pubkey: PK, kind: 1, tags: [], content: "hi", created_at: 10, sig: "s", ...over }) as NostrEvent;
const article = (id: string, created_at: number): NostrEvent =>
  note({ id, kind: 30023, tags: [["d", "post"]], created_at });
const ADDR = { kind: 30023, pubkey: PK, identifier: "post", relays: [HINT] };

/** A promise and the hand that settles it, so a test decides which leg answers first. */
function later<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadEventForPage", () => {
  it("asks the hint, the defaults and search at once — search on its own leg, with its lens", async () => {
    search.mockResolvedValue({ events: [note()], answered: true });
    requestAll.mockResolvedValue([note()]);
    await loadEventForPage({ id: ID, relays: [HINT] });
    expect(search).toHaveBeenCalledWith([{ ids: [ID], limit: 1 }], expect.any(Number));
    const relays = requestAll.mock.calls[0][0];
    expect(relays[0]).toBe(HINT);
    expect(relays).not.toContain(SEARCH_RELAY);
  });

  it("shows the hint's copy without waiting for search", async () => {
    const searchLeg = later<SearchAnswer>();
    search.mockReturnValue(searchLeg.promise);
    requestAll.mockResolvedValue([note()]);
    expect(await loadEventForPage({ id: ID, relays: [HINT] })).toEqual([note()]);
    searchLeg.resolve({ events: [], answered: true });
    await settle();
    expect(seed).toHaveBeenCalledWith(note());
  });

  it("does not push what search already has", async () => {
    search.mockResolvedValue({ events: [note()], answered: true });
    requestAll.mockResolvedValue([note()]);
    await loadEventForPage({ id: ID, relays: [HINT] });
    await settle();
    expect(seed).not.toHaveBeenCalled();
  });

  it("does not push when search refused or timed out", async () => {
    search.mockResolvedValue({ events: [], answered: false });
    requestAll.mockResolvedValue([note()]);
    await loadEventForPage({ id: ID, relays: [HINT] });
    await settle();
    expect(seed).not.toHaveBeenCalled();
  });

  it("answers from search when the relays have nothing, and empty when no one does", async () => {
    search.mockResolvedValueOnce({ events: [note()], answered: true });
    requestAll.mockResolvedValueOnce([]);
    expect(await loadEventForPage({ id: ID })).toEqual([note()]);
    search.mockResolvedValueOnce({ events: [], answered: true });
    requestAll.mockResolvedValueOnce([]);
    expect(await loadEventForPage({ id: ID })).toEqual([]);
    await settle();
    expect(seed).not.toHaveBeenCalled();
  });
});

describe("loadAddressForPage", () => {
  const coord = `30023:${PK}:post`;

  it("asks search for the address and the relays with every one waited out, search not among them", async () => {
    search.mockResolvedValue({ events: [], answered: true });
    addressable.mockResolvedValue(new Map());
    await loadAddressForPage(ADDR);
    expect(search).toHaveBeenCalledWith([{ kinds: [30023], authors: [PK], "#d": ["post"] }], expect.any(Number));
    const [[ptr], , , opts] = addressable.mock.calls[0] as [{ relays: string[] }[], unknown, unknown, unknown];
    expect(ptr.relays[0]).toBe(HINT);
    expect(ptr.relays).not.toContain(SEARCH_RELAY);
    expect(opts).toEqual({ askSearch: false, newest: true });
  });

  it("pushes a newer version the relays found", async () => {
    const older = article("1".repeat(64), 10);
    const newer = article("2".repeat(64), 20);
    search.mockResolvedValue({ events: [older], answered: true });
    addressable.mockResolvedValue(new Map([[coord, newer]]));
    await loadAddressForPage(ADDR);
    await settle();
    expect(seed).toHaveBeenCalledWith(newer);
  });

  it("pushes an address search has no copy of", async () => {
    const found = article("2".repeat(64), 20);
    search.mockResolvedValue({ events: [], answered: true });
    addressable.mockResolvedValue(new Map([[coord, found]]));
    expect(await loadAddressForPage(ADDR)).toEqual([found]);
    await settle();
    expect(seed).toHaveBeenCalledWith(found);
  });

  it("leaves search alone when its copy is the newest", async () => {
    const older = article("1".repeat(64), 10);
    const newer = article("2".repeat(64), 20);
    search.mockResolvedValue({ events: [newer], answered: true });
    addressable.mockResolvedValue(new Map([[coord, older]]));
    await loadAddressForPage(ADDR);
    await settle();
    expect(seed).not.toHaveBeenCalled();
  });
});
