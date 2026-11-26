import { describe, expect, it } from "vitest";
import {
  bucketActivity,
  compareActivityWindows,
  computePipelineMetrics,
  computeHeaderFigures,
  computeTrends,
  countQueued,
  getUserHealth,
  getWindowConfig,
  parseActivityTs,
  queuePositions,
} from "./metrics";
import type { AdminUserListItem, BrainstormRequestInstance } from "./types";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const outcome = (ms: number, status = "success") => ({ updated_at: ago(ms), status });

const user = (over: Partial<AdminUserListItem> = {}): AdminUserListItem => ({
  pubkey: "a".repeat(64),
  ta_pubkey: null,
  times_calculated: 1,
  last_triggered: ago(HOUR),
  last_updated: ago(HOUR),
  latest_status: "success",
  latest_ta_status: "success",
  latest_algorithm: "graperank",
  scheduling_id: null,
  scheduling_name: "Free",
  ...over,
});
const run = (id: number, status: string, createdMs: number): BrainstormRequestInstance => ({
  created_at: ago(createdMs),
  updated_at: ago(createdMs),
  private_id: id,
  status,
  ta_status: null,
  internal_publication_status: null,
  error: null,
  count_values: null,
  password: "",
  algorithm: "graperank",
  parameters: "",
  how_many_others_with_priority: 0,
  pubkey: null,
  trigger_source: null,
});

describe("parseActivityTs", () => {
  it("reads a zoneless timestamp as UTC and anything else as 0", () => {
    expect(parseActivityTs("2026-10-22T12:00:00")).toBe(NOW);
    expect(parseActivityTs(null)).toBe(0);
    expect(parseActivityTs("nope")).toBe(0);
  });
});

describe("getUserHealth", () => {
  it("is grey before any run, red when both stages failed, amber when one did", () => {
    expect(getUserHealth("success", "success", 0)).toBe("gray");
    expect(getUserHealth("failed", "failure", 3)).toBe("red");
    expect(getUserHealth("success", "failed", 3)).toBe("amber");
    expect(getUserHealth("success", null, 3)).toBe("green");
    expect(getUserHealth("waiting", null, 3)).toBe("gray");
  });
});

