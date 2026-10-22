// @vitest-environment jsdom
/**
 * The Growth tab: who's new and who's engaged in the dashboard's range, for
 * the team's glance and for outreach — from the year's run records, the
 * house lens's scores and nothing more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const OBSERVER = "0".repeat(64);
const copied = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: copied }));
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: async () => OBSERVER }));
vi.mock("@/services/wotRanks", () => ({
  fetchAuthorRanks: async () => ({ ranks: new Map([[A, 42]]), source: "house" }),
}));

import { GrowthCard } from "./GrowthCard";

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(ms).toISOString();
const run = (pubkey: string, ms: number, trigger_source = "manual") => ({
  pubkey,
  created_at: at(ms),
  updated_at: at(ms),
  status: "success",
  trigger_source,
});
const records = [
  run(A, NOW - 2 * HOUR), // new today
  run(B, NOW - 40 * DAY),
  run(B, NOW - 3 * HOUR, "scheduled"), // scheduled only
  run(C, NOW - 5 * DAY),
  run(C, NOW - 4 * HOUR), // self-triggered today
  run(D, NOW - 30 * DAY), // dormant
  run(OBSERVER, NOW - HOUR, "periodic"),
];

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GrowthCard records={records} range="24h" isLoading={false} profiles={new Map([[A, { name: "Riverdev" }]])} />
    </QueryClientProvider>,
  );
}

beforeEach(() => copied.mockClear());

describe("GrowthCard", () => {
  it("counts the segments, the system observer aside, without icons", async () => {
    renderCard();
    await waitFor(() => expect(screen.getByTestId("growth-segment-fresh")).toHaveTextContent("1"));
    expect(screen.getByTestId("growth-segment-selfTriggered")).toHaveTextContent("1");
    expect(screen.getByTestId("growth-segment-scheduledOnly")).toHaveTextContent("1");
    expect(screen.getByTestId("growth-segment-dormant")).toHaveTextContent("1");
    expect(screen.getByTestId("growth-segments").querySelector("svg")).toBeNull();
    expect(screen.queryByText(nip19.npubEncode(OBSERVER).slice(0, 12), { exact: false })).toBeNull();
  });

  it("opens on the new people, named with their house score, and copies them as npubs", async () => {
    renderCard();
    const list = await screen.findByTestId("growth-list");
    await waitFor(() => expect(within(list).getByText("Riverdev")).toBeInTheDocument());
    await waitFor(() => expect(within(list).getByTestId(`growth-score-${A}`)).toHaveTextContent("42"));

    fireEvent.click(screen.getByTestId("button-copy-npubs"));
    await waitFor(() => expect(copied).toHaveBeenCalledWith(nip19.npubEncode(A), expect.anything()));
  });

  it("switches segments, telling self and scheduled runs apart", async () => {
    renderCard();
    fireEvent.click(await screen.findByTestId("growth-segment-scheduledOnly"));
    const list = screen.getByTestId("growth-list");
    await waitFor(() => expect(within(list).getByTestId(`growth-runs-${B}`)).toHaveTextContent(/0 self/));
    expect(within(list).getByTestId(`growth-runs-${B}`)).toHaveTextContent(/1 sched/);

    fireEvent.click(screen.getByTestId("growth-segment-dormant"));
    await waitFor(() => expect(within(list).getByTestId(`growth-runs-${D}`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("button-copy-npubs"));
    await waitFor(() => expect(copied).toHaveBeenLastCalledWith(nip19.npubEncode(D), expect.anything()));
  });
});
