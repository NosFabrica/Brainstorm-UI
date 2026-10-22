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
  fetchAuthorRanks: async () => ({
    ranks: new Map([
      [A, 42],
      [C, 10],
    ]),
    source: "house",
  }),
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

const opened = vi.fn();
function renderCard(range: "24h" | "7d" = "24h") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GrowthCard
        records={records}
        range={range}
        isLoading={false}
        profiles={
          new Map([
            [A, { name: "Riverdev" }],
            [C, { name: "Lakebuilder" }],
          ])
        }
        tiers={
          new Map([
            [A, "Free"],
            [B, "Priority"],
            [C, "Free"],
            [D, "Priority"],
          ])
        }
        onOpenPerson={opened}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  copied.mockClear();
  opened.mockClear();
});

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

  it("narrows the shown segment by name or npub, and copies what's left", async () => {
    renderCard("7d"); // New: A and C
    const list = await screen.findByTestId("growth-list");
    await waitFor(() => expect(within(list).getAllByTestId(/^growth-runs-/)).toHaveLength(2));

    fireEvent.change(screen.getByTestId("input-growth-search"), { target: { value: "lake" } });
    await waitFor(() => expect(within(list).getAllByTestId(/^growth-runs-/)).toHaveLength(1));
    expect(within(list).getByText("Lakebuilder")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-copy-npubs"));
    await waitFor(() => expect(copied).toHaveBeenLastCalledWith(nip19.npubEncode(C), expect.anything()));

    fireEvent.change(screen.getByTestId("input-growth-search"), {
      target: { value: nip19.npubEncode(A).slice(0, 20) },
    });
    await waitFor(() => expect(within(list).getByText("Riverdev")).toBeInTheDocument());
  });

  it("crosses a segment with tier and with Brainstorm's score", async () => {
    renderCard("7d"); // New: A (Free, 42) and C (Free, 10); Dormant: D (Priority, unscored)
    const rows = () => within(screen.getByTestId("growth-list")).queryAllByTestId(/^growth-runs-/);
    await waitFor(() => expect(screen.getByTestId(`growth-score-${A}`)).toHaveTextContent("42"));

    fireEvent.change(screen.getByTestId("select-growth-tier"), { target: { value: "Priority" } });
    await waitFor(() => expect(rows()).toHaveLength(0));
    fireEvent.click(screen.getByTestId("growth-segment-dormant"));
    await waitFor(() => expect(screen.getByTestId(`growth-runs-${D}`)).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("select-growth-tier"), { target: { value: "" } });
    fireEvent.change(screen.getByTestId("select-growth-scored"), { target: { value: "unscored" } });
    await waitFor(() => expect(screen.getByTestId(`growth-runs-${D}`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("growth-segment-fresh"));
    await waitFor(() => expect(rows()).toHaveLength(0));
  });

  it("sorts by a column on click, newest last run by default", async () => {
    renderCard("7d"); // New: C ran 4h ago, A 2h ago
    const list = await screen.findByTestId("growth-list");
    const order = () =>
      within(list)
        .getAllByTestId(/^growth-runs-/)
        .map((el) => el.getAttribute("data-testid"));
    await waitFor(() => expect(order()).toEqual([`growth-runs-${A}`, `growth-runs-${C}`]));

    fireEvent.click(screen.getByTestId("sort-growth-score"));
    await waitFor(() => expect(order()).toEqual([`growth-runs-${A}`, `growth-runs-${C}`]));
    fireEvent.click(screen.getByTestId("sort-growth-score"));
    await waitFor(() => expect(order()).toEqual([`growth-runs-${C}`, `growth-runs-${A}`]));
    fireEvent.click(screen.getByTestId("sort-growth-first-run"));
    await waitFor(() => expect(order()).toEqual([`growth-runs-${A}`, `growth-runs-${C}`]));
  });

  it("opens a person on click", async () => {
    renderCard();
    const list = await screen.findByTestId("growth-list");
    fireEvent.click(await within(list).findByText("Riverdev"));
    expect(opened).toHaveBeenCalledWith(A);
  });
});
