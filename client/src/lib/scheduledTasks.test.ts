// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SCHEDULED_TASK_KIND,
  WEEKDAYS,
  describeDays,
  dowField,
  editSimpleSchedule,
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
  formatNext,
  describeCron,
  runsBeforeNoon,
  zoneLabel,
  withTaskName,
  withoutPublicClient,
  dateIn,
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
      ["cron", "0 6 * * *", "America/New_York", "1794300000", "later-value"],
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
      setAt: 1794300000,
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
      setSimpleSchedule(mixed, { time: "07:15", days: ["mon", "wed"] }, "Europe/Lisbon", WED),
      false,
      WED,
    );
    expect(edited).toEqual({
      // The cron tag stays public, set now, with the value after that kept.
      public: [
        ["cron", "15 7 * * 1,3", "Europe/Lisbon", String(WED / 1000), "later-value"],
        ["client", "other-app"],
      ],
      // paused wasn't there: it goes private. claim, ran, options: untouched.
      private: [...mixed.private, ["paused"]],
    });
  });

  it("resumes by removing paused from whichever side has it", () => {
    const paused = { public: [["paused"], ["desk", "tech"]], private: [["paused"], ["task", "observer"]] };
    expect(setEnabled(paused, true, WED)).toEqual({ public: [["desk", "tech"]], private: [["task", "observer"]] });
    // Pausing what is already paused changes nothing.
    expect(setEnabled(paused, false, WED)).toEqual(paused);
  });

  it("adds a cron tag privately when there was none", () => {
    const fresh = setSimpleSchedule(emptyTask("observer"), { time: "06:00", days: [...WEEKDAYS] }, "UTC", WED);
    expect(fresh).toEqual({
      public: [],
      private: [["task", "observer"], ["paused"], ["cron", "0 6 * * *", "UTC", String(WED / 1000)]],
    });
  });

  it("names the task only when no tag does", () => {
    expect(withTaskName({ public: [], private: [] }, "observer").private).toEqual([["task", "observer"]]);
    expect(withTaskName(mixed, "other")).toBe(mixed);
  });

  it("does not change the tags it was given", () => {
    const before = JSON.stringify(mixed);
    setEnabled(setSimpleSchedule(mixed, { time: "08:00", days: ["mon"] }, "UTC", WED), false, WED);
    setEnabled({ public: mixed.public, private: [...mixed.private, ["paused"]] }, true, WED);
    expect(JSON.stringify(mixed)).toBe(before);
  });

  it("drops a public client tag, and only that", () => {
    const amethyst: TaskTags = {
      public: [
        ["cron", "0 6 * * *", "UTC"],
        ["client", "Amethyst"],
      ],
      private: [
        ["task", "observer"],
        ["client", "kept: nobody else reads it"],
      ],
    };
    expect(withoutPublicClient(amethyst)).toEqual({
      public: [["cron", "0 6 * * *", "UTC"]],
      private: amethyst.private,
    });
    const clean = { public: [["cron", "0 6 * * *", "UTC"]], private: [] };
    expect(withoutPublicClient(clean)).toBe(clean);
  });

  it("starts a new task named and paused", () => {
    expect(readTask(emptyTask("observer"))).toEqual({
      task: "observer",
      enabled: false,
      cron: null,
      tz: null,
      setAt: 0,
      claim: null,
      ran: null,
    });
  });

  it("reads malformed tags as absent, and keeps them untouched on rewrite", () => {
    const odd: TaskTags = {
      public: [],
      private: [["task", ""], ["cron"], ["claim", "soon", "x"], ["ran", "yesterday"]],
    };
    expect(readTask(odd)).toEqual({
      task: null,
      enabled: true,
      cron: null,
      tz: null,
      setAt: 0,
      claim: null,
      ran: null,
    });
    expect(setEnabled(odd, false, WED).private).toEqual([...odd.private, ["paused"]]);
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
    const edited = readTask(setSimpleSchedule(fixture(), local, "Asia/Tokyo", WED));
    expect(edited).toMatchObject({ cron: "0 12 * * 2-6", tz: "Asia/Tokyo" });
    // The same instants either way.
    expect(nextCronAt(edited.cron, "Asia/Tokyo", WED)).toBe(nextCronAt("0 22 * * 1-5", "America/New_York", WED));
  });

  it("refuses a time that isn't one, a zone that isn't one, or no days", () => {
    expect(() => setSimpleSchedule(fixture(), { time: "24:00", days: ["mon"] }, "UTC", WED)).toThrow(RangeError);
    expect(() => setSimpleSchedule(fixture(), { time: "06:00", days: ["mon"] }, "Nowhere/Town", WED)).toThrow(
      RangeError,
    );
    expect(() => setSimpleSchedule(fixture(), { time: "06:00", days: [] }, "UTC", WED)).toThrow(RangeError);
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
    expect(status({ cron: "0 6 * * MON" })).toBe("unreadable-schedule");
    expect(status({ cron: "0 6 30 2 *" })).toBe("never");
  });

  it("reads a cron with a missing or unknown zone as unreadable (NIP-FB), never as a schedule to run or edit", () => {
    const missing = readTask({
      public: [],
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * 1-5"],
      ],
    });
    const empty = readTask(fixture({ tz: "" }));
    // Intl throws on these: not IANA zones.
    const unknown = readTask(fixture({ tz: "Nowhere/Town" }));
    const junk = readTask(fixture({ tz: "+05:00" }));
    for (const task of [missing, empty, unknown, junk]) {
      expect(task.cron).toBe("0 6 * * 1-5");
      expect(task.tz).toBeNull();
      expect(taskStatus(task, WED)).toBe("unreadable-schedule");
      expect(nextRunAt(task, WED)).toBeNull();
      expect(lastDue(task, WED)).toBeNull();
      expect(missedRun({ ...task, ran: 1 }, WED)).toBeNull();
      // Not a time and weekdays to edit, though the expression alone would be one.
      expect(localSimple(task, "America/New_York", WED)).toBeNull();
      expect(localSimple(task, "UTC", WED)).toBeNull();
    }
    // Paused, it is off first; the zone is still not one.
    expect(taskStatus(readTask(fixture({ tz: "Nowhere/Town", enabled: false })), WED)).toBe("off");
  });

  it("runs next on the next weekday, and not at all when it is off", () => {
    // Friday 15:00 UTC → Monday 06:00 New York.
    expect(iso(nextRunAt(readTask(fixture()), Date.UTC(2026, 10, 13, 15, 0)))).toBe("2026-11-16T11:00:00.000Z");
    expect(nextRunAt(readTask(fixture({ enabled: false })), WED)).toBeNull();
  });
});

