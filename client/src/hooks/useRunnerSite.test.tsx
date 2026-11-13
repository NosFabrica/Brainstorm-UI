/**
 * The runner's site from the store: held copies show at once, a site for anyone else is
 * none, and a read no relay answered says so instead of checking forever.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const READER = "a".repeat(64);
const RUNNER = "b".repeat(64);

let held: { event: unknown; loading: boolean; settled: boolean };
const store = vi.hoisted(() => ({ pubkeys: [] as unknown[] }));
vi.mock("@/hooks/useStoreReplaceable", () => ({
  useStoreReplaceable: (_kind: number, pubkey: unknown) => {
    store.pubkeys.push(pubkey);
    return held;
  },
}));

const svc = vi.hoisted(() => ({ ask: vi.fn(), read: vi.fn(), reached: false }));
vi.mock("@/services/observerSite", async (o) => ({
  ...(await o<typeof import("@/services/observerSite")>()),
  askRunnerSite: (...a: unknown[]) => svc.ask(...a),
  readObserverSite: (...a: unknown[]) => svc.read(...a),
  runnerSiteReached: () => svc.reached,
}));
vi.mock("@/lib/eventStore", () => ({ eventStore: { getReplaceable: () => undefined } }));

import { useRunnerSite } from "./useRunnerSite";

const site = (p = READER, pubkey = RUNNER) => ({
  id: "s1",
  kind: 35128,
  pubkey,
  created_at: 1,
  tags: [
    ["d", "observer"],
    ["p", p],
    ["path", "/2026-11-12.html", "3".repeat(64)],
  ],
});

beforeEach(() => {
  held = { event: undefined, loading: true, settled: false };
  store.pubkeys = [];
  svc.ask.mockReset().mockResolvedValue(undefined);
  svc.read.mockReset().mockReturnValue(new Promise(() => {}));
  svc.reached = false;
});

describe("useRunnerSite", () => {
  it("is nothing without a runner, and asks for no one", () => {
    const { result } = renderHook(() => useRunnerSite(null, READER));
    expect(result.current).toBeNull();
    expect(store.pubkeys.every((p) => p === null)).toBe(true);
  });

  it("subscribes to the runner's site in the store", () => {
    renderHook(() => useRunnerSite(RUNNER, READER));
    expect(store.pubkeys).toContain(RUNNER);
  });

  it("is checking while the first ask is out", () => {
    const { result } = renderHook(() => useRunnerSite(RUNNER, READER));
    expect(result.current).toEqual({ status: "checking" });
  });

  it("says it failed when the ask settled and no relay answered", () => {
    held = { event: undefined, loading: false, settled: true };
    const { result } = renderHook(() => useRunnerSite(RUNNER, READER));
    expect(result.current).toEqual({ status: "failed" });
  });

  it("is an empty site once a relay answered there is none", () => {
    held = { event: undefined, loading: false, settled: true };
    svc.reached = true;
    const { result } = renderHook(() => useRunnerSite(RUNNER, READER));
    expect(result.current).toMatchObject({ status: "ready", view: { editions: [], exists: false } });
  });

  it("shows a held site at once, then its index", async () => {
    held = { event: site(), loading: false, settled: false };
    svc.read.mockResolvedValue({
      editions: [{ day: "2026-11-12", path: "/2026-11-12.html", sha256: "3".repeat(64), headline: "Lead" }],
      servers: ["https://files.example"],
      exists: true,
      settled: true,
    });
    const { result } = renderHook(() => useRunnerSite(RUNNER, READER));
    expect(result.current).toMatchObject({ status: "ready", view: { exists: true } });
    expect(result.current?.status === "ready" && result.current.view.editions.map((e) => e.day)).toEqual([
      "2026-11-12",
    ]);
    await waitFor(() =>
      expect(result.current?.status === "ready" && result.current.view.editions[0].headline).toBe("Lead"),
    );
    // Its files are on the reader's servers.
    expect(svc.read.mock.calls[0][1]).toBe(READER);
  });

  it("a site for another reader, or by another key, is none", () => {
    held = { event: site("c".repeat(64)), loading: false, settled: true };
    const { result } = renderHook(() => useRunnerSite(RUNNER, READER));
    expect(result.current).toEqual({ status: "failed" });
    held = { event: site(READER, "c".repeat(64)), loading: false, settled: true };
    svc.reached = true;
    const { result: other } = renderHook(() => useRunnerSite(RUNNER, READER));
    expect(other.current).toMatchObject({ status: "ready", view: { exists: false } });
  });
});
