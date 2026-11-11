// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCHEDULED_TASK_KIND, readTask } from "@/lib/scheduledTasks";
import {
  OBSERVER_TASK,
  PRINTED_TODAY_WINDOW_MS,
  SCHEDULE_D,
  SCHEDULE_KIND,
  emptyObserverSchedule,
  printedToday,
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
  const now = Date.UTC(2026, 10, 11, 9, 0);
  const s = (ms: number) => Math.floor(ms / 1000);

  it("counts an edition printed in the last 20 hours", () => {
    const recent = { day: "2026-11-10", printedAt: s(now - 19 * 3_600_000) };
    expect(printedToday([recent], now)).toBe(recent);
  });

  it("not one printed more than 20 hours ago, even on today's UTC day", () => {
    expect(printedToday([{ day: "2026-11-10", printedAt: s(now - PRINTED_TODAY_WINDOW_MS - 1000) }], now)).toBeNull();
  });

  it("an entry without printedAt counts only when its UTC day is today", () => {
    expect(printedToday([{ day: "2026-11-11" }], now)).toEqual({ day: "2026-11-11" });
    expect(printedToday([{ day: "2026-11-10" }], now)).toBeNull();
  });

  it("takes the newest of several", () => {
    const a = { day: "2026-11-11", printedAt: s(now - 3_600_000) };
    const b = { day: "2026-11-11", printedAt: s(now - 600_000) };
    expect(printedToday([a, b], now)).toBe(b);
  });

  it("ignores a printedAt far in the future", () => {
    expect(printedToday([{ day: "2026-11-20", printedAt: s(now + 9 * 86_400_000) }], now)).toBeNull();
  });
});
