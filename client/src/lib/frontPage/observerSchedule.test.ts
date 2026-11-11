// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCHEDULED_TASK_KIND, readTask } from "@/lib/scheduledTasks";
import {
  OBSERVER_TASK,
  SCHEDULE_D,
  SCHEDULE_KIND,
  emptyObserverSchedule,
  printedToday,
  printedTodayZone,
} from "./observerSchedule";

describe("where the morning paper lives", () => {
  it("is NIP-FB's kind, at the `d` the Observer fixes, each one constant", () => {
    expect(SCHEDULE_KIND).toBe(SCHEDULED_TASK_KIND);
    expect(SCHEDULE_D).toBe("observer");
    expect(OBSERVER_TASK).toBe(SCHEDULE_D);
  });

  it("starts off and named, with no schedule and nothing claimed", () => {
    expect(readTask(emptyObserverSchedule())).toEqual({
      task: "observer",
      enabled: false,
      cron: null,
      tz: null,
      setAt: 0,
      claim: null,
      ran: null,
    });
  });
});

describe("already printed today", () => {
  const NY = "America/New_York";
  // Wednesday 11 November 2026, 06:30 in New York (11:30 UTC): just after a 06:00 run.
  const now = Date.UTC(2026, 10, 11, 11, 30);
  /** Unix seconds of a New York wall time in November (EST, UTC-5). */
  const ny = (d: number, hh: number, mm = 0) => Math.floor(Date.UTC(2026, 10, d, hh + 5, mm) / 1000);

  it("does not count yesterday's 10:31, though it is under 20 hours old", () => {
    expect(printedToday([{ day: "2026-11-10", printedAt: ny(10, 10, 31) }], now, NY)).toBeNull();
  });

  it("counts today's 05:00", () => {
    const early = { day: "2026-11-11", printedAt: ny(11, 5) };
    expect(printedToday([early], now, NY)).toBe(early);
  });

  it("does not count last night's 21:00, though its UTC day is today", () => {
    // 21:00 New York is 02:00 UTC on the 11th.
    expect(printedToday([{ day: "2026-11-11", printedAt: ny(10, 21) }], now, NY)).toBeNull();
  });

  it("reads today on the zone it is given: the schedule's and the viewer's can disagree", () => {
    // 08:00 Wednesday in Tokyo is 18:00 Tuesday in New York.
    const tokyoMorning = { day: "2026-11-10", printedAt: Math.floor(Date.UTC(2026, 10, 10, 23, 0) / 1000) };
    expect(printedToday([tokyoMorning], now, NY)).toBeNull();
    expect(printedToday([tokyoMorning], now, "Asia/Tokyo")).toBe(tokyoMorning);
  });

  it("an entry without printedAt counts only when its UTC day is today's UTC date", () => {
    expect(printedToday([{ day: "2026-11-11" }], now, NY)).toEqual({ day: "2026-11-11" });
    expect(printedToday([{ day: "2026-11-10" }], now, NY)).toBeNull();
    // 20:00 in New York is already the 12th in UTC: the entry's day is UTC, whatever the zone.
    const evening = Date.UTC(2026, 10, 12, 1, 0);
    expect(printedToday([{ day: "2026-11-12" }], evening, NY)).toEqual({ day: "2026-11-12" });
    expect(printedToday([{ day: "2026-11-11" }], evening, NY)).toBeNull();
  });

  it("takes the newest of several", () => {
    const a = { day: "2026-11-11", printedAt: ny(11, 5) };
    const b = { day: "2026-11-11", printedAt: ny(11, 6, 10) };
    expect(printedToday([a, b], now, NY)).toBe(b);
  });

  it("ignores a printedAt far in the future", () => {
    expect(printedToday([{ day: "2026-11-11", printedAt: ny(11, 23) }], now, NY)).toBeNull();
    expect(printedToday([{ day: "2026-11-20", printedAt: ny(20, 6) }], now, NY)).toBeNull();
  });
});

describe("whose today", () => {
  const task = (cron: string | undefined, tz: string, paused = false) =>
    readTask({
      public: [],
      private: [
        ["task", "observer"],
        ...(cron !== undefined ? [["cron", cron, tz]] : []),
        ...(paused ? [["paused"]] : []),
      ],
    });

  it("is the schedule's zone when it can be read, paused or not", () => {
    expect(printedTodayZone(task("0 6 * * *", "America/New_York"), "Asia/Tokyo")).toBe("America/New_York");
    expect(printedTodayZone(task("0 6 * * *", "America/New_York", true), "Asia/Tokyo")).toBe("America/New_York");
  });

  it("is the viewer's without a readable schedule", () => {
    expect(printedTodayZone(null, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(printedTodayZone(task(undefined, ""), "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(printedTodayZone(task("0 6 * * *", ""), "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(printedTodayZone(task("0 6 * * *", "Mars/Olympus"), "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(printedTodayZone(task("0 6 * * MON", "America/New_York"), "Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});
