import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const fetchRatesMock = vi.fn<() => Promise<{ USD: number } | null>>();
vi.mock("@/lib/exchangeRate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/exchangeRate")>()),
  fetchBtcRates: () => fetchRatesMock(),
}));

import { useBtcRates } from "./useBtcRates";

describe("useBtcRates — the page's one exchange rate", () => {
  beforeEach(() => fetchRatesMock.mockReset());

  it("asks once when enabled and settles on the rates", async () => {
    fetchRatesMock.mockResolvedValue({ USD: 100_000 });
    const { result } = renderHook(() => useBtcRates(true));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ USD: 100_000 }));
    expect(fetchRatesMock).toHaveBeenCalledTimes(1);
  });

  it("never asks when disabled", () => {
    const { result } = renderHook(() => useBtcRates(false));
    expect(result.current).toBeNull();
    expect(fetchRatesMock).not.toHaveBeenCalled();
  });

  it("an outage stays null, quietly", async () => {
    fetchRatesMock.mockResolvedValue(null);
    const { result } = renderHook(() => useBtcRates(true));
    await waitFor(() => expect(fetchRatesMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
