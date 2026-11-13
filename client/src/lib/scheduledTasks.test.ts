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
  sameZone,
  formatAgo,
  paramValues,
  privateTagsPeer,
  privateTagsReadPeers,
  removeParam,
  setParam,
  setRunner,
  type Weekday,
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
      writtenTz: "America/New_York",
      setAt: 1794300000,
      claim: { due: 1794398400, id: "3f1c9a0e5b7d4c21", by: "Desktop (Linux)", at: null },
      ran: 1794398520,
      params: [],
      runners: [],
      runner: null,
      runnerConflict: false,
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
      writtenTz: null,
      setAt: 0,
      claim: null,
      ran: null,
      params: [],
      runners: [],
      runner: null,
      runnerConflict: false,
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
      writtenTz: null,
      setAt: 0,
      claim: null,
      ran: null,
      params: [],
      runners: [],
      runner: null,
      runnerConflict: false,
    });
    expect(setEnabled(odd, false, WED).private).toEqual([...odd.private, ["paused"]]);
    // A zone this browser doesn't know: the expression is read, the zone isn't, and what
    // was written is kept for showing.
    expect(readTask({ public: [], private: [["cron", "0 6 * * *", "Mars/Olympus"]] })).toMatchObject({
      cron: "0 6 * * *",
      tz: null,
      writtenTz: "Mars/Olympus",
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
    expect([missing, empty, unknown, junk].map((t) => t.writtenTz)).toEqual([null, null, "Nowhere/Town", "+05:00"]);
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

describe("the cross-zone editor round trip (audit, 2026-11-12)", () => {
  const zones = [
    "America/New_York",
    "Europe/London",
    "Asia/Tokyo",
    "Pacific/Auckland",
    "Asia/Kolkata",
    "Australia/Lord_Howe",
    "Pacific/Chatham",
    "America/Sao_Paulo",
    "UTC",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
  ];
  const times = ["00:00", "01:30", "02:30", "05:45", "12:00", "23:30"];
  const daySets: Weekday[][] = [[...WEEKDAYS], ["mon", "tue", "wed", "thu", "fri"], ["sun"], ["sat", "sun"]];
  // Each near a change somewhere: the US's and the EU's spring and autumn, the southern ones.
  const nows = [
    Date.UTC(2026, 10, 12, 12),
    Date.UTC(2026, 2, 7, 12),
    Date.UTC(2026, 2, 28, 3),
    Date.UTC(2026, 9, 31, 20),
    Date.UTC(2026, 3, 4, 13),
    Date.UTC(2026, 8, 26, 12),
  ];
  const base = (tz: string): TaskTags => ({
    public: [],
    private: [
      ["task", "observer"],
      ["cron", "0 6 * * 1-5", tz, "1"],
    ],
  });
  const sameSet = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((d) => b.includes(d));
  const longName = (d: Weekday) =>
    new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + WEEKDAYS.indexOf(d))),
    );

  /** How far `tz` is ahead of UTC at `instant`, in minutes, from Intl alone. */
  const offsetMinutes = (instant: number, tz: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - instant) / 60_000;
  };
  /**
   * Whether any schedule in `tz` would show the pick, found another way than the editor
   * does: each gap between the two clocks in the next month, the picked time less it.
   */
  const anyShows = (tags: TaskTags, time: string, days: Weekday[], tz: string, viewerTz: string, now: number) => {
    const gaps = new Set<number>();
    for (let at = now; at < now + 30 * 86_400_000; at += 6 * 3_600_000) {
      gaps.add(offsetMinutes(at, viewerTz) - offsetMinutes(at, tz));
    }
    const wall = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    return [...gaps].some((gap) => {
      const there = wall - gap;
      const shift = Math.floor(there / 1440);
      const t = there - shift * 1440;
      const moved = days.map((d) => WEEKDAYS[(WEEKDAYS.indexOf(d) + shift + 7) % 7]);
      const hhmm = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      const back = localSimple(readTask(setSimpleSchedule(tags, { time: hhmm, days: moved }, tz, now)), viewerTz, now);
      return !!back && back.time === time && sameSet(back.days, days);
    });
  };

  it("shows what was picked, never writes on a confirm, and refuses only what no schedule could show", () => {
    const failures: string[] = [];
    for (const now of nows) {
      for (const sz of zones) {
        for (const vz of zones) {
          if (sz === vz) continue;
          const tags = base(sz);
          const shown = localSimple(readTask(tags), vz, now)!;
          if (editSimpleSchedule(tags, shown, vz, now) !== tags) failures.push(`confirm wrote ${sz} ${vz} ${iso(now)}`);
          for (const time of times) {
            for (const days of daySets) {
              const what = `${iso(now)} ${sz} seen from ${vz}: ${time} ${days.join(",")}`;
              let out: TaskTags;
              try {
                out = editSimpleSchedule(tags, { time, days }, vz, now);
              } catch (e) {
                const message = (e as Error).message;
                // The reason is a day the reader picked, and no schedule in the zone could show it.
                if (!days.some((d) => message.includes(longName(d)))) failures.push(`${what} refused: ${message}`);
                if (anyShows(tags, time, days, sz, vz, now)) failures.push(`${what} refused what could be: ${message}`);
                continue;
              }
              const task = readTask(out);
              if (task.tz !== sz) failures.push(`${what} moved the zone to ${task.tz}`);
              const back = localSimple(task, vz, now);
              if (!back || back.time !== time || !sameSet(back.days, days)) {
                failures.push(`${what} wrote ${task.cron}, shows ${back?.time} ${back?.days.join(",")}`);
              } else if (editSimpleSchedule(out, back, vz, now) !== out) {
                failures.push(`${what} confirming it again wrote`);
              }
            }
          }
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
  }, 60_000);

  it("saves the hour picked from London on a New York schedule the day before the US change", () => {
    const now = Date.UTC(2026, 2, 7, 12);
    const tags = base("America/New_York");
    const out = editSimpleSchedule(tags, { time: "00:00", days: [...WEEKDAYS] }, "Europe/London", now);
    // Saturday 19:00 in New York is midnight in London tonight; Monday, after the change, it reads 23:00.
    expect(readTask(out)).toMatchObject({ cron: "0 19 * * *", tz: "America/New_York" });
    expect(localSimple(readTask(out), "Europe/London", now)).toEqual({ time: "00:00", days: [...WEEKDAYS] });
    expect(editSimpleSchedule(out, { time: "00:00", days: [...WEEKDAYS] }, "Europe/London", now)).toBe(out);
  });

  it("doesn't refuse over a day the reader didn't pick", () => {
    // Saturday 7 March: New York skips 02:30 on Sunday, a day this reader leaves out.
    const now = Date.UTC(2026, 2, 7, 12);
    const tokyo = base("Asia/Tokyo");
    const weekdays: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
    const out = editSimpleSchedule(tokyo, { time: "02:30", days: weekdays }, "America/New_York", now);
    expect(readTask(out).tz).toBe("Asia/Tokyo");
    expect(localSimple(readTask(out), "America/New_York", now)).toEqual({ time: "02:30", days: weekdays });
    // With Sunday picked, it does: that Sunday has no 02:30.
    expect(() => editSimpleSchedule(tokyo, { time: "02:30", days: ["sun"] }, "America/New_York", now)).toThrow(
      /Sunday/,
    );
  });
});

describe("no change is the same tags (audit, 2026-11-12)", () => {
  const paused: TaskTags = {
    public: [],
    private: [["task", "observer"], ["cron", "0 6 * * *", "UTC", "1"], ["paused"]],
  };

  it("pausing a paused task", () => {
    expect(setEnabled(paused, false, WED)).toBe(paused);
    const publicPause: TaskTags = { public: [["paused"]], private: [["task", "observer"]] };
    expect(setEnabled(publicPause, false, WED)).toBe(publicPause);
  });

  it("setting the expression and zone it already has", () => {
    const tags = fixture({ cron: "0 6 * * *", tz: "UTC" });
    expect(setSimpleSchedule(tags, { time: "06:00", days: [...WEEKDAYS] }, "UTC", WED)).toBe(tags);
  });
});

describe("a stepped weekday field is not a simple schedule (audit, 2026-11-12)", () => {
  it("is left to the details view, as Quartz's SimpleCron.parse does", () => {
    expect(simpleShape("0 6 * * */2")).toBeNull();
    expect(simpleShape("0 6 * * 1-5/2")).toBeNull();
    expect(localSimple(readTask(fixture({ cron: "0 6 * * */2" })), "America/New_York", WED)).toBeNull();
    expect(simpleShape("0 6 * * 1-5")).not.toBeNull();
  });
});

describe("one zone by any of its names (audit, 2026-11-12)", () => {
  it("knows a renamed zone, and UTC's spellings, as the same", () => {
    expect(sameZone("Asia/Calcutta", "Asia/Kolkata")).toBe(true);
    expect(sameZone("UTC", "Etc/UTC")).toBe(true);
    expect(sameZone("Etc/GMT", "UTC")).toBe(true);
    expect(sameZone("Europe/Kiev", "Europe/Kyiv")).toBe(true);
    expect(sameZone("America/New_York", "Europe/London")).toBe(false);
    // Same offset today, different rules: not the same.
    expect(sameZone("Europe/London", "Africa/Abidjan")).toBe(false);
    expect(sameZone("America/New_York", "America/Toronto")).toBe(true);
  });

  it("edits a schedule written under the other name in place", () => {
    const tags = fixture({ cron: "0 6 * * 1-5", tz: "Asia/Calcutta" });
    expect(localSimple(readTask(tags), "Asia/Kolkata", WED)).toEqual({
      time: "06:00",
      days: ["mon", "tue", "wed", "thu", "fri"],
    });
    const moved = editSimpleSchedule(tags, { time: "07:00", days: ["mon"] }, "Asia/Kolkata", WED);
    expect(readTask(moved)).toMatchObject({ cron: "0 7 * * 1", tz: "Asia/Calcutta" });
  });
});

describe("params (NIP-FB `param`)", () => {
  const tags: TaskTags = {
    public: [["param", "desk", "tech"]],
    private: [
      ["task", "observer"],
      ["param", "model", "anthropic/claude-sonnet-4.5"],
      ["param", "desk", "art"],
      ["param", "size", "a3"],
    ],
  };

  it("reads every param in order, private first, repeats included", () => {
    expect(readTask(tags).params).toEqual([
      { name: "model", values: ["anthropic/claude-sonnet-4.5"] },
      { name: "desk", values: ["art"] },
      { name: "size", values: ["a3"] },
      { name: "desk", values: ["tech"] },
    ]);
    expect(paramValues(readTask(tags), "desk")).toEqual(["art"]);
    expect(paramValues(readTask(tags), "key")).toBeNull();
    // A param without a name isn't one.
    expect(readTask({ public: [], private: [["param"], ["param", " "]] }).params).toEqual([]);
  });

  it("sets one in the first one's place and drops the rest of that name, keeping every other param where it was", () => {
    const out = setParam(tags, "desk", ["science"]);
    expect(out.private).toEqual([
      ["task", "observer"],
      ["param", "model", "anthropic/claude-sonnet-4.5"],
      ["param", "desk", "science"],
      ["param", "size", "a3"],
    ]);
    expect(out.public).toEqual([]);
  });

  it("keeps a param on the public side when that's where it was", () => {
    const pub: TaskTags = { public: [["param", "model", "x"]], private: [["task", "observer"]] };
    expect(setParam(pub, "model", ["y"])).toEqual({
      public: [["param", "model", "y"]],
      private: [["task", "observer"]],
    });
  });

  it("adds a new one to the private side, and no change is the same object", () => {
    const out = setParam(tags, "key", ["https://openrouter.ai/api/v1", "a3f9"]);
    expect(out.private.at(-1)).toEqual(["param", "key", "https://openrouter.ai/api/v1", "a3f9"]);
    expect(out.public).toBe(tags.public);
    expect(setParam(out, "key", ["https://openrouter.ai/api/v1", "a3f9"])).toBe(out);
  });

  it("removes one on both sides, and the same object when there was none", () => {
    expect(removeParam(tags, "desk")).toEqual({
      public: [],
      private: [
        ["task", "observer"],
        ["param", "model", "anthropic/claude-sonnet-4.5"],
        ["param", "size", "a3"],
      ],
    });
    expect(removeParam(tags, "key")).toBe(tags);
  });

  it("keeps unknown params through every other edit", () => {
    const edited = setEnabled(setSimpleSchedule(tags, { time: "06:00", days: [...WEEKDAYS] }, "UTC", WED), true, WED);
    expect(readTask(edited).params.map((p) => p.name)).toEqual(["model", "desk", "size", "desk"]);
  });
});

describe("the runner (NIP-FB `p`)", () => {
  const ME = "a".repeat(64);
  const ASSISTANT = "b".repeat(64);
  const OTHER = "c".repeat(64);
  const base: TaskTags = {
    public: [],
    private: [
      ["task", "observer"],
      ["cron", "0 6 * * *", "UTC", "1"],
    ],
  };

  it("names none until a public p does; a private p is just a tag", () => {
    expect(readTask(base)).toMatchObject({ runners: [], runner: null, runnerConflict: false });
    expect(readTask({ public: [], private: [["p", ASSISTANT]] }).runner).toBeNull();
    expect(readTask({ public: [["p", ASSISTANT]], private: [] })).toMatchObject({
      runners: [ASSISTANT],
      runner: ASSISTANT,
      runnerConflict: false,
    });
  });

  it("calls two a conflict, and a p that isn't a key no runner", () => {
    expect(
      readTask({
        public: [
          ["p", ASSISTANT],
          ["p", OTHER],
        ],
        private: [],
      }),
    ).toMatchObject({
      runner: null,
      runnerConflict: true,
    });
    expect(readTask({ public: [["p", "npub1nope"]], private: [] })).toMatchObject({
      runner: null,
      runnerConflict: false,
    });
  });

  it("names a runner publicly, replaces every public p, and clears to none", () => {
    const named = setRunner(base, ASSISTANT, 1000);
    // The private tags stay, with cron marked as set then.
    expect(named).toEqual({
      public: [["p", ASSISTANT]],
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * *", "UTC", "1"],
      ],
    });
    expect(setRunner(named, ASSISTANT, 1000)).toBe(named);
    const conflict: TaskTags = {
      public: [
        ["p", ASSISTANT],
        ["x", "1"],
        ["p", OTHER],
      ],
      private: [["p", OTHER]],
    };
    expect(setRunner(conflict, ASSISTANT, 1)).toEqual({
      public: [
        ["x", "1"],
        ["p", ASSISTANT],
      ],
      private: [["p", OTHER]],
    });
    expect(setRunner(conflict, null, 1)).toEqual({ public: [["x", "1"]], private: [["p", OTHER]] });
    expect(setRunner(base, null, 1)).toBe(base);
    expect(() => setRunner(base, "not a key", 1)).toThrow(RangeError);
  });

  it("encrypts to the runner when there is one, else to self (a conflict too)", () => {
    expect(privateTagsPeer(base, ME)).toBe(ME);
    expect(privateTagsPeer(setRunner(base, ASSISTANT, 1), ME)).toBe(ASSISTANT);
    expect(
      privateTagsPeer(
        {
          public: [
            ["p", ASSISTANT],
            ["p", OTHER],
          ],
          private: [],
        },
        ME,
      ),
    ).toBe(ME);
  });

  it("reads with the one runner, then self; anything else with self first", () => {
    expect(privateTagsReadPeers([], ME)).toEqual([ME]);
    expect(privateTagsReadPeers([["p", ASSISTANT]], ME)).toEqual([ASSISTANT, ME]);
    expect(
      privateTagsReadPeers(
        [
          ["p", ASSISTANT],
          ["p", "junk"],
          ["p", OTHER],
          ["p", ME],
        ],
        ME,
      ),
    ).toEqual([ME, ASSISTANT, OTHER]);
  });
});