describe("display", () => {
  it("names an instant's calendar date in a zone", () => {
    const at = Date.UTC(2026, 10, 11, 2, 0);
    expect(dateIn(at, "UTC")).toBe("2026-11-11");
    expect(dateIn(at, "America/New_York")).toBe("2026-11-10");
    expect(dateIn(at, "Asia/Tokyo")).toBe("2026-11-11");
  });

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

// --- review fixes -------------------------------------------------------------------

describe("the cron reader is no stricter than NIP-FB", () => {
  it("reads leading zeros and any step of at least 1", () => {
    expect(parseCron("00 06 * * 01-05")).toEqual(parseCron("0 6 * * 1-5"));
    expect(parseCron("0 0/1 * * *")).toBeNull(); // still no a/n
    expect(parseCron("*/100 * * * *")!.minute.flatMap((on, m) => (on ? [m] : []))).toEqual([0]);
    expect(parseCron("0 0-23/007 * * *")!.hour.flatMap((on, h) => (on ? [h] : []))).toEqual([0, 7, 14, 21]);
    expect(simpleShape("05 007 * * *")).toMatchObject({ hour: 7, minute: 5 });
  });

  it("still rejects values out of range, however they are written", () => {
    for (const bad of ["060 6 * * *", "0 024 * * *", "0 6 * * 008", "0 6 000 * *", "0 */000 * * *"]) {
      expect(parseCron(bad), bad).toBeNull();
    }
  });
});

describe("zones twelve or more hours ahead of UTC", () => {
  it("runs a time Auckland skips at the jump", () => {
    // 2026-09-27 02:00 NZST jumps to 03:00 NZDT: 02:30 runs at 03:00 NZDT, 14:00 UTC the day before.
    expect(iso(nextCronAt("30 2 * * *", "Pacific/Auckland", Date.UTC(2026, 8, 26, 12, 0)))).toBe(
      "2026-09-26T14:00:00.000Z",
    );
  });

  it("runs a time Chatham skips at the jump, quarter hours and all", () => {
    // 2026-09-27 02:45 +12:45 jumps to 03:45 +13:45: 03:00 runs at 03:45 +13:45.
    expect(iso(nextCronAt("0 3 * * *", "Pacific/Chatham", Date.UTC(2026, 8, 26, 10, 0)))).toBe(
      "2026-09-26T14:00:00.000Z",
    );
  });

  it("runs a time Auckland repeats at its first occurrence", () => {
    // 2026-04-05 03:00 NZDT falls back to 02:00 NZST: the first 02:30 is NZDT, 13:30 UTC.
    expect(iso(nextCronAt("30 2 * * *", "Pacific/Auckland", Date.UTC(2026, 3, 4, 10, 0)))).toBe(
      "2026-04-04T13:30:00.000Z",
    );
    expect(iso(prevCronAt("30 2 * * *", "Pacific/Auckland", Date.UTC(2026, 3, 4, 15, 0)))).toBe(
      "2026-04-04T13:30:00.000Z",
    );
  });

  it("agrees with the slow path on every day of a year with changes", () => {
    for (const tz of ["Pacific/Auckland", "Pacific/Chatham", "America/New_York", "Europe/London", "Asia/Kolkata"]) {
      let at = Date.UTC(2026, 0, 1);
      for (let i = 0; i < 400; i++) {
        const next = nextCronAt("15 2 * * *", tz, at)!;
        // Every occurrence is 02:15 on its own clock, or the jump that skipped it.
        expect(next > at, tz).toBe(true);
        expect(prevCronAt("15 2 * * *", tz, next), tz).toBe(next);
        at = next;
      }
    }
  });
});

describe("the simple editor across a daylight-saving change", () => {
  // Saturday 2026-03-07 17:00 UTC: New York's clocks skip 02:00–03:00 tomorrow.
  const SAT = Date.UTC(2026, 2, 7, 17, 0);

  it("shows the cron's own time on a gap day, not the time it is moved to", () => {
    const task = readTask(fixture({ cron: "30 2 * * 1-5", tz: "America/New_York" }));
    expect(localSimple(task, "America/New_York", SAT)).toMatchObject({ time: "02:30" });
    // In another zone, from an occurrence the change didn't move: Monday 02:30 EDT is 06:30 UTC.
    expect(localSimple(task, "UTC", SAT)).toMatchObject({ time: "06:30", days: ["mon", "tue", "wed", "thu", "fri"] });
  });

  it("saves what it showed: adding Saturday keeps 02:30", () => {
    const tags = fixture({ cron: "30 2 * * 1-5", tz: "America/New_York" });
    const local = localSimple(readTask(tags), "America/New_York", SAT)!;
    const saved = setSimpleSchedule(tags, { ...local, days: [...local.days, "sat"] }, "America/New_York", SAT);
    expect(readTask(saved).cron).toBe("30 2 * * 1-6");
  });

  it("takes the weekday and the time from the same occurrence", () => {
    // Monday 04:30 London. On Sunday 8 March New York has changed and London hasn't: that
    // morning is 23:30 Saturday in New York, but Monday's run is 00:30 Monday.
    const task = readTask(fixture({ cron: "30 4 * * 1", tz: "Europe/London" }));
    expect(localSimple(task, "America/New_York", SAT)).toMatchObject({ time: "00:30", days: ["mon"] });
  });
});

describe("when cron was last set (NIP-FB's fourth value)", () => {
  const due = Date.UTC(2026, 10, 11, 11, 0); // this morning's 06:00 New York
  const later = due + 4 * 3_600_000;
  const withSetAt = (setAt: string | undefined, ran = due / 1000 - 86_400) => {
    const tags = fixture({ cron: "0 6 * * *", ran });
    const cron = tags.private.find((t) => t[0] === "cron")!;
    if (setAt !== undefined) cron.push(setAt);
    return tags;
  };

  it("reads it, as 0 when absent or not a time", () => {
    expect(readTask(withSetAt("1794300000")).setAt).toBe(1794300000);
    expect(readTask(withSetAt(undefined)).setAt).toBe(0);
    expect(readTask(withSetAt("soon")).setAt).toBe(0);
  });

  it("never reports a run due before it as missed", () => {
    expect(missedRun(readTask(withSetAt(undefined)), later)).not.toBeNull();
    expect(missedRun(readTask(withSetAt(String(due / 1000 + 1))), later)).toBeNull();
    expect(missedRun(readTask(withSetAt(String(due / 1000))), later)).not.toBeNull();
  });

  it("is set to now when the schedule changes, and kept when it doesn't", () => {
    const tags = withSetAt("1794300000");
    const now = Date.UTC(2026, 10, 11, 16, 0);
    const changed = setSimpleSchedule(tags, { time: "07:00", days: [...WEEKDAYS] }, "America/New_York", now);
    expect(changed.private.find((t) => t[0] === "cron")).toEqual([
      "cron",
      "0 7 * * *",
      "America/New_York",
      String(now / 1000),
    ]);
    const same = setSimpleSchedule(tags, { time: "06:00", days: [...WEEKDAYS] }, "America/New_York", now);
    expect(same.private.find((t) => t[0] === "cron")?.[3]).toBe("1794300000");
  });

  it("keeps values after it", () => {
    const tags = withSetAt("1794300000");
    tags.private.find((t) => t[0] === "cron")!.push("future");
    const now = Date.UTC(2026, 10, 11, 16, 0);
    const changed = setSimpleSchedule(tags, { time: "07:00", days: ["mon"] }, "UTC", now);
    expect(changed.private.find((t) => t[0] === "cron")).toEqual([
      "cron",
      "0 7 * * 1",
      "UTC",
      String(now / 1000),
      "future",
    ]);
  });

  it("is set to now when the task resumes, so a paused morning isn't missed", () => {
    const now = Date.UTC(2026, 10, 11, 16, 0);
    const paused = setEnabled(withSetAt("1794300000"), false, now);
    expect(paused.private.find((t) => t[0] === "cron")?.[3]).toBe("1794300000");
    const resumed = setEnabled(paused, true, now);
    expect(readTask(resumed)).toMatchObject({ enabled: true, setAt: now / 1000 });
    expect(missedRun(readTask(resumed), now + 20 * 3_600_000)).toBeNull();
    // Resuming what wasn't paused changes nothing.
    expect(setEnabled(withSetAt("1794300000"), true, now)).toEqual(withSetAt("1794300000"));
  });
});

describe("the next run, said", () => {
  it("says the date when it is more than six days away", () => {
    const next = nextCronAt("0 6 1 * *", "UTC", WED)!;
    expect(formatNext(next, WED, "UTC", "en-US")).toBe("Tue, Dec 1, 6:00 AM");
    const soon = nextCronAt("0 6 * * 1", "UTC", WED)!;
    expect(formatNext(soon, WED, "UTC", "en-US")).toBe("Mon 6:00 AM");
  });
});

describe("a schedule the simple editor can't show, in words", () => {
  const words = (cron: string, tz = "America/New_York", viewer = tz) => describeCron(cron, tz, viewer, WED, "en-US");

  it("says the common shapes plainly, on the viewer's clock", () => {
    expect(words("0 6,18 * * *")).toBe("Twice a day, 6:00 AM and 6:00 PM");
    expect(words("0 6,18 * * 1-5")).toBe("Twice a day on weekdays, 6:00 AM and 6:00 PM");
    expect(words("0 */6 * * *")).toBe("Every 6 hours");
    expect(words("15 * * * *", "UTC", "Asia/Kolkata")).toBe("Every hour, at :45");
    expect(words("*/15 * * * *")).toBe("Every 15 minutes");
    expect(words("0 6 1 * *")).toBe("Monthly on the 1st at 6:00 AM");
    expect(words("0 6 1,15 * *", "UTC", "Europe/Lisbon")).toBe("Monthly on the 1st and 15th at 6:00 AM");
    expect(words("0 6 1 1 *", "UTC")).toBe("Yearly on Jan 1 at 6:00 AM");
    expect(words("0 6,18 * * *", "America/New_York", "Europe/Lisbon")).toBe("Twice a day, 11:00 AM and 11:00 PM");
  });

  it("keeps the schedule's own clock, and names it, where the viewer's would move the day", () => {
    // 06:00 on the 1st in Tokyo is the last day of the month before in New York.
    expect(words("0 6 1 * *", "Asia/Tokyo", "America/New_York")).toBe("Monthly on the 1st at 6:00 AM (Tokyo time)");
  });

  it("gives up on what it can't say plainly", () => {
    for (const cron of ["0 6 1-7 * 1", "0 6,7,8,9,10 * * *", "0 6 * * MON", "*/7 * * * *"]) {
      expect(words(cron), cron).toBeNull();
    }
  });

  it("knows a morning schedule from one that isn't", () => {
    expect(runsBeforeNoon("0 6,11 * * *", "UTC", "UTC", WED)).toBe(true);
    expect(runsBeforeNoon("0 6,18 * * *", "UTC", "UTC", WED)).toBe(false);
    // 06:00 New York is 20:00 in Tokyo.
    expect(runsBeforeNoon("0 6 * * *", "America/New_York", "Asia/Tokyo", WED)).toBe(false);
    expect(runsBeforeNoon("0 6 * * MON", "UTC", "UTC", WED)).toBeNull();
  });

  it("names a zone the way a sentence would", () => {
    expect(zoneLabel("America/New_York")).toBe("New York time");
    expect(zoneLabel("UTC")).toBe("UTC");
    expect(zoneLabel("Etc/UTC")).toBe("UTC");
  });
});

describe("an edit keeps the schedule's zone (NIP-FB: changing the time keeps the time zone)", () => {
  const cronOf = (tags: TaskTags) => tags.private.find((t) => t[0] === "cron");
  /** The next `count` runs after `from`, as `Wed 06:15` on `zone`'s clock. */
  const runs = (tags: TaskTags, from: number, count: number, zone: string) => {
    const task = readTask(tags);
    const out: string[] = [];
    let at = from;
    for (let i = 0; i < count; i++) {
      at = nextCronAt(task.cron, task.tz!, at)!;
      const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone }).format(new Date(at));
      out.push(`${day} ${wallTime(at, zone)}`);
    }
    return out;
  };

  it("a 15-minute nudge from London stays 06:15 in New York after London's clocks change", () => {
    // 20 March 2026: New York is on summer time, London not until the 29th.
    const now = Date.UTC(2026, 2, 20, 12, 0);
    const tags = fixture({ cron: "0 6 * * *" });
    const shown = localSimple(readTask(tags), "Europe/London", now)!;
    expect(shown).toEqual({ time: "10:00", days: [...WEEKDAYS] });
    const nudged = editSimpleSchedule(tags, { ...shown, time: "10:15" }, "Europe/London", now);
    expect(cronOf(nudged)).toEqual(["cron", "15 6 * * *", "America/New_York", String(now / 1000)]);
    // Never 05:15 in New York (10:15 London) once both are on summer time.
    const april = Date.UTC(2026, 3, 1);
    expect(runs(nudged, april, 3, "America/New_York")).toEqual(["Wed 06:15", "Thu 06:15", "Fri 06:15"]);
  });

  it("confirming what Auckland shows changes nothing: the same tags, setAt kept", () => {
    const now = Date.UTC(2026, 10, 11, 12, 0);
    const tags = fixture({ cron: "0 6 * * 1-5" });
    cronOf(tags)!.push("1794300000");
    const shown = localSimple(readTask(tags), "Pacific/Auckland", now)!;
    // 06:00 Monday in New York is midnight Tuesday in Auckland.
    expect(shown).toEqual({ time: "00:00", days: ["tue", "wed", "thu", "fri", "sat"] });
    expect(editSimpleSchedule(tags, shown, "Pacific/Auckland", now)).toBe(tags);
    // In any order the days come in.
    expect(editSimpleSchedule(tags, { ...shown, days: [...shown.days].reverse() }, "Pacific/Auckland", now)).toBe(tags);
  });

  it("an hour later on Auckland's clock is 07:00 on the same New York weekdays", () => {
    const now = Date.UTC(2026, 10, 11, 12, 0);
    const tags = fixture({ cron: "0 6 * * 1-5" });
    const shown = localSimple(readTask(tags), "Pacific/Auckland", now)!;
    const later = editSimpleSchedule(tags, { ...shown, time: "01:00" }, "Pacific/Auckland", now);
    expect(cronOf(later)).toEqual(["cron", "0 7 * * 1-5", "America/New_York", String(now / 1000)]);
    expect(runs(later, now, 3, "America/New_York")).toEqual(["Thu 07:00", "Fri 07:00", "Mon 07:00"]);
  });

  it("shifts the weekdays when the new time crosses midnight in the schedule's zone", () => {
    const now = Date.UTC(2026, 10, 11, 12, 0);
    const tags = fixture({ cron: "0 6 * * 1-5" });
    const shown = localSimple(readTask(tags), "Pacific/Auckland", now)!;
    // 23:00 on Auckland's Tuesday to Saturday is 05:00 the same day in New York.
    const late = editSimpleSchedule(tags, { ...shown, time: "23:00" }, "Pacific/Auckland", now);
    expect(readTask(late)).toMatchObject({ cron: "0 5 * * 2-6", tz: "America/New_York" });
    // Adding Auckland's Sunday at the time shown adds New York's Saturday.
    const sunday = editSimpleSchedule(tags, { ...shown, days: [...shown.days, "sun"] }, "Pacific/Auckland", now);
    expect(readTask(sunday)).toMatchObject({ cron: "0 6 * * 1-6", tz: "America/New_York" });
    // 22:00 Mon–Fri in New York is 12:00 Tue–Sat in Tokyo; 08:00 there is 18:00 the day before in New York.
    const ny = fixture({ cron: "0 22 * * 1-5" });
    const tokyo = localSimple(readTask(ny), "Asia/Tokyo", WED)!;
    expect(readTask(editSimpleSchedule(ny, { ...tokyo, time: "08:00" }, "Asia/Tokyo", WED))).toMatchObject({
      cron: "0 18 * * 1-5",
      tz: "America/New_York",
    });
  });

  it("edits the fields in place on the schedule's own clock", () => {
    const tags = fixture({ cron: "0 6 * * 1-5" });
    cronOf(tags)!.push("1794300000");
    const shown = localSimple(readTask(tags), "America/New_York", WED)!;
    expect(editSimpleSchedule(tags, shown, "America/New_York", WED)).toBe(tags);
    const moved = editSimpleSchedule(tags, { time: "07:30", days: ["mon", "sat"] }, "America/New_York", WED);
    expect(cronOf(moved)).toEqual(["cron", "30 7 * * 1,6", "America/New_York", String(WED / 1000)]);
    // The same fields written another way are the same schedule.
    const zeros = fixture({ cron: "00 06 * * 1,2,3,4,5" });
    expect(editSimpleSchedule(zeros, shown, "America/New_York", WED)).toBe(zeros);
  });

  it("refuses a time the viewer's clock skips that day", () => {
    // 29 March 2026 in London: 01:00 jumps to 02:00. Saturday 21:30 in New York is 02:30 Sunday there.
    const now = Date.UTC(2026, 2, 28, 12, 0);
    const tags = fixture({ cron: "30 21 * * 6" });
    const shown = localSimple(readTask(tags), "Europe/London", now)!;
    expect(shown).toEqual({ time: "02:30", days: ["sun"] });
    expect(() => editSimpleSchedule(tags, { ...shown, time: "01:45" }, "Europe/London", now)).toThrow(RangeError);
    expect(readTask(editSimpleSchedule(tags, { ...shown, time: "02:00" }, "Europe/London", now))).toMatchObject({
      cron: "0 21 * * 6",
      tz: "America/New_York",
    });
  });

  it("refuses a time the schedule's zone repeats when the schedule would run at the other one", () => {
    // 1 November 2026: New York reads 01:00–02:00 twice. Sunday 00:30 there is 04:30 UTC.
    const now = Date.UTC(2026, 9, 31, 12, 0);
    const tags = fixture({ cron: "30 0 * * 0" });
    const shown = localSimple(readTask(tags), "UTC", now)!;
    expect(shown).toEqual({ time: "04:30", days: ["sun"] });
    // 06:30 UTC is the second 01:30 in New York: the schedule would run at the first, an hour early.
    expect(() => editSimpleSchedule(tags, { ...shown, time: "06:30" }, "UTC", now)).toThrow(RangeError);
    // 05:30 UTC is the first: that is when it runs.
    expect(readTask(editSimpleSchedule(tags, { ...shown, time: "05:30" }, "UTC", now))).toMatchObject({
      cron: "30 1 * * 0",
      tz: "America/New_York",
    });
  });

  it("writes the viewer's own zone when there is no schedule yet", () => {
    const fresh = editSimpleSchedule(
      emptyTask("observer"),
      { time: "06:00", days: [...WEEKDAYS] },
      "Europe/London",
      WED,
    );
    expect(cronOf(fresh)).toEqual(["cron", "0 6 * * *", "Europe/London", String(WED / 1000)]);
  });

  it("refuses to rewrite a schedule it can't show, and what isn't a time", () => {
    expect(() =>
      editSimpleSchedule(fixture({ cron: "0 6,18 * * *" }), { time: "07:00", days: ["mon"] }, "UTC", WED),
    ).toThrow(RangeError);
    expect(() =>
      editSimpleSchedule(fixture({ tz: "Nowhere/Town" }), { time: "07:00", days: ["mon"] }, "UTC", WED),
    ).toThrow(RangeError);
    expect(() => editSimpleSchedule(fixture(), { time: "24:00", days: ["mon"] }, "UTC", WED)).toThrow(RangeError);
    expect(() => editSimpleSchedule(fixture(), { time: "06:00", days: [] }, "UTC", WED)).toThrow(RangeError);
  });
});
