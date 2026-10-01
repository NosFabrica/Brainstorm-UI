// @vitest-environment jsdom
/**
 * Insights → Calculation says what the server says about the latest run.
 * A paying customer saw "In progress" a day after their run finished: the
 * card read the run from the top of the response, but the server wraps it
 * (`{ code, data: <run> | null, message }`), so every status field was
 * undefined and the label could only ever say "In progress".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const PUBKEY = "a".repeat(64);
const runMock = vi.fn<() => Promise<unknown>>();
vi.mock("@/services/api", () => ({
  apiClient: new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "getGrapeRankResult"
          ? () => runMock()
          : prop === "getHouseInfluence"
            ? async () => 0.42
            : async () => null,
    },
  ),
  isAuthRedirecting: () => false,
}));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, npub: "npub1test", name: "Tester" }),
}));
vi.mock("@/hooks/useSelf", () => ({
  useSelfOverview: () => ({ data: { data: { counts: {} } } }),
  useSelfStats: () => ({ data: { data: {} } }),
  useSelfHistory: () => ({ data: { data: { last_time_calculated_graperank: "2026-09-30T00:10:00" } } }),
}));
vi.mock("@/hooks/useTrustPresetSync", () => ({ useTrustPresetSync: () => ({ preset: null }) }));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/billing/PlanCard", () => ({ PlanCard: () => null }));
vi.mock("@/components/DeferredSession", () => ({ DeferredSessionNotice: () => null }));
vi.mock("@/lib/scoreJournal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scoreJournal")>()),
  hydrateScoreJournal: async () => [],
}));

import InsightsPage from "./InsightsPage";

const run = (extra: Record<string, unknown> = {}) => ({
  private_id: 7,
  status: "success",
  internal_publication_status: "success",
  ta_status: "success",
  graperank_preset_used: "default",
  created_at: "2026-09-30T00:00:00",
  updated_at: "2026-09-30T00:09:30",
  how_many_others_with_priority: 0,
  ...extra,
});
/** What the server actually sends. */
const envelope = (data: unknown) => ({ code: 200, data, message: "ok" });
/** The value cell beside a label in the card's definition list. */
const cell = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;

beforeEach(() => {
  runMock.mockReset();
  localStorage.clear();
});

describe("Insights → Calculation", () => {
  it("a finished run reads Complete, with how long it took and that it published", async () => {
    runMock.mockResolvedValue(envelope(run()));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete"));
    expect(cell("Took")).toHaveTextContent(/9m|9 min/);
    expect(cell("Published")).toHaveTextContent("Published");
  });

  it("a failed run reads Failed", async () => {
    runMock.mockResolvedValue(envelope(run({ status: "failure", internal_publication_status: "failure" })));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Failed"));
  });

  it("a run still going reads In progress, with its place in the queue", async () => {
    runMock.mockResolvedValue(
      envelope(
        run({
          status: "ongoing",
          internal_publication_status: "waiting",
          ta_status: "waiting",
          how_many_others_with_priority: 2,
        }),
      ),
    );
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Queue")).toHaveTextContent("2 ahead"));
    expect(cell("Status")).toHaveTextContent("In progress");
  });

  it("no run at all is not a run in progress", async () => {
    runMock.mockResolvedValue(envelope(null));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(runMock).toHaveBeenCalled());
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Not calculated yet"));
    expect(cell("Status")).not.toHaveTextContent("In progress");
  });

  it("reads a bare run too, as the page's own poll already does", async () => {
    runMock.mockResolvedValue(run());
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete"));
  });
});
