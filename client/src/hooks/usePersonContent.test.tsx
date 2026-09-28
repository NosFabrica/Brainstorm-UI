/**
 * Chips for a handful of people at once — the rows of a typeahead — filling
 * in as each answer lands, each person asked once for the session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { PersonContent } from "@/lib/personContent";

const settledMap = new Map<string, PersonContent>();
const pending = new Map<string, { resolve: (c: PersonContent) => void; reject: (e: Error) => void }>();
const fetchMock = vi.fn(
  (pk: string) =>
    new Promise<PersonContent>((resolve, reject) => {
      pending.set(pk, {
        resolve: (c) => {
          settledMap.set(pk, c);
          resolve(c);
        },
        reject,
      });
    }),
);
vi.mock("@/services/personContent", () => ({
  fetchPersonContent: (pk: string) => fetchMock(pk),
  peekPersonContent: (pk: string) => settledMap.get(pk),
}));

import { usePersonContent } from "./usePersonContent";

const A = "a".repeat(64);
const B = "b".repeat(64);
const shop: PersonContent = { chips: [{ key: "shop", label: "Shop", tab: "shop", liveNow: false }] };

beforeEach(() => {
  settledMap.clear();
  pending.clear();
  fetchMock.mockClear();
});

describe("usePersonContent", () => {
  it("fills in as answers land, keyed as asked", async () => {
    const { result } = renderHook(() => usePersonContent([A, B]));
    expect(result.current.size).toBe(2);
    expect(result.current.get(A)).toBeUndefined();
    expect(result.current.get(B)).toBeUndefined();
    await waitFor(() => expect(pending.has(A)).toBe(true));
    pending.get(A)!.resolve(shop);
    await waitFor(() => expect(result.current.get(A)?.chips[0].key).toBe("shop"));
    expect(result.current.get(B)).toBeUndefined();
    pending.get(B)!.resolve({ chips: [] });
    await waitFor(() => expect(result.current.get(B)).toEqual({ chips: [] }));
  });

  it("asks each person once across re-renders and duplicates", async () => {
    const { rerender } = renderHook(({ pks }) => usePersonContent(pks), { initialProps: { pks: [A, A, B] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender({ pks: [A, B] });
    rerender({ pks: [B, A] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a remembered answer paints on the first render", () => {
    settledMap.set(A, shop);
    const { result } = renderHook(() => usePersonContent([A]));
    expect(result.current.get(A)).toBe(shop);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed ask leaves the slot empty, quietly", async () => {
    const { result } = renderHook(() => usePersonContent([A]));
    await waitFor(() => expect(pending.has(A)).toBe(true));
    pending.get(A)!.reject(new Error("no answer"));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.get(A)).toBeUndefined();
  });

  it("empty keys are skipped", () => {
    renderHook(() => usePersonContent(["", A]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(A);
  });
});