describe("getWindowConfig", () => {
  it("buckets a custom range a day at a time", () => {
    const cfg = getWindowConfig("14d");
    expect(cfg.bucketCount).toBe(14);
    expect(cfg.windowMs).toBe(14 * 24 * HOUR);
    expect(cfg.longLabel).toBe("Last 14 days");
  });

  it("has no end for all time", () => {
    expect(getWindowConfig("all").windowMs).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("bucketActivity", () => {
  it("drops each run in its bucket, oldest first, and skips what is outside", () => {
    const buckets = bucketActivity(
      [outcome(0), outcome(HOUR + 1, "failed"), outcome(HOUR + 2), outcome(10 * HOUR)],
      3,
      HOUR,
      NOW,
    );
    expect(buckets.map((b) => b.t)).toEqual([NOW - 2 * HOUR, NOW - HOUR, NOW]);
    expect(buckets.map((b) => [b.total, b.success, b.failed])).toEqual([
      [0, 0, 0],
      [2, 1, 1],
      [1, 1, 0],
    ]);
  });
});

describe("compareActivityWindows", () => {
  it("compares the window with the one before it", () => {
    const cmp = compareActivityWindows(
      [outcome(1), outcome(2, "failed"), outcome(HOUR + 1), outcome(3 * HOUR)],
      HOUR,
      NOW,
    );
    expect(cmp).toMatchObject({ curTotal: 2, prevTotal: 1, curFailed: 1, curSR: 50, prevSR: 100, hasPrev: true });
  });

  it("has no success rate without a finished run", () => {
    expect(compareActivityWindows([], HOUR, NOW)).toMatchObject({ curSR: null, hasPrev: false });
  });
});

describe("computePipelineMetrics", () => {
  it("is nothing before any user is loaded", () => {
    expect(computePipelineMetrics([], [], 0, NOW)).toBeNull();
  });

  it("counts each user's latest run, and the last day's runs", () => {
    const m = computePipelineMetrics(
      [
        user({ times_calculated: 3 }),
        user({ latest_status: "failed", latest_ta_status: null, times_calculated: 1 }),
        user({ latest_status: "waiting", latest_ta_status: null, times_calculated: 0, ta_pubkey: "t" }),
      ],
      [run(1, "success", HOUR), run(2, "failed", 2 * HOUR), run(3, "success", 30 * HOUR)],
      300,
      NOW,
    )!;
    expect(m).toMatchObject({
      total: 300,
      successCount: 1,
      failedCount: 1,
      pendingCount: 1,
      successRate: 33,
      taSuccessCount: 1,
      withTaPubkey: 1,
      totalCalcs: 4,
      avgCalcs: "1.3",
      recentSuccess: 1,
      recentFailed: 1,
      neverCalc: 1,
    });
  });
});

describe("countQueued", () => {
  it("counts the users waiting or running", () => {
    expect(countQueued([])).toBeNull();
    expect(countQueued([user({ latest_status: "Queued" }), user({ latest_status: "ongoing" }), user()])).toBe(2);
  });
});

describe("queuePositions", () => {
  it("numbers the waiting runs oldest first and marks the running ones", () => {
    const snapshot = [run(1, "waiting", 10), run(2, "ongoing", 30), run(3, "success", 40)];
    const page = [run(4, "queued", 50), run(1, "waiting", 10)];
    const positions = queuePositions(snapshot, page);
    expect([...positions]).toEqual([
      [2, "active"],
      [4, 1],
      [1, 2],
    ]);
  });
});

describe("computeTrends", () => {
  it("bucket the range and compare it with the one before", () => {
    const loaded = [outcome(10 * 60_000), outcome(20 * 60_000, "failed"), outcome(90 * 60_000)];
    const inRange = loaded.slice(0, 2);
    const t = computeTrends(loaded, inRange, "1h", NOW);
    expect(t.cfg.bucketCount).toBe(12);
    expect(t.totalSeries.reduce((a, b) => a + b, 0)).toBe(2);
    expect(t.cmp).toMatchObject({ curTotal: 2, prevTotal: 1 });
    expect(t.hasPriorWindow).toBe(true);
    expect(t.dataCoversWindow).toBe(true);
    expect(t.dataCoversPriorWindow).toBe(false);
  });

  it("spread all time across the loaded span", () => {
    const loaded = [outcome(0), outcome(24 * HOUR)];
    const t = computeTrends(loaded, loaded, "all", NOW);
    expect(t.cfg.bucketSizeMs).toBe(2 * HOUR);
    expect(t.dataCoversWindow).toBe(true);
  });
});

describe("computeHeaderFigures", () => {
  const cmp = { curSR: 80, curFailed: 3 } as ReturnType<typeof computeTrends>["cmp"];

  it("reads every user's latest run once it has loaded", () => {
    const nowMetrics = computePipelineMetrics([user(), user({ latest_status: "failed" })], [], 1_500, NOW);
    expect(
      computeHeaderFigures({ nowMetrics, adminStats: null, computedQueueDepth: 0, trends: { cmp }, hasActivity: true }),
    ).toEqual({ scored: "1 / 1.5K", published: "2 / 1.5K", queue: "0", calcs: "2", rate: "50%", failed: "1" });
  });

  it("falls back on the backend's stats and the range's runs, and says '—' for the rest", () => {
    const adminStats = { scoredUsers: 12, spAdopters: 7, queueDepth: 2 };
    expect(
      computeHeaderFigures({
        nowMetrics: null,
        adminStats,
        computedQueueDepth: null,
        trends: { cmp },
        hasActivity: true,
      }),
    ).toEqual({ scored: "12", published: "7", queue: "2", calcs: "—", rate: "80%", failed: "3" });
    expect(
      computeHeaderFigures({
        nowMetrics: null,
        adminStats: null,
        computedQueueDepth: null,
        trends: { cmp: { ...cmp, curSR: null } },
        hasActivity: false,
      }),
    ).toEqual({ scored: "0", published: "0", queue: "0", calcs: "—", rate: "—", failed: "—" });
  });
});
