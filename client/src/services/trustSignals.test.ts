// @vitest-environment jsdom
/**
 * Lookups gather before they go. Results arrive in bursts, and on a slow
 * connection those bursts are spread out — a fixed 50ms window sent eighteen
 * requests for one page on staging at 3G.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustSignals } from "@/services/api";

const getTrustSignals = vi.fn<(pubkeys: string[]) => Promise<Map<string, TrustSignals>>>(
  () => Promise.resolve(new Map()),
);
vi.mock("@/services/api", () => ({ apiClient: { getTrustSignals: (pks: string[]) => getTrustSignals(pks) } }));

import { lookupTrustSignals, __resetTrustSignals } from "./trustSignals";
import { __resetConnectionSpeed } from "@/lib/connection";

const pk = (n: number) => String(n).padStart(64, "0");
const setConnection = (value: { effectiveType?: string } | undefined) => {
  Object.defineProperty(window.navigator, "connection", { value, configurable: true });
  __resetConnectionSpeed();
};

beforeEach(() => {
  vi.useFakeTimers();
  getTrustSignals.mockClear();
  __resetTrustSignals();
  setConnection(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  setConnection(undefined);
});

describe("gathering lookups", () => {
  it("asks once for everyone who turns up in the same window", async () => {
    void lookupTrustSignals(pk(1));
    void lookupTrustSignals(pk(2));
    await vi.advanceTimersByTimeAsync(60);
    expect(getTrustSignals).toHaveBeenCalledTimes(1);
    expect(getTrustSignals.mock.calls[0][0]).toHaveLength(2);
  });

  it("waits longer on a slow connection, where the bursts are further apart", async () => {
    setConnection({ effectiveType: "3g" });
    void lookupTrustSignals(pk(1));
    await vi.advanceTimersByTimeAsync(400);
    // A 50ms window would already have gone.
    expect(getTrustSignals).not.toHaveBeenCalled();
    void lookupTrustSignals(pk(2));
    await vi.advanceTimersByTimeAsync(1100);
    expect(getTrustSignals).toHaveBeenCalledTimes(1);
    expect(getTrustSignals.mock.calls[0][0]).toHaveLength(2);
  });

  it("goes anyway once the ceiling is reached, however long the page keeps arriving", async () => {
    setConnection({ effectiveType: "3g" });
    for (let i = 0; i < 12; i++) {
      void lookupTrustSignals(pk(i));
      await vi.advanceTimersByTimeAsync(600); // a new burst, forever
    }
    // Without a ceiling the window would keep being pushed back.
    expect(getTrustSignals).toHaveBeenCalled();
    expect(getTrustSignals.mock.calls[0][0].length).toBeGreaterThan(2);
  });
});
