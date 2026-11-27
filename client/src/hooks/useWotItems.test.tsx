// @vitest-environment jsdom
/**
 * Who is in the reader's web of trust renders from the EventStore while the
 * relays are asked (docs/adr/0005): the observer's 10040, then its scorer's
 * ranks keyed on it, the house's when they name none. A rank that lands
 * later — a newer assertion — moves the author.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { queryWrapper } from "@/test/utils";

const HOUSE = "0".repeat(64);
const SCORER = "5".repeat(64);
const io = vi.hoisted(() => ({
  ranks: vi.fn(async (_ref: unknown, _pubkeys: string[]): Promise<unknown[]> => []),
  trustList: vi.fn(async (_pubkey: string): Promise<unknown> => undefined),
  viewer: null as string | null,
}));
vi.mock("@/services/wotRanks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/wotRanks")>()),
  readAuthorRanks: (ref: unknown, pubkeys: string[]) => io.ranks(ref, pubkeys),
}));
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: (pk: string) => io.trustList(pk) }));
vi.mock("@/services/trustSource", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/trustSource")>()),
  resolveHouseObserver: async () => HOUSE,
}));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => [io.viewer ? "mywot" : "house"] }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => (io.viewer ? { pubkey: io.viewer } : null),
}));

import { useWotItems } from "./useWotItems";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  __resetAsks();
  io.viewer = null;
  io.ranks.mockReset().mockResolvedValue([]);
  io.trustList.mockReset().mockResolvedValue(undefined);
});

let n = 0;
const id = () => (++n).toString(16).padStart(64, "0");
const trustList = (owner: string) =>
  ({
    id: id(),
    kind: 10040,
    pubkey: owner,
    created_at: 5,
    content: "",
    sig: "s",
    tags: [["30382:rank", SCORER, "wss://scores.example"]],
  }) as NostrEvent;
const rank = (subject: string, value: number, at: number) =>
  ({
    id: id(),
    kind: 30382,
    pubkey: SCORER,
    created_at: at,
    content: "",
    sig: "s",
    tags: [
      ["d", subject],
      ["rank", String(value)],
    ],
  }) as NostrEvent;

describe("useWotItems", () => {
  it("ranks through the house's scorer, and moves an author when a newer rank lands", async () => {
    const author = "a".repeat(64);
    io.trustList.mockImplementation(async (pk) => (pk === HOUSE ? eventStore.add(trustList(HOUSE)) : undefined));
    io.ranks.mockImplementation(async () => [eventStore.add(rank(author, 1, 10))]);
    const items = [{ pubkey: author }];
    const { result } = renderHook(() => useWotItems(items), { wrapper: queryWrapper() });
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toMatchObject({ trusted: [], outside: items, source: "house", observer: "house" });
    expect(io.ranks).toHaveBeenCalledWith({ taPubkey: SCORER, relay: "wss://scores.example" }, [author]);

    act(() => {
      eventStore.add(rank(author, 40, 20));
    });
    await waitFor(() => expect(result.current.trusted).toEqual(items));
  });

  it("falls back to the house when the reader names no scorer of their own", async () => {
    io.viewer = "b".repeat(64);
    const author = "c".repeat(64);
    io.trustList.mockImplementation(async (pk) => (pk === HOUSE ? eventStore.add(trustList(HOUSE)) : undefined));
    io.ranks.mockImplementation(async () => [eventStore.add(rank(author, 50, 10))]);
    const { result } = renderHook(() => useWotItems([{ pubkey: author }]), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toMatchObject({ source: "house", observer: io.viewer });
    expect(result.current.trusted).toHaveLength(1);
    expect(io.trustList).toHaveBeenCalledWith(io.viewer);
  });

  it("ranks through the reader's own scorer when they name one, without asking the house", async () => {
    io.viewer = "b".repeat(64);
    const author = "d".repeat(64);
    io.trustList.mockImplementation(async (pk) => (pk === io.viewer ? eventStore.add(trustList(pk)) : undefined));
    io.ranks.mockImplementation(async () => [eventStore.add(rank(author, 50, 10))]);
    const { result } = renderHook(() => useWotItems([{ pubkey: author }]), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toMatchObject({ source: "observer", observer: io.viewer });
    expect(result.current.trusted).toHaveLength(1);
    expect(io.ranks).toHaveBeenCalledWith({ taPubkey: SCORER, relay: "wss://scores.example" }, [author]);
    expect(io.trustList).not.toHaveBeenCalledWith(HOUSE);
  });

  it("ranks nobody, and asks for no ranks, when no scorer is named at all", async () => {
    const author = "e".repeat(64);
    const items = [{ pubkey: author }];
    const { result } = renderHook(() => useWotItems(items), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current).toMatchObject({ trusted: [], outside: items, source: null });
    expect(io.ranks).not.toHaveBeenCalled();
  });
});
