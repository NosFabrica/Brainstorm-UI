import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import type { Subscription } from "@/services/subscription";

/**
 * The poll is the only thing standing between a Lightning payer and a page that
 * never updates: the redirect covers the fast path, the focus refetch is a
 * backstop for an abandoned tab, and everything in between — up to ten minutes
 * of `pending` — is this file.
 *
 * It keeps module-level state so one poll serves every surface, which means a
 * test that leaves it running would silently disable the next one (the
 * re-entrancy guard would return early). So each test imports a fresh copy.
 */
const refreshSubscription = vi.fn();
vi.mock("@/services/subscription", () => ({
  refreshSubscription: () => refreshSubscription(),
}));

type Poll = typeof import("./checkoutPoll");
const freshModule = async (): Promise<Poll> => {
  vi.resetModules();
  return import("./checkoutPoll");
};

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  policy: { id: 1, name: "Free", scheduleIntervalSeconds: 5_184_000, isDefault: true },
  plan: null,
  status: "none",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  nextBillingDate: null,
  cancelEffectiveDate: null,
  manageUrl: null,
  ...over,
});

const paid = sub({
  policy: { id: 4, name: "Priority", scheduleIntervalSeconds: 604_800, isDefault: false },
  status: "active",
});

function fakeClient() {
  const setQueryData = vi.fn();
  return { qc: { setQueryData } as unknown as QueryClient, setQueryData };
}

beforeEach(() => {
  vi.useFakeTimers();
  refreshSubscription.mockReset();
  refreshSubscription.mockResolvedValue(sub());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkoutPoll — the wait between paying and being served", () => {
  it("writes every answer into the cache, so all consumers flip together", async () => {
    const { startCheckoutPoll } = await freshModule();
    const { qc, setQueryData } = fakeClient();

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(0);

    expect(setQueryData).toHaveBeenCalledWith(["/user/subscription"], sub());
  });

  it("stops the moment the policy is no longer the default", async () => {
    const { startCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();
    refreshSubscription.mockResolvedValue(paid);

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshSubscription).toHaveBeenCalledTimes(1);

    // Nothing further, however long we wait — the flip is the terminal state.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it("stops on a cancellation rather than waiting out the cap", async () => {
    const { startCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();
    refreshSubscription.mockResolvedValue(sub({ status: "canceled" }));

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it("keeps polling when a refresh throws — a blip is not an answer", async () => {
    const { startCheckoutPoll } = await freshModule();
    const { qc, setQueryData } = fakeClient();
    refreshSubscription
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(paid);

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(0);
    expect(setQueryData).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(refreshSubscription).toHaveBeenCalledTimes(2);
    expect(setQueryData).toHaveBeenCalledWith(["/user/subscription"], paid);
  });

  it("polls every 2s for the first minute, then backs off to 10s", async () => {
    // The refresh endpoint is rate-limited, and a flat 2s for ten minutes is a
    // hammer — but people come back within seconds of paying, so the first
    // minute has to be quick.
    const { startCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshSubscription).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000); // 5 ticks at 2s
    expect(refreshSubscription).toHaveBeenCalledTimes(6);

    await vi.advanceTimersByTimeAsync(50_000); // past the one-minute mark
    const atSwitch = refreshSubscription.mock.calls.length;

    await vi.advanceTimersByTimeAsync(30_000); // 3 ticks at 10s, not 15 at 2s
    expect(refreshSubscription.mock.calls.length - atSwitch).toBeLessThanOrEqual(4);
    expect(refreshSubscription.mock.calls.length - atSwitch).toBeGreaterThanOrEqual(2);
  });

  it("gives up at ten minutes, which is what the return page promises", async () => {
    const { startCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 20_000);
    const settled = refreshSubscription.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(refreshSubscription).toHaveBeenCalledTimes(settled);
  });

  it("runs one poll however many surfaces ask", async () => {
    // The dialog and the return page both start it; two polls would double the
    // request rate against a rate-limited endpoint.
    const { startCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();

    startCheckoutPoll(qc);
    startCheckoutPoll(qc);
    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshSubscription).toHaveBeenCalledTimes(1);
  });

  it("stops when told to", async () => {
    const { startCheckoutPoll, stopCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();

    startCheckoutPoll(qc);
    await vi.advanceTimersByTimeAsync(0);
    stopCheckoutPoll();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(refreshSubscription).toHaveBeenCalledTimes(2);
  });

  it("takes the checkout tab closing as a reason to look again, once", async () => {
    // Cross-origin hides everything but `.closed`, and it fires a little before
    // focus does. It must not become a second poll loop.
    const { startCheckoutPoll } = await freshModule();
    const { qc } = fakeClient();
    const w = { closed: false } as Window;

    startCheckoutPoll(qc, { checkoutWindow: w });
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshSubscription).toHaveBeenCalledTimes(1);

    w.closed = true;
    await vi.advanceTimersByTimeAsync(2_000);
    const afterKick = refreshSubscription.mock.calls.length;
    expect(afterKick).toBeGreaterThanOrEqual(2);

    // The kick is spent; cadence returns to normal rather than compounding.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(refreshSubscription.mock.calls.length).toBeLessThanOrEqual(afterKick + 2);
  });
});