describe("formatAgo", () => {
  const T = Date.UTC(2026, 10, 12, 12, 0);
  it("says how long ago, in the largest whole unit up to days", () => {
    expect(formatAgo(T - 20_000, T)).toBe("just now");
    expect(formatAgo(T - 5 * 60_000, T)).toBe("5 minutes ago");
    expect(formatAgo(T - 3 * 3_600_000, T)).toBe("3 hours ago");
    expect(formatAgo(T - 30 * 3_600_000, T)).toBe("30 hours ago");
    expect(formatAgo(T - 3 * 86_400_000, T)).toBe("3 days ago");
  });
});

/** Quartz's ScheduledTaskParamsTest, case for case, so both apps edit params the same way. */
describe("ported: Quartz ScheduledTaskParamsTest", () => {
  const task: TaskTags = {
    public: [
      ["param", "size", "big"],
      ["param", "topic", "public"],
    ],
    private: [
      ["task", "observer"],
      ["param", "topic", "nostr"],
      ["cron", "0 6 * * *", "UTC"],
      ["param", "model", "m1"],
      ["param", "topic", "bitcoin"],
    ],
  };
  const values = (tags: TaskTags, name: string) =>
    readTask(tags)
      .params.filter((p) => p.name === name)
      .map((p) => p.values);

  it("theParamTagCarriesANameThenItsValues", () => {
    const one = (tag: string[]) => readTask({ public: [], private: [tag] }).params;
    expect(one(["param", "model", "anthropic/claude-sonnet-4.5"])).toEqual([
      { name: "model", values: ["anthropic/claude-sonnet-4.5"] },
    ]);
    expect(one(["param", "flag"])).toEqual([{ name: "flag", values: [] }]);
    expect(one(["param"])).toEqual([]);
    expect(one(["param", " "])).toEqual([]);
    expect(one(["cron", "model"])).toEqual([]);
  });

  it("paramsAreOrderedAndRepeatablePrivateFirst", () => {
    expect(readTask(task).params.map((p) => p.name)).toEqual(["topic", "model", "topic", "size", "topic"]);
    expect(values(task, "topic").map((v) => v[0])).toEqual(["nostr", "bitcoin", "public"]);
    expect(paramValues(readTask(task), "model")).toEqual(["m1"]);
    expect(paramValues(readTask(task), "size")).toEqual(["big"]);
    expect(paramValues(readTask(task), "missing")).toBeNull();
  });

  it("settingANameReplacesEveryTagOfItAtTheFirstOnesPlace", () => {
    const set = setParam(task, "topic", ["art"]);
    expect(values(set, "topic")).toEqual([["art"]]);
    expect(set.private[1]).toEqual(["param", "topic", "art"]);
    expect(set.private.map((t) => t[0])).toEqual(["task", "param", "cron", "param"]);
    expect(set.public.map((t) => t[0])).toEqual(["param"]);
    expect(set.public[0][2]).toBe("big");
    expect(paramValues(readTask(set), "model")).toEqual(["m1"]);
  });

  it("aPublicOnlyParamIsSetOnThePublicSideAndANewOneGoesPrivate", () => {
    const size = setParam(task, "size", ["small"]);
    expect(size.public[0]).toEqual(["param", "size", "small"]);
    expect(size.private).toHaveLength(task.private.length);
    const added = setParam(task, "length", ["short"]);
    expect(added.private.at(-1)).toEqual(["param", "length", "short"]);
    expect(added.public).toHaveLength(task.public.length);
  });

  it("removingANameKeepsEveryOtherParam", () => {
    const removed = removeParam(task, "topic");
    expect(readTask(removed).params.map((p) => p.name)).toEqual(["model", "size"]);
    expect(removed.public.map((t) => t[0])).toEqual(["param"]);
    expect(removeParam(task, "missing")).toBe(task);
  });
});

