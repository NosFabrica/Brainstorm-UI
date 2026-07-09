import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { apiClient, type SchedulerStats } from "@/services/api";
import { SchedulingStatsPanel } from "./SchedulingStatsPanel";

const BASE: SchedulerStats = {
  throughput_per_day: 12.5,
  demand_per_day: 8,
  median_publish_seconds: 620,
  lane_depths: {},
  tier_slip_seconds: {},
};

function mockStats(stats: Partial<SchedulerStats>) {
  return vi
    .spyOn(apiClient, "getSchedulingStats")
    .mockResolvedValue({ ...BASE, ...stats });
}

afterEach(() => vi.restoreAllMocks());

describe("SchedulingStatsPanel", () => {
  it("renders throughput, demand and median-publish metric cards", async () => {
    mockStats({});

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(await screen.findByText("12.5")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("10m 20s")).toBeInTheDocument(); // 620s
  });

  it("shows an em dash for a null median publish", async () => {
    mockStats({ median_publish_seconds: null });

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  it("labels the queue lanes with friendly names", async () => {
    mockStats({
      lane_depths: {
        "sched:admin": 2,
        "sched:house": 0,
        message_queue: 3,
        "sched:10": 5,
      },
    });

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(await screen.findByText(/Admin \(interactive\)/i)).toBeInTheDocument();
    expect(screen.getByText(/House/i)).toBeInTheDocument();
    expect(screen.getByText(/Message queue/i)).toBeInTheDocument();
    expect(screen.getByText(/Priority 10 \(scheduled\)/i)).toBeInTheDocument();
  });

  it("renders tier slip and shows an unknown key raw without crashing", async () => {
    mockStats({ tier_slip_seconds: { Weekly: 3600, mystery: 0 } });

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(await screen.findByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("1h")).toBeInTheDocument();
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });

  it("shows the global-kill-switch caveat", async () => {
    mockStats({});

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(
      await screen.findByText(/runs only when enabled globally/i),
    ).toBeInTheDocument();
  });

  it("shows a loading state while fetching", () => {
    vi.spyOn(apiClient, "getSchedulingStats").mockReturnValue(new Promise(() => {}));

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(screen.getByText(/loading scheduler stats/i)).toBeInTheDocument();
  });

  it("shows an error state when the stats query fails", async () => {
    vi.spyOn(apiClient, "getSchedulingStats").mockRejectedValue(new Error("boom"));

    renderWithProviders(<SchedulingStatsPanel active />);

    expect(await screen.findByText(/failed to load scheduler stats/i)).toBeInTheDocument();
  });
});
