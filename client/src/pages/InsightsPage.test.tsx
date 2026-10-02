// @vitest-environment jsdom
/**
 * Insights → Calculation says what the server says about the latest run.
 * A paying customer saw "In progress" a day after their run finished: the
 * card read the run from the top of the response, but the server wraps it
 * (`{ code, data: <run> | null, message }`), so every status field was
 * undefined and the label could only ever say "In progress".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const PUBKEY = "a".repeat(64);
const runMock = vi.fn<() => Promise<unknown>>();
const triggerMock = vi.fn<() => Promise<unknown>>();
vi.mock("@/services/api", () => ({
  apiClient: new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "getGrapeRankResult"
          ? () => runMock()
          : prop === "triggerGrapeRank"
            ? () => triggerMock()
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
// No published journal: hydrating keeps the local one, as the real merge does.
// Resolving [] here would wipe a seeded journal whenever it lands after render.
vi.mock("@/lib/scoreJournal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scoreJournal")>();
  return { ...actual, hydrateScoreJournal: async (pubkey: string) => actual.getScoreJournal(pubkey) };
});

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
  triggerMock.mockReset();
  localStorage.clear();
});

describe("Insights → Calculation", () => {
  const label = (text: string) => screen.queryByText(text, { selector: "dt" });

  it("a finished, published run is one line — Complete · published — with nothing left over", async () => {
    runMock.mockResolvedValue(envelope(run()));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete · published"));
    // No second row repeating it, no queue for a run that is over, no row-lifetime "Took".
    expect(label("Published")).toBeNull();
    expect(label("Queue")).toBeNull();
    expect(label("Took")).toBeNull();
  });

  it("says so while the scores are still being published, and when publishing failed", async () => {
    runMock.mockResolvedValue(envelope(run({ ta_status: "ongoing" })));
    const first = renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete · publishing…"));
    first.unmount();
    runMock.mockResolvedValue(envelope(run({ ta_status: "failure" })));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete · not published"));
  });

  it("says how many came out verified from your point of view, of everyone the run reached", async () => {
    runMock.mockResolvedValue(
      envelope(
        run({
          count_values: JSON.stringify({
            high: { "1": 40 },
            medium_low: { "2": 1210 },
            low: { "2": 984 },
            low_and_reported_by_2_or_more_trusted_pubkeys: { "2": 3 },
          }),
        }),
      ),
    );
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Your network")).toHaveTextContent("1,250 verified of 2,237 reached"));
    expect(label("People scored")).toBeNull();
  });

  it("leaves the network row out when the run does not say", async () => {
    runMock.mockResolvedValue(envelope(run({ count_values: "" })));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete"));
    expect(label("Your network")).toBeNull();
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

  it("folds the runs that changed nothing into one line of the history", async () => {
    const DAY = 86_400_000;
    const t0 = Date.UTC(2026, 8, 1);
    localStorage.setItem(
      `brainstorm_score_journal:${PUBKEY}`,
      JSON.stringify([0, 7, 14, 21].map((d) => ({ t: t0 + d * DAY, score: 0.5 }))),
    );
    runMock.mockResolvedValue(envelope(run()));
    renderWithProviders(<InsightsPage />);
    const fold = await screen.findByTestId("insights-score-fold");
    expect(fold).toHaveTextContent(/2 runs, no change/);
    // Newest and first stay as rows; the two between them are the fold.
    expect(screen.getAllByTestId("insights-score-row").length).toBeGreaterThanOrEqual(2);
  });

  it("reads a bare run too, as the page's own poll already does", async () => {
    runMock.mockResolvedValue(run());
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete"));
  });
});

describe("Insights → Recalculate", () => {
  const waiting = () => run({ status: "waiting", internal_publication_status: "waiting", ta_status: "waiting" });

  it("starts a run from the card, and the card says In progress at once", async () => {
    runMock.mockResolvedValue(envelope(run()));
    triggerMock.mockResolvedValue(envelope(waiting()));
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete"));
    runMock.mockResolvedValue(envelope(waiting()));
    fireEvent.click(screen.getByTestId("insights-recalculate"));
    await waitFor(() => expect(cell("Status")).toHaveTextContent("In progress"));
    expect(triggerMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("insights-recalculate")).toBeDisabled();
  });

  it("says the server's own words when it is too soon, and leaves the status alone", async () => {
    runMock.mockResolvedValue(envelope(run()));
    triggerMock.mockRejectedValue(
      new Error("Please wait a few minutes before recalculating. The server needs time between requests."),
    );
    renderWithProviders(<InsightsPage />);
    await waitFor(() => expect(cell("Status")).toHaveTextContent("Complete"));
    fireEvent.click(screen.getByTestId("insights-recalculate"));
    expect(await screen.findByTestId("insights-recalculate-error")).toHaveTextContent(/Please wait a few minutes/);
    expect(cell("Status")).toHaveTextContent("Complete");
    expect(screen.getByTestId("insights-recalculate")).not.toBeDisabled();
  });

  it("keeps the way to the preset one tap away", async () => {
    runMock.mockResolvedValue(envelope(run()));
    renderWithProviders(<InsightsPage />);
    expect(await screen.findByTestId("insights-preset-settings")).toHaveTextContent(/preset/i);
  });
});