/** Quartz's ScheduledTaskRunnerTest, where it applies to the author's client (not the runner's decisions). */
describe("ported: Quartz ScheduledTaskRunnerTest", () => {
  const ASSISTANT = "b".repeat(64);
  const STRANGER = "c".repeat(64);
  const daily: TaskTags = {
    public: [],
    private: [
      ["task", "observer"],
      ["cron", "0 6 * * *", "America/New_York", "0"],
      ["param", "model", "anthropic/claude-sonnet-4.5"],
    ],
  };

  it("aPublicPNamesTheRunner", () => {
    expect(readTask(daily).runner).toBeNull();
    expect(readTask(daily).runners).toEqual([]);
    const run = setRunner(daily, ASSISTANT, WED);
    expect(readTask(run)).toMatchObject({ runner: ASSISTANT, runnerConflict: false });
    expect(run.public.at(-1)).toEqual(["p", ASSISTANT]);
    // Read from the public tags only: a private `p` is just a tag that stays.
    const privateP: TaskTags = { public: daily.public, private: [...daily.private, ["p", ASSISTANT]] };
    expect(readTask(privateP)).toMatchObject({ runner: null, runners: [] });
    expect(setRunner(privateP, null, WED).private.filter((t) => t[0] === "p")).toHaveLength(1);
  });

  it("twoRunnersAreAConflictAndNobodyRunsIt", () => {
    const two: TaskTags = {
      public: [
        ["p", ASSISTANT],
        ["p", STRANGER],
      ],
      private: daily.private,
    };
    expect(readTask(two)).toMatchObject({ runnerConflict: true, runner: null });
    expect(readTask(two).runners.length > 0).toBe(true);
    expect(readTask(setRunner(two, ASSISTANT, WED)).runner).toBe(ASSISTANT);
    // A `p` that isn't a key names nobody who can run it, and the author's devices still don't.
    const odd: TaskTags = { public: [["p", "not-a-key"]], private: daily.private };
    expect(readTask(odd)).toMatchObject({ runner: null, runnerConflict: false, runners: ["not-a-key"] });
  });

  it("theAuthorStillReadsAConflict, and our writer encrypts a conflict to self", () => {
    const two: TaskTags = {
      public: [
        ["p", STRANGER],
        ["p", ASSISTANT],
      ],
      private: daily.private,
    };
    const me = "a".repeat(64);
    // Self first: our writer encrypts a conflict to self.
    expect(privateTagsReadPeers(two.public, me)).toEqual([me, STRANGER, ASSISTANT]);
    expect(privateTagsPeer(two, me)).toBe(me);
  });

  it("otherwise decrypts to self only", () => {
    const me = "a".repeat(64);
    expect(privateTagsReadPeers(daily.public, me)).toEqual([me]);
    expect(privateTagsPeer(daily, me)).toBe(me);
    // A single p that isn't a key: no runner to encrypt to.
    expect(privateTagsPeer({ public: [["p", "not-a-key"]], private: [] }, me)).toBe(me);
  });

  it("aHandRunTaskWithParamsAndNoCronNeverRunsOnItsOwn", () => {
    const settingsOnly: TaskTags = {
      public: [],
      private: [
        ["task", "observer"],
        ["param", "model", "m"],
      ],
    };
    expect(taskStatus(readTask(settingsOnly), WED)).toBe("no-schedule");
  });

  it("clearingAndMovingTheRunnerKeepsEverythingElse", () => {
    const run = setRunner(setSimpleSchedule(daily, { time: "06:00", days: [...WEEKDAYS] }, "UTC", WED), ASSISTANT, WED);
    const moved = setRunner(run, STRANGER, WED);
    expect(readTask(moved).runner).toBe(STRANGER);
    expect(moved.private).toEqual(run.private);
    expect(setRunner(moved, null, WED).public).toEqual([]);
  });
});

