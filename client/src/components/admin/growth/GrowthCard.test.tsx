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
  run(A, NOW - 2 * HOUR),
  run(B, NOW - 40 * DAY),
  run(B, NOW - 3 * HOUR, "scheduled"),
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
  it("counts first-timers, self-calculators and the active, the system observer aside", async () => {
    renderCard();
    await waitFor(() => expect(screen.getByTestId("growth-first-time")).toHaveTextContent("1"));
    expect(screen.getByTestId("growth-self-calculated")).toHaveTextContent("1");
    expect(screen.getByTestId("growth-active")).toHaveTextContent("2");
    expect(screen.queryByText(nip19.npubEncode(OBSERVER).slice(0, 12), { exact: false })).toBeNull();
  });

  it("names each person with their house score and lets the list be copied as npubs", async () => {
    renderCard();
    const list = await screen.findByTestId("growth-list-first-time");
    await waitFor(() => expect(within(list).getByText("Riverdev")).toBeInTheDocument());
    await waitFor(() => expect(within(list).getByTestId(`growth-score-${A}`)).toHaveTextContent("42"));

    fireEvent.click(within(list).getByTestId("button-copy-npubs"));
    await waitFor(() => expect(copied).toHaveBeenCalledWith(nip19.npubEncode(A), expect.anything()));
  });
});
