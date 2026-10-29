/**
 * A list is read from the index and the hub at once, and the answers merged (services/listReads):
 * the index can lag, and the hub can be slow. Whichever answers first is handed over at once
 * (`onFirst`) — a list of heavy records, books, shows in about a second instead of waiting for the
 * slower relay — and the merged answer still follows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const relays = vi.hoisted(() => ({
  index: null as null | ((events: unknown[]) => void),
  hub: null as null | ((events: unknown[]) => void),
}));
vi.mock("@/services/nostr", () => ({
  fetchFromSearchRelayByFilters: () => new Promise((resolve) => (relays.index = resolve)),
  fetchEventsByFilter: () => new Promise((resolve) => (relays.hub = resolve)),
}));
vi.mock("@/config/dictionary", () => ({ dictionaryRelays: () => ["wss://hub.example"] }));

import { readListEvents } from "./listReads";

const ev = (id: string) => ({
  id,
  kind: 39999,
  pubkey: "a".repeat(64),
  created_at: 1,
  content: "",
  // A real item says something (a blank one is dropped as deleted, lib/blankEvent).
  tags: [
    ["d", id],
    ["title", `Book ${id}`],
  ],
  sig: "",
});

beforeEach(() => {
  relays.index = null;
  relays.hub = null;
});

describe("readListEvents", () => {
  it("hands over the first relay's answer at once, then the two merged", async () => {
    const first = vi.fn();
    const all = readListEvents([{ kinds: [39999] }], 8000, undefined, first);
    await vi.waitFor(() => expect(relays.hub).not.toBeNull());
    relays.hub!([ev("b1"), ev("shared")]);
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(first.mock.calls[0][0].map((e: { id: string }) => e.id)).toEqual(["b1", "shared"]);
    relays.index!([ev("shared"), ev("i1")]);
    expect((await all).map((e) => e.id).sort()).toEqual(["b1", "i1", "shared"]);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("hands nothing over early from a relay that answers with nothing", async () => {
    const first = vi.fn();
    const all = readListEvents([{ kinds: [39999] }], 8000, undefined, first);
    await vi.waitFor(() => expect(relays.index).not.toBeNull());
    relays.index!([]);
    relays.hub!([ev("b1")]);
    await all;
    expect(first.mock.calls.map((c) => c[0].length)).toEqual([1]);
  });
});