describe("the runner and cron's setAt; who counts as a runner (audit, 2026-11-12)", () => {
  const ME = "a".repeat(64);
  const ASSISTANT = "b".repeat(64);
  const OTHER = "c".repeat(64);
  const SET = 1_794_300_000;
  const NOW_MS = 1_794_400_000_000;
  const scheduled: TaskTags = {
    public: [],
    private: [
      ["task", "observer"],
      ["cron", "0 6 * * *", "UTC", String(SET), "kept"],
    ],
  };
  const setAtOf = (tags: TaskTags) => readTask(tags).setAt;

  it("naming the runner sets cron's setAt to now, as resuming does", () => {
    const named = setRunner(scheduled, ASSISTANT, NOW_MS);
    expect(setAtOf(named)).toBe(NOW_MS / 1000);
    // The values after setAt stay.
    expect(named.private[1]).toEqual(["cron", "0 6 * * *", "UTC", String(NOW_MS / 1000), "kept"]);
  });

  it("clearing or moving the runner sets it too", () => {
    const named: TaskTags = { public: [["p", ASSISTANT]], private: scheduled.private };
    expect(setAtOf(setRunner(named, null, NOW_MS))).toBe(NOW_MS / 1000);
    expect(setAtOf(setRunner(named, OTHER, NOW_MS))).toBe(NOW_MS / 1000);
  });

  it("no change keeps setAt, and a task without cron gets none", () => {
    const named: TaskTags = { public: [["p", ASSISTANT]], private: scheduled.private };
    expect(setRunner(named, ASSISTANT, NOW_MS)).toBe(named);
    const settingsOnly: TaskTags = { public: [], private: [["task", "observer"]] };
    expect(setRunner(settingsOnly, ASSISTANT, NOW_MS).private).toEqual([["task", "observer"]]);
  });

  it("a runner is a lowercase 64-hex key that isn't the author", () => {
    expect(readTask({ public: [["p", ME]], private: [] }, ME)).toMatchObject({ runner: null, runners: [ME] });
    expect(readTask({ public: [["p", ASSISTANT.toUpperCase()]], private: [] }, ME).runner).toBeNull();
    expect(readTask({ public: [["p", ASSISTANT]], private: [] }, ME).runner).toBe(ASSISTANT);
  });

  it("a p naming the author still names a runner: the devices don't print it, and it is written to self", () => {
    const self: TaskTags = { public: [["p", ME]], private: [] };
    expect(readTask(self, ME).runners.length > 0).toBe(true);
    expect(privateTagsPeer(self, ME)).toBe(ME);
    expect(privateTagsReadPeers(self.public, ME)).toEqual([ME]);
  });

  it("an invalid p is read with self first, and written to self", () => {
    const upper: TaskTags = { public: [["p", ASSISTANT.toUpperCase()]], private: [] };
    expect(privateTagsPeer(upper, ME)).toBe(ME);
    // Another writer may have encrypted to it as written: tried after self.
    expect(privateTagsReadPeers(upper.public, ME)).toEqual([ME, ASSISTANT.toUpperCase()]);
  });
});

