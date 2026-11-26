// @vitest-environment jsdom
/**
 * A place's (and a book's) reviews, and their star value, render from the
 * EventStore while the relays are asked (docs/adr/0005), not from a
 * react-query snapshot: a newer record or a removal that lands later —
 * the reader's own among them — shows, and each lens is its owner's 10040
 * and its scorer's ranks, read the same way.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { __resetAsks } from "@/lib/askOnce";
import { queryWrapper } from "@/test/utils";

const io = vi.hoisted(() => ({
  reviews: vi.fn(async (_addresses: string[]): Promise<unknown[]> => []),
  ranks: vi.fn(async (): Promise<unknown[]> => []),
  trustList: vi.fn(async (_pubkey: string): Promise<unknown> => undefined),
}));
vi.mock("@/services/placeReviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/placeReviews")>()),
  readPlaceReviewEvents: (addresses: string[]) => io.reviews(addresses),
  readLensRanks: () => io.ranks(),
}));
vi.mock("@/services/bookReviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/bookReviews")>()),
  readBookReviewEvents: (address: string) => io.reviews([address]),
}));
vi.mock("@/services/trustAnchor", () => ({ askTrustProviderList: (pk: string) => io.trustList(pk) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => null }));

import { usePlaceRating, usePlaceReviews, usePlacesRatings } from "./usePlaceReviews";
import { useBookReviews } from "./useBookReviews";

const realVerify = eventStore.verifyEvent;
beforeAll(() => {
  eventStore.verifyEvent = undefined;
});
afterAll(() => {
  eventStore.verifyEvent = realVerify;
});
beforeEach(() => {
  __resetAsks();
  io.reviews.mockReset().mockResolvedValue([]);
  io.ranks.mockReset().mockResolvedValue([]);
  io.trustList.mockReset().mockResolvedValue(undefined);
});

const CURATOR = "c".repeat(64);
const SCORER = "5".repeat(64);
let n = 0;
const id = () => (++n).toString(16).padStart(64, "0");
const placeOf = (d: string) => ({ id: id(), kind: 39999, pubkey: CURATOR, tags: [["d", d]] });
const now = () => Math.floor(Date.now() / 1000);
const record = (address: string, pubkey: string, stars: number, at = now() - 100, mark = "place") =>
  ({
    id: id(),
    kind: 34259,
    pubkey,
    created_at: at,
    content: `${stars} stars`,
    sig: "s",
    tags: [
      ["d", `${mark}:${address}`],
      ["a", address],
      ["m", mark],
      ["s", String(stars)],
    ],
  }) as NostrEvent;
const removal = (of: NostrEvent) =>
  ({
    id: id(),
    kind: 5,
    pubkey: of.pubkey,
    created_at: of.created_at + 1,
    content: "",
    sig: "s",
    tags: [
      ["e", of.id],
      ["a", `34259:${of.pubkey}:${of.tags[0][1]}`],
      ["k", "34259"],
    ],
  }) as NostrEvent;

describe("usePlaceReviews", () => {
  it("renders the stored reviews, then a newer one and a removal that land later", async () => {
    const place = placeOf("tacos");
    const address = `39999:${CURATOR}:tacos`;
    const alice = "a".repeat(64);
    const first = record(address, alice, 3);
    io.reviews.mockImplementation(async () => [eventStore.add(first)]);
    const { result } = renderHook(() => usePlaceReviews(place));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.reviews.map((r) => r.rating)).toEqual([3]));
    expect(result.current.pending).toBe(false);
    expect(io.reviews).toHaveBeenCalledWith([address]);

    // Their edit — as their own publish would add it — takes their place: one person, one review.
    const edit = record(address, alice, 5, first.created_at + 10);
    act(() => {
      eventStore.add(edit);
    });
    await waitFor(() => expect(result.current.reviews.map((r) => r.rating)).toEqual([5]));

    // Their removal reaching the store takes the review off the page.
    act(() => {
      eventStore.add(removal(edit));
    });
    await waitFor(() => expect(result.current.reviews).toEqual([]));
  });

  it("honours a removal the ask answered with, for a record a relay still hands back", async () => {
    const place = placeOf("ramen");
    const address = `39999:${CURATOR}:ramen`;
    const bob = "b".repeat(64);
    const kept = record(address, bob, 4);
    // A removal by `e` alone: what the contract counts (its check J) and the store's NIP-09 check of an addressable doesn't.
    const byId = { ...removal(kept), tags: [["e", kept.id]] } as NostrEvent;
    io.reviews.mockImplementation(async () => [kept, byId]);
    const { result } = renderHook(() => usePlaceReviews(place));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.reviews).toEqual([]);
  });
});

describe("useBookReviews", () => {
  it("reads a book's reviews (marked book) from the store", async () => {
    const book = placeOf("dune");
    const address = `39999:${CURATOR}:dune`;
    const { result } = renderHook(() => useBookReviews(book));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.reviews).toEqual([]);
    act(() => {
      eventStore.add(record(address, "d".repeat(64), 4, now() - 50, "book"));
    });
    await waitFor(() => expect(result.current.reviews.map((r) => r.rating)).toEqual([4]));
  });
});

const trustList = (owner: string, at: number) =>
  ({
    id: id(),
    kind: 10040,
    pubkey: owner,
    created_at: at,
    content: "",
    sig: "s",
    tags: [["30382:rank", SCORER, "wss://scores.example"]],
  }) as NostrEvent;
const rank = (subject: string, value: number, at = 10) =>
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

describe("usePlaceRating", () => {
  it("weighs through the curator's lens: its 10040, then its scorer's ranks, from the store", async () => {
    const curator = "e".repeat(64);
    const place = { ...placeOf("pho"), pubkey: curator };
    const reviewer = "1".repeat(64);
    const reviews = [{ id: "r", pubkey: reviewer, at: 1, text: "", photos: [], price: null, paid: null, rating: 4 }];
    io.trustList.mockImplementation(async () => eventStore.add(trustList(curator, 5)));
    io.ranks.mockImplementation(async () => [eventStore.add(rank(reviewer, 80))]);
    const { result } = renderHook(() => usePlaceRating(place, reviews), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current).toEqual({ value: 4, counted: 1, lens: "curator" }));
    expect(io.trustList).toHaveBeenCalledWith(curator);
  });

  it("is null while the curator names no scorer", async () => {
    const place = { ...placeOf("bbq"), pubkey: "f".repeat(64) };
    const reviews = [
      { id: "r", pubkey: "2".repeat(64), at: 1, text: "", photos: [], price: null, paid: null, rating: 5 },
    ];
    const { result } = renderHook(() => usePlaceRating(place, reviews), { wrapper: queryWrapper() });
    await waitFor(() => expect(io.trustList).toHaveBeenCalled());
    expect(result.current).toBeNull();
    expect(io.ranks).not.toHaveBeenCalled();
  });
});

describe("usePlacesRatings", () => {
  it("counts each place's reviews from the store, and picks up one that lands later", async () => {
    const curator = "9".repeat(64);
    const address = `39999:${curator}:noodles`;
    const { result } = renderHook(() => usePlacesRatings([address], curator), { wrapper: queryWrapper() });
    await waitFor(() => expect(io.reviews).toHaveBeenCalledWith([address]));
    expect(result.current(address).count).toBe(0);
    act(() => {
      eventStore.add(record(address, "3".repeat(64), 2));
    });
    await waitFor(() => expect(result.current(address).count).toBe(1));
  });
});
