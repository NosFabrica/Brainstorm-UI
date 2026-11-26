import { customDays, type AdminRange } from "../adminRange";
import { formatNumber } from "./format";

import { getActivityPipelineState, isFailedActivity, isFailedStatus } from "./failures";
import type { AdminUserHistoryPage, AdminUsersPage, BrainstormRequestInstance, GrapeRankError } from "./types";

export function getUserHealth(
  status: string | null,
  taStatus: string | null,
  timesCalc: number,
): "green" | "amber" | "red" | "gray" {
  if (timesCalc === 0) return "gray";
  const s = status?.toLowerCase();
  const t = taStatus?.toLowerCase();
  const sFail = s === "failed" || s === "failure";
  const tFail = t === "failed" || t === "failure";
  if (sFail && tFail) return "red";
  if (sFail || tFail) return "amber";
  if (s === "success") return "green";
  return "gray";
}

export type HourlyBucket = { t: number; success: number; failed: number; total: number };

export type TrendWindow = AdminRange;

export type WindowConfig = {
  windowMs: number;
  bucketCount: number;
  bucketSizeMs: number;
  shortLabel: string;
  windowPhrase: string;
  longLabel: string;
  priorLabel: string;
  bucketLabelFn: (ts: number) => string;
  bucketTooltipFn: (ts: number) => string;
  xAxisInterval: number;
  bucketUnitLabel: string;
};

