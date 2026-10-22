import { describe, expect, it } from "vitest";
import { growthCohorts } from "./growthCohorts";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const OBSERVER = "0".repeat(64);
const at = (ms: number) => new Date(ms).toISOString();
const run = (pubkey: string, ms: number, trigger_source = "manual", status = "success") => ({
  pubkey,
  created_at: at(ms),
  updated_at: at(ms),
  status,
  trigger_source,
});

// Who's new and who's engaged in the dashboard's range, from the year's run
// records: a person is "first-time" when their earliest run falls in the
// range, "self-calculated" when they triggered a run themselves in it.
describe("growthCohorts", () => {
  const records = [
    run(A, NOW - 2 * HOUR), // first ever run, their own click, today
    run(B, NOW - 40 * DAY), // old hand…
    run(B, NOW - 3 * HOUR, "scheduled"), // …whose scheduler ran today
    run(C, NOW - 5 * DAY), // nothing today
    run(OBSERVER, NOW - 1 * HOUR, "periodic"), // the system observer
  ];

  it("counts first-timers, self-calculators and the active in the range", () => {
    const c = growthCohorts(records, { range: "24h", now: NOW, exclude: [OBSERVER] });
    expect(c.firstTime.map((p) => p.pubkey)).toEqual([A]);
    expect(c.selfCalculated.map((p) => p.pubkey)).toEqual([A]);
    expect(c.activeCount).toBe(2);
  });

  it("describes each person by their first run, last run and run count", () => {
    const c = growthCohorts(records, { range: "7d", now: NOW, exclude: [OBSERVER] });
    expect(c.selfCalculated.map((p) => p.pubkey)).toEqual([A, C]);
    const b = c.active.find((p) => p.pubkey === B);
    expect(b).toEqual({ pubkey: B, firstRunMs: NOW - 40 * DAY, lastRunMs: NOW - 3 * HOUR, runs: 2, selfRuns: 0 });
  });

  it("orders each list newest first", () => {
    const c = growthCohorts(records, { range: "7d", now: NOW, exclude: [] });
    expect(c.active.map((p) => p.pubkey)).toEqual([OBSERVER, A, B, C]);
  });
});
