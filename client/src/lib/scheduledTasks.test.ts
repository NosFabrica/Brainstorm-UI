// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SCHEDULED_TASK_KIND,
  WEEKDAYS,
  describeDays,
  dowField,
  emptyTask,
  formatClock,
  lastDue,
  missedRun,
  prevCronAt,
  relativeDay,
  localSimple,
  nextCronAt,
  nextRunAt,
  parseCron,
  readTask,
  lastRun,
  setEnabled,
  setSimpleSchedule,
  simpleShape,
  taskStatus,
  wallTime,
  withTaskName,
  type TaskTags,
} from "./scheduledTasks";

interface Fields {
  cron?: string;
  tz?: string;
  enabled?: boolean;
  claim?: { due: number; id: string; by: string };
  ran?: number;
}

const DEFAULTS: Fields = {
  cron: "0 6 * * 1-5",
  tz: "America/New_York",
  enabled: true,
  claim: { due: 1794398400, id: "3f1c9a0e5b7d4c21", by: "Desktop (Linux)" },
  ran: 1794398520,
};

/** NIP-FB's example as private tags, with fields overridden (`undefined` drops a tag), plus a task option. */
function fixture(over: Fields = {}): TaskTags {
  const f = { ...DEFAULTS, ...over };
  const tags: string[][] = [["task", "observer"]];
  if (f.cron !== undefined) tags.push(["cron", f.cron, f.tz ?? ""]);
  if (!f.enabled) tags.push(["paused"]);
  if (f.claim) tags.push(["claim", String(f.claim.due), f.claim.id, f.claim.by]);
  if (f.ran !== undefined) tags.push(["ran", String(f.ran)]);
  tags.push(["desk", "tech"]);
  return { public: [], private: tags };
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
// Wednesday 2026-11-11 15:00 UTC = 10:00 in New York (EST, UTC-5).
const WED = Date.UTC(2026, 10, 11, 15, 0);

describe("the kind", () => {
  it("is NIP-FB's", () => {
    expect(SCHEDULED_TASK_KIND).toBe(34817);
  });
});

describe("tags, public and private", () => {
  // A task written by a client that keeps some tags public, with options and a tag from a later version.
  const mixed: TaskTags = {
    public: [
      ["cron", "0 6 * * *", "America/New_York", "later-value"],
      ["client", "other-app"],
    ],
    private: [
      ["task", "observer"],
      ["claim", "1794398400", "3f1c9a0e5b7d4c21", "Desktop (Linux)"],
      ["ran", "1794398520"],
      ["desk", "tech"],
      ["future", "a", "b"],
    ],
  };

  it("reads both sides as one", () => {
    expect(readTask(mixed)).toEqual({
      task: "observer",
      enabled: true,
      cron: "0 6 * * *",
      tz: "America/New_York",
      claim: { due: 1794398400, id: "3f1c9a0e5b7d4c21", by: "Desktop (Linux)", at: null },
      ran: 1794398520,
    });
    expect(readTask({ public: [["paused"]], private: [] }).enabled).toBe(false);
  });

  it("reads the private copy where both sides have one", () => {
    const both = { public: [["cron", "0 7 * * *", "UTC"]], private: [["cron", "0 6 * * *", "UTC"]] };
    expect(readTask(both).cron).toBe("0 6 * * *");
  });

  it("edits each tag where it was, keeps every other tag where it was, and adds new ones privately", () => {
    const edited = setEnabled(
      setSimpleSchedule(mixed, { time: "07:15", days: ["mon", "wed"] }, "Europe/Lisbon"),
      false,
    );
    expect(edited).toEqual({
      // The cron tag stays public, with the value after its zone.
      public: [
        ["cron", "15 7 * * 1,3", "Europe/Lisbon", "later-value"],
        ["client", "other-app"],
      ],
      // paused wasn't there: it goes private. claim, ran, options: untouched.
      private: [...mixed.private, ["paused"]],
    });
  });

  it("resumes by removing paused from whichever side has it", () => {
    const paused = { public: [["paused"], ["desk", "tech"]], private: [["paused"], ["task", "observer"]] };
    expect(setEnabled(paused, true)).toEqual({ public: [["desk", "tech"]], private: [["task", "observer"]] });
    // Pausing what is already paused changes nothing.
    expect(setEnabled(paused, false)).toEqual(paused);
  });

  it("adds a cron tag privately when there was none", () => {
    const fresh = setSimpleSchedule(emptyTask("observer"), { time: "06:00", days: [...WEEKDAYS] }, "UTC");
    expect(fresh).toEqual({ public: [], private: [["task", "observer"], ["paused"], ["cron", "0 6 * * *", "UTC"]] });
  });

  it("names the task only when no tag does", () => {
    expect(withTaskName({ public: [], private: [] }, "observer").private).toEqual([["task", "observer"]]);
    expect(withTaskName(mixed, "other")).toBe(mixed);
  });

  it("does not change the tags it was given", () => {
    const before = JSON.stringify(mixed);
    setEnabled(setSimpleSchedule(mixed, { time: "08:00", days: ["mon"] }, "UTC"), false);
    expect(JSON.stringify(mixed)).toBe(before);
  });

  it("starts a new task named and paused", () => {
    expect(readTask(emptyTask("observer"))).toEqual({
      task: "observer",
      enabled: false,
      cron: null,
      tz: null,
      claim: null,
      ran: null,
    });
  });

  it("reads malformed tags as absent, and keeps them untouched on rewrite", () => {
    const odd: TaskTags = {
      public: [],
      private: [["task", ""], ["cron"], ["claim", "soon", "x"], ["ran", "yesterday"]],
    };
    expect(readTask(odd)).toEqual({ task: null, enabled: true, cron: null, tz: null, claim: null, ran: null });
    expect(setEnabled(odd, false).private).toEqual([...odd.private, ["paused"]]);
    // A zone this browser doesn't know: the expression is read, the zone isn't.
    expect(readTask({ public: [], private: [["cron", "0 6 * * *", "Mars/Olympus"]] })).toMatchObject({
      cron: "0 6 * * *",
      tz: null,
    });
  });
});

describe("cron: the NIP's subset", () => {
  it("reads numbers, *, ranges, steps and lists", () => {
    const every6 = parseCron("0 */6 * * *")!;
    expect(every6.hour.flatMap((on, h) => (on ? [h] : []))).toEqual([0, 6, 12, 18]);
    const mixed = parseCron("5,10-20/5 6,18 1-7 1,6-8 1-5")!;
    expect(mixed.minute.flatMap((on, m) => (on ? [m] : []))).toEqual([5, 10, 15, 20]);
    expect(mixed.month.flatMap((on, m) => (on ? [m] : []))).toEqual([1, 6, 7, 8]);
  });

  it("splits fields on any whitespace", () => {
    expect(parseCron("0  6 * *\t1-5")).toEqual(parseCron("0 6 * * 1-5"));
    expect(parseCron(" 0 6 * * * ")).toEqual(parseCron("0 6 * * *"));
    expect(simpleShape("30  7 * * 1-5")).toMatchObject({ hour: 7, minute: 30 });
  });

  it("reads 7 as Sunday, like 0", () => {
    expect(parseCron("0 6 * * 7")!.dow[0]).toBe(true);
    expect(parseCron("0 6 * * 5-7")!.dow).toEqual([true, false, false, false, false, true, true]);
  });

  it("rejects what the NIP leaves out", () => {
    for (const bad of [
      "0 6 * * MON",
      "0 6 * JAN *",
      "0 0 6 * * *", // seconds
      "0 6 ? * *",
      "0 6 L * *",
      "0 6 * * 1#2",
      "0 6 15W * *",
      "@daily",
      "0 6 * *",
      "60 6 * * *",
      "0 24 * * *",
      "0 6 0 * *",
      "0 6 * 13 *",
      "0 6 * * 8",
      "0 6/2 * * *", // a/n
      "0 */0 * * *",
      "0 9-5 * * *",
      "0 6,,7 * * *",
      "",
    ]) {
      expect(parseCron(bad), bad).toBeNull();
    }
  });

  it("ORs day of month and day of week when both are restricted, as cron does", () => {
    // The 13th, or any Friday. Wed 11 Nov → Fri 13 Nov (both), then Fri 20, then 13 Dec (a Sunday).
    const at1 = nextCronAt("0 6 13 * 5", "UTC", WED);
    expect(iso(at1)).toBe("2026-11-13T06:00:00.000Z");
    const at2 = nextCronAt("0 6 13 * 5", "UTC", at1!);
    expect(iso(at2)).toBe("2026-11-20T06:00:00.000Z");
    // The 1st, or any Monday: Mon 16 Nov comes before 1 Dec.
    expect(iso(nextCronAt("0 6 1 * 1", "UTC", WED))).toBe("2026-11-16T06:00:00.000Z");
  });

  it("counts a step like */2 as restricted, so it ORs too", () => {
    // Odd days of the month, or any Friday: Thu 12 is neither, Fri 13 is both, Sat 14 neither, Sun 15 odd.
    const at = nextCronAt("0 6 */2 * 5", "UTC", Date.UTC(2026, 10, 12, 7, 0));
    expect(iso(at)).toBe("2026-11-13T06:00:00.000Z");
    expect(iso(nextCronAt("0 6 */2 * 5", "UTC", at!))).toBe("2026-11-15T06:00:00.000Z");
    // With only day of week: Fridays alone.
    expect(iso(nextCronAt("0 6 * * 5", "UTC", at!))).toBe("2026-11-20T06:00:00.000Z");
  });

  it("ANDs them when either is *", () => {
    // Only Fridays: day of month is *.
    expect(iso(nextCronAt("0 6 * * 5", "UTC", WED))).toBe("2026-11-13T06:00:00.000Z");
    // Only the 1st: day of week is *.
    expect(iso(nextCronAt("0 6 1 * *", "UTC", WED))).toBe("2026-12-01T06:00:00.000Z");
  });

  it("finds a leap day, and says never for a date that doesn't exist", () => {
    expect(iso(nextCronAt("0 6 29 2 *", "UTC", WED))).toBe("2028-02-29T06:00:00.000Z");
    expect(nextCronAt("0 6 31 2 *", "UTC", WED)).toBeNull();
    expect(nextCronAt("not cron", "UTC", WED)).toBeNull();
  });

  it("is read in its zone", () => {
    expect(iso(nextCronAt("0 6 * * *", "America/New_York", WED))).toBe("2026-11-12T11:00:00.000Z");
    expect(iso(nextCronAt("0 6 * * *", "America/New_York", Date.UTC(2026, 10, 11, 10, 0)))).toBe(
      "2026-11-11T11:00:00.000Z",
    );
    // Summer time: 06:00 New York is 10:00 UTC.
    expect(iso(nextCronAt("0 6 * * *", "America/New_York", Date.UTC(2026, 6, 1, 12, 0)))).toBe(
      "2026-07-02T10:00:00.000Z",
    );
    // 06:00 in Tokyo (UTC+9) is 21:00 UTC the day before; its Monday is Sunday in UTC.
    expect(iso(nextCronAt("0 6 * * *", "Asia/Tokyo", WED))).toBe("2026-11-11T21:00:00.000Z");
    expect(iso(nextCronAt("0 6 * * 1", "Asia/Tokyo", WED))).toBe("2026-11-15T21:00:00.000Z");
  });

  it("runs a time the clocks skip at the first instant after it", () => {
    // 2026-03-08 in New York: 02:00 EST jumps to 03:00 EDT, so 02:30 never happens.
    expect(iso(nextCronAt("30 2 * * *", "America/New_York", Date.UTC(2026, 2, 8, 0, 0)))).toBe(
      "2026-03-08T07:00:00.000Z", // 03:00 EDT
    );
  });

  it("runs a time the clocks repeat at its first occurrence only", () => {
    // 2026-11-01 in New York: 01:00–02:00 happens twice, EDT then EST.
    const first = nextCronAt("30 1 * * *", "America/New_York", Date.UTC(2026, 10, 1, 0, 0));
    expect(iso(first)).toBe("2026-11-01T05:30:00.000Z"); // 01:30 EDT
    // From between the two, the repeat is skipped: next is the following day.
    expect(iso(nextCronAt("30 1 * * *", "America/New_York", first!))).toBe("2026-11-02T06:30:00.000Z");
  });

  it("finds the next minute of an every-minute schedule", () => {
    expect(iso(nextCronAt("* * * * *", "Europe/Lisbon", WED + 1000))).toBe("2026-11-11T15:01:00.000Z");
  });
});

describe("the simple editor's shape", () => {
  it("is a single minute and hour on some weekdays, nothing more", () => {
    expect(simpleShape("0 6 * * *")).toMatchObject({ hour: 6, minute: 0 });
    expect(simpleShape("30 22 * * 1-5")!.dow).toEqual([false, true, true, true, true, true, false]);
    for (const not of ["0 6,18 * * *", "0 */6 * * *", "0 6 1 * *", "0 6 * 1 *", "0-5 6 * * *", "bad"]) {
      expect(simpleShape(not), not).toBeNull();
    }
  });

  it("writes days as cron does: * for all, ranges for runs of three", () => {
    expect(dowField(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).toBe("*");
    expect(dowField(["mon", "tue", "wed", "thu", "fri"])).toBe("1-5");
    expect(dowField(["sun", "sat"])).toBe("0,6");
    expect(dowField(["mon", "wed", "thu", "fri"])).toBe("1,3-5");
    expect(dowField(["mon", "tue"])).toBe("1,2");
  });

  it("shows the time and days on the viewer's clock, shifting days across midnight", () => {
    const ny = readTask(fixture({ cron: "0 22 * * 1-5" }));
    expect(localSimple(ny, "America/New_York", WED)).toEqual({
      time: "22:00",
      days: ["mon", "tue", "wed", "thu", "fri"],
    });
    // 22:00 Mon–Fri in New York is 12:00 Tue–Sat in Tokyo.
    expect(localSimple(ny, "Asia/Tokyo", WED)).toEqual({ time: "12:00", days: ["tue", "wed", "thu", "fri", "sat"] });
    // 01:00 Mon in Lisbon is 20:00 Sun in New York.
    const lisbon = readTask(fixture({ cron: "0 1 * * 1", tz: "Europe/Lisbon" }));
    expect(localSimple(lisbon, "America/New_York", WED)).toEqual({ time: "20:00", days: ["sun"] });
    expect(localSimple(readTask(fixture({ cron: "0 6,18 * * *" })), "UTC", WED)).toBeNull();
  });

  it("round-trips through an edit in the viewer's zone", () => {
    const ny = readTask(fixture({ cron: "0 22 * * 1-5" }));
    const local = localSimple(ny, "Asia/Tokyo", WED)!;
    const edited = readTask(setSimpleSchedule(fixture(), local, "Asia/Tokyo"));
    expect(edited).toMatchObject({ cron: "0 12 * * 2-6", tz: "Asia/Tokyo" });
    // The same instants either way.
    expect(nextCronAt(edited.cron, "Asia/Tokyo", WED)).toBe(nextCronAt("0 22 * * 1-5", "America/New_York", WED));
  });

  it("refuses a time that isn't one, a zone that isn't one, or no days", () => {
    expect(() => setSimpleSchedule(fixture(), { time: "24:00", days: ["mon"] }, "UTC")).toThrow(RangeError);
    expect(() => setSimpleSchedule(fixture(), { time: "06:00", days: ["mon"] }, "Nowhere/Town")).toThrow(RangeError);
    expect(() => setSimpleSchedule(fixture(), { time: "06:00", days: [] }, "UTC")).toThrow(RangeError);
  });
});

describe("claim and status", () => {
  it("reads the claim tolerantly", () => {
    const claim = (...values: string[]) => readTask({ public: [], private: [["claim", ...values]] }).claim;
    expect(claim("1794398400", "3f1c", "Desktop (Linux)", "1794398431")).toEqual({
      due: 1794398400,
      id: "3f1c",
      by: "Desktop (Linux)",
      at: 1794398431,
    });
    expect(readTask(fixture()).claim).toEqual({
      due: 1794398400,
      id: "3f1c9a0e5b7d4c21",
      by: "Desktop (Linux)",
      at: null,
    });
    expect(claim("5")).toEqual({ due: 5, id: "", by: null, at: null });
    expect(claim("5", "id", "  ", "later")).toEqual({ due: 5, id: "id", by: null, at: null });
    expect(claim("soon", "id", "x")).toBeNull();
    expect(claim("-5")).toBeNull();
    expect(claim()).toBeNull();
  });

  it("names who printed last only when the finished run is that claim's", () => {
    expect(lastRun(readTask(fixture()))).toEqual({ at: 1794398520_000, by: "Desktop (Linux)" });
    // A newer claim still running: the last run was someone's, but not necessarily its.
    expect(lastRun(readTask(fixture({ claim: { ...DEFAULTS.claim!, due: 1794484800 } })))).toEqual({
      at: 1794398520_000,
      by: null,
    });
    expect(lastRun(readTask(fixture({ ran: undefined })))).toBeNull();
  });

  it("says why it does or doesn't run", () => {
    const status = (over: object) => taskStatus(readTask(fixture({ ...over })), WED);
    expect(status({})).toBe("scheduled");
    expect(status({ claim: undefined, ran: undefined })).toBe("scheduled");
    expect(status({ enabled: false })).toBe("off");
    expect(status({ cron: undefined })).toBe("no-schedule");
    expect(status({ tz: "Nowhere/Town" })).toBe("no-schedule");
    expect(status({ cron: "0 6 * * MON" })).toBe("unreadable-schedule");
    expect(status({ cron: "0 6 30 2 *" })).toBe("never");
  });

  it("runs next on the next weekday, and not at all when it is off", () => {
    // Friday 15:00 UTC → Monday 06:00 New York.
    expect(iso(nextRunAt(readTask(fixture()), Date.UTC(2026, 10, 13, 15, 0)))).toBe("2026-11-16T11:00:00.000Z");
    expect(nextRunAt(readTask(fixture({ enabled: false })), WED)).toBeNull();
  });
});

describe("display", () => {
  it("shows an instant on the viewer's clock", () => {
    const at = nextCronAt("0 6 * * *", "America/New_York", WED)!;
    expect(wallTime(at, "Europe/Lisbon")).toBe("11:00");
    expect(wallTime(at, "America/Los_Angeles")).toBe("03:00");
    expect(wallTime(at, "Asia/Kolkata")).toBe("16:30");
    expect(formatClock(at, "America/New_York", "en-US")).toBe("6:00 AM");
    expect(formatClock(at, "Europe/Lisbon", "en-GB")).toBe("11:00");
  });

  it("says days in a few words", () => {
    expect(describeDays(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).toBe("every");
    expect(describeDays(["mon", "tue", "wed", "thu", "fri"])).toBe("weekdays");
    expect(describeDays(["sun", "sat"])).toBe("weekends");
    expect(describeDays(["sun", "mon", "wed", "fri"], "en-US")).toBe("Mon, Wed, Fri, Sun");
  });
});

describe("the previous occurrence", () => {
  it("is the latest match at or before now, in its zone", () => {
    // Wed 10:00 New York: this morning's 06:00.
    expect(iso(prevCronAt("0 6 * * *", "America/New_York", WED))).toBe("2026-11-11T11:00:00.000Z");
    // Monday 05:00 New York, weekdays: last Friday's.
    expect(iso(prevCronAt("0 6 * * 1-5", "America/New_York", Date.UTC(2026, 10, 16, 10, 0)))).toBe(
      "2026-11-13T11:00:00.000Z",
    );
    expect(iso(prevCronAt("0 * * * *", "UTC", WED + 59 * 60_000))).toBe("2026-11-11T15:00:00.000Z");
  });

  it("agrees with nextCronAt on the instants, DST included", () => {
    for (const [cron, tz, from] of [
      ["0 6 * * *", "America/New_York", WED],
      ["30 2 * * *", "America/New_York", Date.UTC(2026, 2, 8, 0, 0)], // skipped
      ["30 1 * * *", "America/New_York", Date.UTC(2026, 10, 1, 0, 0)], // repeated
      ["0 6 13 * 5", "UTC", WED],
    ] as const) {
      const next = nextCronAt(cron, tz, from)!;
      expect(prevCronAt(cron, tz, next), cron).toBe(next);
      expect(prevCronAt(cron, tz, next - 1)! < next, cron).toBe(true);
    }
  });
});

describe("liveness", () => {
  const task = (over: object) => readTask(fixture({ cron: "0 6 * * *", ...over }));
  // This morning's run was due at 11:00 UTC.
  const due = Date.UTC(2026, 10, 11, 11, 0);
  const s = (ms: number) => ms / 1000;

  it("counts an occurrence as due only once it is more than three hours old", () => {
    const ranYesterday = s(due - 86_400_000 + 60_000);
    // At exactly due + 3 h, this morning's isn't due yet: yesterday's is, and it ran.
    expect(lastDue(task({}), due + 3 * 3_600_000)).toBe(due - 86_400_000);
    expect(missedRun(task({ ran: ranYesterday }), due + 3 * 3_600_000)).toBeNull();
    // A moment later it is, and the last run was yesterday's.
    expect(lastDue(task({}), due + 3 * 3_600_000 + 1)).toBe(due);
    expect(missedRun(task({ ran: ranYesterday }), due + 3 * 3_600_000 + 1)).toEqual({
      due,
      ran: ranYesterday * 1000,
    });
  });

  it("counts a run at or after the occurrence as done", () => {
    const later = due + 5 * 3_600_000;
    expect(missedRun(task({ ran: s(due) }), later)).toBeNull();
    expect(missedRun(task({ ran: s(due + 120_000) }), later)).toBeNull();
    expect(missedRun(task({ ran: s(due) - 1 }), later)).not.toBeNull();
  });

  it("works for an hourly task", () => {
    const hourly = task({ cron: "0 * * * *" });
    // 15:30: the newest due more than 3 h ago is 12:00.
    const now = Date.UTC(2026, 10, 11, 15, 30);
    expect(iso(lastDue(hourly, now))).toBe("2026-11-11T12:00:00.000Z");
    expect(missedRun({ ...hourly, ran: s(Date.UTC(2026, 10, 11, 12, 1)) }, now)).toBeNull();
    expect(missedRun({ ...hourly, ran: s(Date.UTC(2026, 10, 11, 11, 1)) }, now)?.due).toBe(
      Date.UTC(2026, 10, 11, 12, 0),
    );
  });

  it("says nothing without a `ran`, or when the task doesn't run", () => {
    const late = due + 30 * 3_600_000;
    expect(missedRun(task({ ran: undefined }), late)).toBeNull();
    expect(missedRun(task({ ran: 1, enabled: false }), late)).toBeNull();
    expect(missedRun(task({ ran: 1, cron: "0 6 * * MON" }), late)).toBeNull();
  });

  it("says a past day the way a person would", () => {
    const now = Date.UTC(2026, 10, 11, 15, 0); // Wednesday
    expect(relativeDay(now - 3_600_000, now, "UTC", "en-US")).toBe("today");
    expect(relativeDay(now - 86_400_000, now, "UTC", "en-US")).toBe("yesterday");
    expect(relativeDay(Date.UTC(2026, 10, 9, 8, 0), now, "UTC", "en-US")).toBe("Monday");
    expect(relativeDay(Date.UTC(2026, 10, 3, 8, 0), now, "UTC", "en-US")).toBe("Nov 3");
  });
});
