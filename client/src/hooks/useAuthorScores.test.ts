// @vitest-environment jsdom
/** A face whose lookup failed stays "loading", and is asked about again. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TrustSignals } from "@/services/api";

const getTrustSignals = vi.fn<(pubkeys: string[]) => Promise<Map<string, TrustSignals> | null>>();
vi.mock("@/services/api", () => ({ apiClient: { getTrustSignals: (pks: string[]) => getTrustSignals(pks) } }));

import { useAuthorScores, __resetAuthorSignals } from "./useAuthorScores";

const A = "a".repeat(64);

beforeEach(() => {
  vi.useFakeTimers();
  getTrustSignals.mockReset();
  __resetAuthorSignals();
});
afterEach(() => vi.useRealTimers());

describe("useAuthorScores", () => {
  it("keeps a failed lookup loading, not unrated, and retries it", async () => {
    getTrustSignals
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Map([[A, { influence: 0.4, flagged: false }]]));
    const { result } = renderHook(() => useAuthorScores([A], { now: true }));

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(getTrustSignals).toHaveBeenCalledTimes(1);
    expect(result.current(A)).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(getTrustSignals).toHaveBeenCalledTimes(2);
    expect(result.current(A)).toBe(0.4);
  });

  it("gives up after a few failures", async () => {
    getTrustSignals.mockResolvedValue(null);
    renderHook(() => useAuthorScores([A], { now: true }));
    for (let i = 0; i < 6; i++) await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(getTrustSignals).toHaveBeenCalledTimes(3);
  });
});
