/**
 * The day tabs draw from what the store holds before any relay answers, and "no papers"
 * is said only once a relay has answered: a silence is never an empty site.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const PK = "a".repeat(64);
const H = (c: string) => c.repeat(64);

let held: { event: unknown; loading: boolean; settled: boolean };
vi.mock("@/hooks/useStoreReplaceable", () => ({ useStoreReplaceable: () => held }));

const svc = vi.hoisted(() => ({
  ask: vi.fn(),
  read: vi.fn(),
  reached: false,
}));
vi.mock("@/services/observerSite", async (o) => ({
  ...(await o<typeof import("@/services/observerSite")>()),
  askObserverSite: (...a: unknown[]) => svc.ask(...a),
  readObserverSite: (...a: unknown[]) => svc.read(...a),
  observerSiteReached: () => svc.reached,
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { getReplaceable: () => undefined } }));

import { useObserverSite } from "./useObserverSite";

const manifest = {
  id: "m1",
  kind: 35128,
  pubkey: PK,
  created_at: 1,
  tags: [
    ["d", "observer"],
    ["path", "/2026-11-10.html", H("2")],
    ["path", "/2026-11-09.html", H("1")],
    ["server", "https://files.example"],
  ],
};

beforeEach(() => {
  held = { event: undefined, loading: true, settled: false };
  svc.ask.mockReset().mockResolvedValue(undefined);
  svc.read.mockReset().mockReturnValue(new Promise(() => {}));
  svc.reached = false;
});

describe("useObserverSite", () => {
  it("draws the day tabs from the held manifest at once, before its index is read", () => {
    held = { event: manifest, loading: false, settled: false };
    const { result } = renderHook(() => useObserverSite(PK));
    expect(result.current?.editions.map((e) => e.day)).toEqual(["2026-11-10", "2026-11-09"]);
    expect(result.current?.servers).toEqual(["https://files.example"]);
    expect(result.current?.exists).toBe(true);
  });

  it("takes the index's descriptions once they are read", async () => {
    held = { event: manifest, loading: false, settled: false };
    svc.read.mockResolvedValue({
      editions: [{ day: "2026-11-10", path: "/2026-11-10.html", sha256: H("2"), headline: "Relays" }],
      servers: ["https://files.example"],
      exists: true,
    });
    const { result } = renderHook(() => useObserverSite(PK));
    await waitFor(() => expect(result.current?.editions[0].headline).toBe("Relays"));
  });

  it("is unknown, not empty, while no relay has answered", () => {
    held = { event: undefined, loading: false, settled: true };
    const { result } = renderHook(() => useObserverSite(PK));
    expect(result.current).toBeNull();
  });

  it("is empty once a relay answered that there is no site", () => {
    held = { event: undefined, loading: false, settled: true };
    svc.reached = true;
    const { result } = renderHook(() => useObserverSite(PK));
    expect(result.current).toEqual({ editions: [], servers: [], exists: false });
  });

  it("asks again after a while away", async () => {
    // Only the clock: the resume listener reads `Date.now` as it was when it subscribed.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      held = { event: manifest, loading: false, settled: true };
      renderHook(() => useObserverSite(PK));
      const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      vi.setSystemTime(Date.now() + 120_000);
      hidden.mockReturnValue("visible");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      hidden.mockRestore();
      expect(svc.ask).toHaveBeenCalledWith(PK);
    } finally {
      vi.useRealTimers();
    }
  });
});