export function getWindowConfig(w: TrendWindow): WindowConfig {
  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  switch (w) {
    case "1h":
      return {
        windowMs: HOUR,
        bucketCount: 12,
        bucketSizeMs: 5 * 60000,
        shortLabel: "1h",
        windowPhrase: "the last hour",
        longLabel: "Last hour",
        priorLabel: "vs prior 1h",
        bucketLabelFn: (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        xAxisInterval: 1,
        bucketUnitLabel: "calcs / 5min",
      };
    case "24h":
      return {
        windowMs: 24 * HOUR,
        bucketCount: 24,
        bucketSizeMs: HOUR,
        shortLabel: "24h",
        windowPhrase: "the last 24h",
        longLabel: "Last 24 hours",
        priorLabel: "vs prior 24h",
        bucketLabelFn: (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        xAxisInterval: 3,
        bucketUnitLabel: "calcs / hr",
      };
    case "72h":
      return {
        windowMs: 3 * DAY,
        bucketCount: 36,
        bucketSizeMs: 2 * HOUR,
        shortLabel: "72h",
        windowPhrase: "the last 72h",
        longLabel: "Last 72 hours",
        priorLabel: "vs prior 72h",
        bucketLabelFn: (ts) => new Date(ts).toLocaleString([], { weekday: "short", hour: "2-digit" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }),
        xAxisInterval: 5,
        bucketUnitLabel: "calcs / 2h",
      };
    case "7d":
      return {
        windowMs: 7 * DAY,
        bucketCount: 7,
        bucketSizeMs: DAY,
        shortLabel: "7d",
        windowPhrase: "the last 7d",
        longLabel: "Last 7 days",
        priorLabel: "vs prior 7d",
        bucketLabelFn: (ts) => new Date(ts).toLocaleDateString([], { weekday: "short" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        xAxisInterval: 0,
        bucketUnitLabel: "calcs / day",
      };
    case "30d":
      return {
        windowMs: 30 * DAY,
        bucketCount: 30,
        bucketSizeMs: DAY,
        shortLabel: "30d",
        windowPhrase: "the last 30d",
        longLabel: "Last 30 days",
        priorLabel: "vs prior 30d",
        bucketLabelFn: (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        xAxisInterval: 4,
        bucketUnitLabel: "calcs / day",
      };
    case "all":
      return {
        windowMs: Number.POSITIVE_INFINITY,
        bucketCount: 12,
        bucketSizeMs: DAY, // overridden dynamically from the loaded-data span
        shortLabel: "All",
        windowPhrase: "all time",
        longLabel: "All time",
        priorLabel: "vs prior period",
        bucketLabelFn: (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        xAxisInterval: 2,
        bucketUnitLabel: "calcs",
      };
    default: {
      // A custom "last N days": a bucket a day.
      const days = customDays(w) ?? 1;
      return {
        windowMs: days * DAY,
        bucketCount: days,
        bucketSizeMs: DAY,
        shortLabel: `${days}d`,
        windowPhrase: `the last ${days} days`,
        longLabel: `Last ${days} days`,
        priorLabel: `vs prior ${days}d`,
        bucketLabelFn: (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }),
        bucketTooltipFn: (ts) =>
          new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        xAxisInterval: Math.max(0, Math.ceil(days / 8) - 1),
        bucketUnitLabel: "calcs / day",
      };
    }
  }
}

export type ActivityOutcomeItem = { updated_at: string; status?: string | null; error?: GrapeRankError | null };

export function parseActivityTs(s: string | undefined | null): number {
  if (!s) return 0;
  try {
    const d = new Date(s.endsWith("Z") ? s : s + "Z");
    const t = d.getTime();
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

export function bucketActivity(
  activity: readonly ActivityOutcomeItem[],
  bucketCount: number,
  bucketSizeMs: number,
  now: number,
): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    t: now - (bucketCount - 1 - i) * bucketSizeMs,
    success: 0,
    failed: 0,
    total: 0,
  }));
  for (const a of activity) {
    const t = parseActivityTs(a.updated_at);
    if (!t) continue;
    const ageBuckets = Math.floor((now - t) / bucketSizeMs);
    if (ageBuckets < 0 || ageBuckets >= bucketCount) continue;
    const idx = bucketCount - 1 - ageBuckets;
    buckets[idx].total++;
    if ((a.status || "").toLowerCase() === "success") buckets[idx].success++;
    else if (isFailedActivity(a)) buckets[idx].failed++;
  }
  return buckets;
}

export function compareActivityWindows(activity: readonly ActivityOutcomeItem[], windowMs: number, now: number) {
  const cur: ActivityOutcomeItem[] = [];
  const prev: ActivityOutcomeItem[] = [];
  for (const a of activity) {
    const t = parseActivityTs(a.updated_at);
    if (!t) continue;
    const age = now - t;
    if (age < 0) continue;
    if (age < windowMs) cur.push(a);
    else if (age < windowMs * 2) prev.push(a);
  }
  const countSuccess = (arr: typeof activity) => arr.filter((a) => (a.status || "").toLowerCase() === "success").length;
  const countFailed = (arr: typeof activity) => arr.filter(isFailedActivity).length;
  const sr = (arr: typeof activity): number | null => {
    const s = countSuccess(arr);
    const f = countFailed(arr);
    return s + f === 0 ? null : Math.round((s / (s + f)) * 100);
  };
  return {
    curTotal: cur.length,
    prevTotal: prev.length,
    curFailed: countFailed(cur),
    prevFailed: countFailed(prev),
    curSuccess: countSuccess(cur),
    prevSuccess: countSuccess(prev),
    curSR: sr(cur),
    prevSR: sr(prev),
    hasPrev: prev.length > 0,
  };
}

/**
 * The pipeline's state across every user: success, failure and publication
 * counts and rates, and the activity of the last 24 hours.
 */
export function computePipelineMetrics(
  users: AdminUsersPage["items"],
  activity: AdminUserHistoryPage["items"],
  totalUsers: number,
  now: number = Date.now(),
) {
  const total = users.length;
  if (total === 0) return null;

  const successCount = users.filter((u) => u.latest_status?.toLowerCase() === "success").length;
  const failedCount = users.filter((u) => isFailedStatus(u.latest_status)).length;
  const pendingCount = total - successCount - failedCount;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

  const taSuccessCount = users.filter((u) => u.latest_ta_status?.toLowerCase() === "success").length;
  const taFailedCount = users.filter((u) => isFailedStatus(u.latest_ta_status)).length;
  const taAdoptionRate = total > 0 ? Math.round((taSuccessCount / total) * 100) : 0;

  const withTaPubkey = users.filter((u) => u.ta_pubkey).length;

  const totalCalcs = users.reduce((sum, u) => sum + (u.times_calculated || 0), 0);
  const avgCalcs = total > 0 ? (totalCalcs / total).toFixed(1) : "0";

  const algoCounts: Record<string, number> = {};
  users.forEach((u) => {
    const algo = u.latest_algorithm || "unknown";
    algoCounts[algo] = (algoCounts[algo] || 0) + 1;
  });

  const last24h = activity.filter((a) => {
    try {
      const t = new Date(a.updated_at.endsWith("Z") ? a.updated_at : a.updated_at + "Z").getTime();
      return now - t < 86400000;
    } catch {
      return false;
    }
  });
  const recentSuccess = last24h.filter((a) => a.status?.toLowerCase() === "success").length;
  const recentFailed = last24h.filter(isFailedActivity).length;

  const sortedByUpdate = [...users].sort((a, b) => {
    const ta = new Date(a.last_updated || "").getTime() || 0;
    const tb = new Date(b.last_updated || "").getTime() || 0;
    return tb - ta;
  });
  const lastPlatformActivity = sortedByUpdate[0]?.last_updated ?? null;

  const neverCalc = users.filter((u) => !u.times_calculated || u.times_calculated === 0).length;

  return {
    total: totalUsers,
    successCount,
    failedCount,
    pendingCount,
    successRate,
    taSuccessCount,
    taFailedCount,
    taAdoptionRate,
    withTaPubkey,
    totalCalcs,
    avgCalcs,
    algoCounts,
    recentSuccess,
    recentFailed,
    lastPlatformActivity,
    neverCalc,
  };
}

/** Users whose latest run is waiting or running; null before any user is loaded. */
export function countQueued(users: readonly { latest_status: string | null }[]): number | null {
  if (users.length === 0) return null;
  return users.filter((u) => {
    const s = u.latest_status?.toLowerCase();
    return s === "waiting" || s === "ongoing" || s === "queued" || s === "pending";
  }).length;
}

// Assign a live "queue position" to every in-flight request so the
// Platform Activity table's Queue column reflects real ordering instead
// of one shared concurrency count. Waiting rows are numbered 1..N in
// FIFO order (oldest created_at first = next to run); the actively
// processing row(s) are tagged as "active". Terminated rows get no
// entry and fall back to the per-record backend value.
//
// `snapshot` is the broader overview read, `page` the Activity page on screen.
export function queuePositions(
  snapshot: readonly BrainstormRequestInstance[],
  page: readonly BrainstormRequestInstance[],
): Map<number, number | "active"> {
  const map = new Map<number, number | "active">();
  // Prefer the broader overview snapshot for ordering, but merge in any
  // current-page rows that the snapshot may have missed (it is capped to
  // 100 records and may lag the live page).
  const seen = new Set<number>();
  const merged: BrainstormRequestInstance[] = [];
  for (const it of snapshot) {
    if (typeof it.private_id === "number" && !seen.has(it.private_id)) {
      seen.add(it.private_id);
      merged.push(it);
    }
  }
  for (const it of page) {
    if (typeof it.private_id === "number" && !seen.has(it.private_id)) {
      seen.add(it.private_id);
      merged.push(it);
    }
  }
  const tsOf = (s: string | null | undefined) => {
    if (!s) return 0;
    try {
      const d = new Date(s.endsWith("Z") ? s : s + "Z");
      const t = d.getTime();
      return isNaN(t) ? 0 : t;
    } catch {
      return 0;
    }
  };
  const active = merged.filter((i) => getActivityPipelineState(i) === "active");
  const waiting = merged
    .filter((i) => getActivityPipelineState(i) === "waiting")
    .sort((a, b) => tsOf(a.created_at) - tsOf(b.created_at));
  for (const a of active) {
    if (typeof a.private_id === "number") map.set(a.private_id, "active");
  }
  waiting.forEach((w, idx) => {
    if (typeof w.private_id === "number") map.set(w.private_id, idx + 1);
  });
  return map;
}

/**
 * The Overview's series and comparisons for the range: `loaded` is what was
 * read (the range and the one before it), `inRange` the part inside the range.
 */
export function computeTrends(
  loaded: readonly ActivityOutcomeItem[],
  inRange: readonly ActivityOutcomeItem[],
  range: AdminRange,
  now: number,
) {
  const HOUR = 3600000;
  const oldestActivityTs = loaded.reduce((min, a) => {
    const t = parseActivityTs(a.updated_at);
    if (!t) return min;
    return min === 0 ? t : Math.min(min, t);
  }, 0);
  const dataAgeMs = oldestActivityTs > 0 ? now - oldestActivityTs : 0;
  let cfg = getWindowConfig(range);
  if (range === "all") {
    // Bucket the whole loaded span so "All" reads well no matter the range.
    const spanMs = Math.max(dataAgeMs, HOUR);
    const bucketCount = 12;
    cfg = { ...cfg, bucketCount, bucketSizeMs: Math.ceil(spanMs / bucketCount) };
  }
  const dataCoversWindow = range === "all" ? true : oldestActivityTs > 0 && dataAgeMs >= cfg.windowMs * 0.95;
  const dataCoversPriorWindow = range === "all" ? false : oldestActivityTs > 0 && dataAgeMs >= cfg.windowMs * 1.95;
  const buckets = bucketActivity(inRange, cfg.bucketCount, cfg.bucketSizeMs, now);
  const cmp = compareActivityWindows(loaded, cfg.windowMs, now);
  const cmp1h = compareActivityWindows(loaded, HOUR, now);
  const totalSeries = buckets.map((b) => b.total);
  const successSeries = buckets.map((b) => b.success);
  const failedSeries = buckets.map((b) => b.failed);
  const bucketTimestamps = buckets.map((b) => b.t);
  const rateSeries = buckets.map((b) => {
    const d = b.success + b.failed;
    return d === 0 ? 0 : Math.round((b.success / d) * 100);
  });
  return {
    cfg,
    buckets,
    bucketTimestamps,
    totalSeries,
    successSeries,
    failedSeries,
    rateSeries,
    cmp,
    cmp1h,
    hasPriorWindow: cmp.hasPrev,
    hasPriorHourWindow: cmp1h.hasPrev,
    hasAnyActivity: cmp.curTotal > 0,
    dataCoversWindow,
    dataCoversPriorWindow,
  };
}

export type Trends = ReturnType<typeof computeTrends>;

/** pubkey → current scheduling tier, for the users a table has loaded. */
export function tierByPubkey(users: readonly { pubkey: string; scheduling_name: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of users) if (u.pubkey && u.scheduling_name) m.set(u.pubkey, u.scheduling_name);
  return m;
}

export type PipelineMetrics = NonNullable<ReturnType<typeof computePipelineMetrics>>;

/**
 * The header's six figures, the system now. From every user's latest run when
 * that has loaded; else the backend's stats for the three it carries, the
 * range's runs for rate and failures, and "—" for what neither knows.
 */
export function computeHeaderFigures({
  nowMetrics,
  adminStats,
  computedQueueDepth,
  trends,
  hasActivity,
}: {
  nowMetrics: PipelineMetrics | null;
  adminStats: { scoredUsers: number; spAdopters: number; queueDepth: number } | null;
  computedQueueDepth: number | null;
  trends: Pick<Trends, "cmp">;
  /** Whether the range's runs have loaded. */
  hasActivity: boolean;
}) {
  return {
    scored: nowMetrics
      ? `${formatNumber(nowMetrics.successCount)} / ${formatNumber(nowMetrics.total)}`
      : adminStats
        ? formatNumber(adminStats.scoredUsers)
        : "0",
    published: nowMetrics
      ? `${formatNumber(nowMetrics.taSuccessCount)} / ${formatNumber(nowMetrics.total)}`
      : adminStats
        ? formatNumber(adminStats.spAdopters)
        : "0",
    queue:
      computedQueueDepth !== null
        ? formatNumber(computedQueueDepth)
        : adminStats
          ? formatNumber(adminStats.queueDepth)
          : "0",
    // Without the whole-table reads (a tab that doesn't draw them, before they
    // land) a figure the stats don't carry reads as unknown, not as zero.
    calcs: nowMetrics ? formatNumber(nowMetrics.totalCalcs) : "—",
    rate: nowMetrics ? `${nowMetrics.successRate}%` : trends.cmp.curSR !== null ? `${trends.cmp.curSR}%` : "—",
    failed: nowMetrics ? formatNumber(nowMetrics.failedCount) : hasActivity ? formatNumber(trends.cmp.curFailed) : "—",
  };
}

export type HeaderFigures = ReturnType<typeof computeHeaderFigures>;