describe("ported: Quartz ScheduledTaskRunnerTest, fae3e873", () => {
  const NY = "America/New_York";
  const READER = "a".repeat(64);
  const ASSISTANT = "b".repeat(64);
  const STRANGER = "c".repeat(64);
  const DAY = 86_400;
  // 06:00 New York on Wednesday 2026-11-11, in seconds.
  const six = Date.UTC(2026, 10, 11, 11, 0) / 1000;
  const ms = (sec: number) => sec * 1000;
  const daily: TaskTags = {
    public: [],
    private: [
      ["task", "observer"],
      ["cron", "0 6 * * *", NY, "0"],
    ],
  };
  const withP = (tags: TaskTags, ...ps: string[][]): TaskTags => ({
    public: [...tags.public, ...ps],
    private: tags.private,
  });

  it("clearingTheRunnerAfterItPrintedNeverPrintsThatMorningAgain", () => {
    // Named last month; a device last printed weeks ago; the runner printed 06:00 today.
    const ran: TaskTags = { public: [], private: [...daily.private, ["ran", String(six - 30 * DAY)]] };
    const run = setRunner(ran, ASSISTANT, ms(six - 30 * DAY));
    const tenAm = six + 4 * 3_600;
    const cleared = readTask(setRunner(run, null, ms(tenAm)));
    expect(cleared.setAt).toBe(tenAm);
    // Nothing is due for the devices this morning, and nothing warns about it.
    expect(lastDue(cleared, ms(tenAm + 60))).toBeNull();
    expect(missedRun(cleared, ms(tenAm + 60))).toBeNull();
    expect(missedRun(cleared, ms(six + DAY - 1))).toBeNull();
    // Tomorrow is the devices' again, and so is its warning (past NIP-FB's three hours).
    expect(lastDue(cleared, ms(six + DAY + 4 * 3_600))).toBe(ms(six + DAY));
    expect(missedRun(cleared, ms(six + DAY + 4 * 3_600))).toMatchObject({ due: ms(six + DAY) });
  });

  it("namingARunnerWhileADevicePrintsNeverPrintsTwice", () => {
    const named = readTask(setRunner(daily, ASSISTANT, ms(six + 60)));
    expect(named.setAt).toBe(six + 60);
    // The schedule restarted after 06:00: today's morning is nobody's, the first is tomorrow.
    expect(lastDue(named, ms(six + 4 * 3_600))).toBeNull();
    expect(lastDue(named, ms(six + DAY + 4 * 3_600))).toBe(ms(six + DAY));
  });

  it("onlyAChangeOfRunnerRestartsTheSchedule", () => {
    const run = setRunner(daily, ASSISTANT, ms(100));
    expect(readTask(run).setAt).toBe(100);
    expect(setRunner(run, ASSISTANT, ms(200))).toBe(run);
    expect(setRunner(daily, null, ms(200))).toBe(daily);
    expect(readTask(setRunner(run, STRANGER, ms(200))).setAt).toBe(200);
    expect(readTask(setRunner(run, null, ms(200))).setAt).toBe(200);
    // Two runners become one: a change.
    const two = withP(run, ["p", STRANGER]);
    expect(readTask(setRunner(two, ASSISTANT, ms(300))).setAt).toBe(300);
    // Without a cron there is nothing to restart.
    const settingsOnly: TaskTags = { public: [], private: [["task", "observer"]] };
    expect(readTask(setRunner(settingsOnly, ASSISTANT, ms(300))).cron).toBeNull();
    // The zone and the expression stay as they were.
    expect(readTask(setRunner(run, null, ms(300)))).toMatchObject({ tz: NY, cron: "0 6 * * *" });
  });

  it("aPThatIsntALowercaseKeyOfSomeoneElseStopsDevicesAndNobodyRuns", () => {
    for (const odd of [ASSISTANT.toUpperCase(), READER, "", "npub1xyz"]) {
      const task = withP(daily, ["p", odd]);
      expect(readTask(task, READER).runners.length > 0).toBe(true);
      expect(readTask(task, READER).runner).toBeNull();
      expect(privateTagsPeer(task, READER)).toBe(READER);
    }
    // A `p` with no value at all isn't one.
    expect(readTask(withP(daily, ["p"]), READER).runners).toEqual([]);
  });

  it("theAuthorTriesThePeerItsWriterEncryptsToFirst", () => {
    // One runner: the runner first.
    expect(privateTagsReadPeers([["p", ASSISTANT]], READER)).toEqual([ASSISTANT, READER]);
    // A conflict: our writer encrypts to self, so self first.
    expect(
      privateTagsReadPeers(
        [
          ["p", STRANGER],
          ["p", ASSISTANT],
        ],
        READER,
      ),
    ).toEqual([READER, STRANGER, ASSISTANT]);
  });
});
