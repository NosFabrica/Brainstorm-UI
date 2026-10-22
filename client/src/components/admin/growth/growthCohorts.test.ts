import { describe, expect, it } from "vitest";
import { growthCohorts } from "./growthCohorts";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
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
// records. A person is "new" when their earliest run falls in the range;
// "self-triggered" when they clicked Calculate themselves in it — their first
// run aside, which is sign-up or seeding and stamped `manual` either way;
// "scheduled only" when only the scheduler ran them; "dormant" when they ran
// before the range and not since.
describe("growthCohorts", () => {
  const records = [
    run(A, NOW - 2 * HOUR), // first ever run today: new, not (yet) self-triggered
    run(B, NOW - 40 * DAY), // an old hand…
    run(B, NOW - 3 * HOUR, "scheduled"), // …run by the scheduler today
    run(C, NOW - 5 * DAY), // joined this week…
    run(C, NOW - 4 * HOUR), // …and clicked again today
    run(D, NOW - 30 * DAY), // ran a month ago, nothing since
    run(OBSERVER, NOW - 1 * HOUR, "periodic"), // the system observer
  ];
  const opts = { now: NOW, exclude: [OBSERVER] };

  it("segments the range's people: new, self-triggered, scheduled only, dormant", () => {
    const c = growthCohorts(records, { ...opts, range: "24h" });
    expect(c.fresh.map((p) => p.pubkey)).toEqual([A]);
    expect(c.selfTriggered.map((p) => p.pubkey)).toEqual([C]);
    expect(c.scheduledOnly.map((p) => p.pubkey)).toEqual([B]);
    expect(c.dormant.map((p) => p.pubkey)).toEqual([D]);
    expect(c.active.length).toBe(3);
  });

  it("leaves a person's first run out of self-triggered, even when it's their own click", () => {
    const c = growthCohorts(records, { ...opts, range: "7d" });
    expect(c.fresh.map((p) => p.pubkey)).toEqual([A, C]);
    expect(c.selfTriggered.map((p) => p.pubkey)).toEqual([C]);
  });

  it("tells each person's self and scheduled runs in the range apart", () => {
    const c = growthCohorts(records, { ...opts, range: "7d" });
    const b = c.active.find((p) => p.pubkey === B);
    expect(b).toMatchObject({ runs: 2, selfRuns: 0, scheduledRuns: 1, firstRunMs: NOW - 40 * DAY });
    const cc = c.active.find((p) => p.pubkey === C);
    expect(cc).toMatchObject({ runs: 2, selfRuns: 1, scheduledRuns: 0 });
  });

  it("orders each list newest first", () => {
    const c = growthCohorts(records, { ...opts, range: "7d" });
    expect(c.active.map((p) => p.pubkey)).toEqual([A, B, C]);
  });
});
