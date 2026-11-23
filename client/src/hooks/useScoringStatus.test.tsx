/**
 * The status pill is the one poller of the reader's latest run, and the one
 * place a finished run refetches their own numbers. A run already finished
 * when the page loaded is not news: treating it as a transition refetched the
 * dashboard's reads on every visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const ME = "a".repeat(64);
const run = vi.fn<() => Promise<unknown>>();
const overview = vi.fn(async (..._a: unknown[]) => ({ data: { influence: 1 } }));

vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => ({ pubkey: ME }) }));
vi.mock("@/services/api", () => ({
  apiClient: {
    getGrapeRankResult: () => run(),
    getUserOverview: (...a: unknown[]) => overview(...a),
  },
}));

import { __resetScoringTransitions, useScoringStatus } from "./useScoringStatus";

const envelope = (internal: string, ta = "waiting") => ({
  code: 200,
  data: { status: "success", internal_publication_status: internal, ta_status: ta },
});

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);

beforeEach(() => {
  __resetScoringTransitions();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  run.mockReset();
  overview.mockClear();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("useScoringStatus", () => {
  it("asks for nothing more when there is no run and none was asked for", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    run.mockResolvedValue({ code: 200, data: null });
    renderHook(() => useScoringStatus(), { wrapper });
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a run already finished on load is not a transition: nothing of the reader's refetches", async () => {
    run.mockResolvedValue(envelope("success", "success"));
    qc.setQueryData(["/user/history", ME], { seeded: true });
    const { result } = renderHook(() => useScoringStatus(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(qc.getQueryState(["/user/history", ME])?.isInvalidated).toBe(false);
  });

  it("a run finishing under the poll refetches the reader's own reads, once for every pill on screen", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    run.mockResolvedValue(envelope("waiting"));
    qc.setQueryData(["/user/history", ME], { seeded: true });
    qc.setQueryData(["/user/overview", "b".repeat(64), "viewer"], { seeded: true });
    const first = renderHook(() => useScoringStatus(), { wrapper });
    renderHook(() => useScoringStatus(), { wrapper });
    await waitFor(() => expect(first.result.current.status).toBe("calculating"));

    const invalidate = vi.spyOn(qc, "invalidateQueries");
    run.mockResolvedValue(envelope("success", "success"));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));

    expect(qc.getQueryState(["/user/history", ME])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["/user/overview", "b".repeat(64), "viewer"])?.isInvalidated).toBe(false);
    const historyCalls = invalidate.mock.calls.filter(
      ([f]) => JSON.stringify(f?.queryKey) === `["/user/history","${ME}"]`,
    );
    expect(historyCalls).toHaveLength(1);
  });

  it("starts the reader's own overview at once, before any page asks", async () => {
    run.mockResolvedValue({ code: 200, data: null });
    renderHook(() => useScoringStatus(), { wrapper });
    await waitFor(() => expect(overview).toHaveBeenCalledWith(ME, { house: false }));
  });
});
