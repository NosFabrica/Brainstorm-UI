// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DEFAULT_SUBSCRIPTION, type Subscription } from "@/services/subscription";

const fetchSubscription = vi.fn<() => Promise<Subscription>>();
vi.mock("@/services/subscription", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/subscription")>()),
  fetchSubscription: () => fetchSubscription(),
}));
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => session.signedIn }));

import { useSubscription } from "./useSubscription";

const PRIORITY: Subscription = {
  ...DEFAULT_SUBSCRIPTION,
  policy: { id: 2, name: "Priority", scheduleIntervalSeconds: 604_800, isDefault: false },
  status: "active",
};

// The app's own default — one attempt, and it's final — so what's under test
// is the hook's override, not a friendlier test client.
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Let react-query's retry backoff play out. */
const settle = () => act(() => vi.advanceTimersByTimeAsync(10_000));

describe("useSubscription — a failed read is not an answer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchSubscription.mockReset();
    session.signedIn = true;
  });
  afterEach(() => vi.useRealTimers());

  // Pods restart during a rollout, so the likeliest moment for one read to
  // fail is exactly when people check. One blip must not make a subscriber Free.
  it("retries a failed first read, so a paying subscriber isn't reported as free", async () => {
    fetchSubscription
      .mockRejectedValueOnce(new Error("Failed to fetch subscription (502)"))
      .mockResolvedValue(PRIORITY);
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await settle();

    expect(result.current.isPaid).toBe(true);
    expect(fetchSubscription).toHaveBeenCalledTimes(2);
  });

  // After the retries, "we couldn't find out" has to be a state of its own:
  // folded into the default, it reads as Free.
  it("says it couldn't find out when every attempt fails, rather than answering free", async () => {
    fetchSubscription.mockRejectedValue(new Error("Failed to fetch subscription (503)"));
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await settle();

    expect(fetchSubscription).toHaveBeenCalledTimes(3);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(true);
    expect(result.current.isFree).toBe(false);
  });

  it("is neither free nor paid while the first read is still out", () => {
    fetchSubscription.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubscription(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFree).toBe(false);
    expect(result.current.isPaid).toBe(false);
  });

  it("knows a free holder is free", async () => {
    fetchSubscription.mockResolvedValue({
      ...DEFAULT_SUBSCRIPTION,
      policy: { id: 1, name: "Free", scheduleIntervalSeconds: 5_184_000, isDefault: true },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await settle();

    expect(result.current.isFree).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  // Signed out, nothing is asked and nothing is bought, so pitches are fair game.
  it("treats a signed-out visitor as free without asking", async () => {
    session.signedIn = false;
    const { result } = renderHook(() => useSubscription(), { wrapper });

    await settle();

    expect(fetchSubscription).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFree).toBe(true);
  });

  // A refocus refetch that fails keeps the answer it had.
  it("keeps the last answer when a later refetch fails", async () => {
    fetchSubscription
      .mockResolvedValueOnce(PRIORITY)
      .mockRejectedValue(new Error("Failed to fetch subscription (502)"));
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await settle();

    act(() => result.current.refetch());
    await settle();

    expect(result.current.isPaid).toBe(true);
    expect(result.current.isError).toBe(false);
  });
});
