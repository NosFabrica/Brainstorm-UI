// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SCHEDULED_TASK_KIND, readTask } from "@/lib/scheduledTasks";
import {
  OBSERVER_TASK,
  SCHEDULE_D,
  SCHEDULE_KIND,
  emptyObserverSchedule,
  keyParamValues,
  lastPrinted,
  observerUnderstands,
  unknownObserverParams,
  missedOnSites,
  observerKeyChoice,
  observerModel,
  pickObserverKey,
  printedFor,
  printedToday,
  printedTodayZone,
  whoPrints,
  withObserverKey,
  withObserverModel,
  withRememberedModel,
} from "./observerSchedule";
import { setEnabled, setParam, setRunner, type TaskTags } from "@/lib/scheduledTasks";
import { parseAgentKeys } from "@/lib/agentKeys";

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

describe("the Observer's settings, as params", () => {
  const OR = "https://openrouter.ai/api/v1";
  const keys = [
    { key: "sk-or-v1-first-1111", url: OR },
    { key: "sk-or-v1-second-a3f9", url: `${OR}/` },
    { key: "sk-ant-zzzz", url: "https://api.anthropic.com/v1" },
    { key: "", url: "http://localhost:11434/v1" },
  ];
  const task = (params: string[][]) => readTask({ public: [], private: [["task", "observer"], ...params] });

  it("reads the model and the key choice; missing, neither", () => {
    expect(observerModel(task([]))).toBeNull();
    expect(observerKeyChoice(task([]))).toBeNull();
    expect(observerModel(task([["param", "model", " anthropic/claude-sonnet-4.5 "]]))).toBe(
      "anthropic/claude-sonnet-4.5",
    );
    expect(observerKeyChoice(task([["param", "key", OR, "a3f9"]]))).toEqual({ url: OR, suffix: "a3f9" });
    expect(observerKeyChoice(task([["param", "key", OR]]))).toEqual({ url: OR, suffix: null });
    expect(observerKeyChoice(task([["param", "key", ""]]))).toBeNull();
  });

  it("picks the key at the URL with the suffix, else the first at the URL, else the first", () => {
    expect(pickObserverKey(task([]), keys)).toBe(keys[0]);
    expect(pickObserverKey(null, keys)).toBe(keys[0]);
    // The trailing slash a reader strips doesn't make another endpoint.
    expect(pickObserverKey(task([["param", "key", OR, "a3f9"]]), keys)).toBe(keys[1]);
    expect(pickObserverKey(task([["param", "key", OR, "0000"]]), keys)).toBe(keys[0]);
    expect(pickObserverKey(task([["param", "key", "https://api.anthropic.com/v1/", "zzzz"]]), keys)).toBe(keys[2]);
    expect(pickObserverKey(task([["param", "key", "https://api.openai.com/v1", "x"]]), keys)).toBe(keys[0]);
    expect(pickObserverKey(task([["param", "key", "http://localhost:11434/v1"]]), keys)).toBe(keys[3]);
    expect(pickObserverKey(task([]), [])).toBeNull();
  });

  it("writes the key as its URL and last four characters, never the key", () => {
    // The URL as the key stores it (Quartz's `keyValues`); matching ignores the trailing `/`.
    expect(keyParamValues(keys[1])).toEqual([`${OR}/`, "a3f9"]);
    expect(keyParamValues(keys[3])).toEqual(["http://localhost:11434/v1"]);
    const tags = withObserverKey(emptyObserverSchedule(), keys[1]);
    expect(JSON.stringify(tags)).not.toContain("sk-or-v1-second");
    expect(pickObserverKey(readTask(tags), keys)).toBe(keys[1]);
    expect(withObserverKey(tags, null)).toEqual(emptyObserverSchedule());
  });

  it("writes the model, and a blank one removes it", () => {
    const tags = withObserverModel(emptyObserverSchedule(), "openai/gpt-4o-mini");
    expect(observerModel(readTask(tags))).toBe("openai/gpt-4o-mini");
    expect(withObserverModel(tags, " ")).toEqual(emptyObserverSchedule());
  });

  it("migrates the remembered model on the first edit, never over one the schedule names", () => {
    const remembered = (url: string) => (url === OR ? "meta/llama-3.3" : null);
    const out = withRememberedModel(emptyObserverSchedule(), keys, remembered);
    expect(observerModel(readTask(out))).toBe("meta/llama-3.3");
    const named = withObserverModel(emptyObserverSchedule(), "x/y");
    expect(withRememberedModel(named, keys, remembered)).toBe(named);
    // Remembered for another endpoint than the one the schedule prints with: nothing.
    const anthropic = withObserverKey(emptyObserverSchedule(), keys[2]);
    expect(withRememberedModel(anthropic, keys, remembered)).toBe(anthropic);
  });
});

describe("who prints", () => {
  const ASSISTANT = "b".repeat(64);
  const base: TaskTags = emptyObserverSchedule();
  it("reads devices, the Assistant, another key, or a conflict", () => {
    expect(whoPrints(readTask(base), ASSISTANT)).toBe("devices");
    expect(whoPrints(readTask(setRunner(base, ASSISTANT, 0)), ASSISTANT)).toBe("assistant");
    expect(whoPrints(readTask(setRunner(base, ASSISTANT, 0)), null)).toBe("other");
    expect(whoPrints(readTask(setRunner(base, "c".repeat(64), 0)), ASSISTANT)).toBe("other");
    expect(
      whoPrints(
        readTask({
          public: [
            ["p", ASSISTANT],
            ["p", "c".repeat(64)],
          ],
          private: [],
        }),
        ASSISTANT,
      ),
    ).toBe("conflict");
    expect(whoPrints(readTask({ public: [["p", "not-a-key"]], private: [] }), ASSISTANT)).toBe("invalid");
  });
});

describe("two sites: the reader's and their Assistant's", () => {
  const NY = "America/New_York";
  const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);
  const ed = (iso: string, printed = true) => ({
    day: iso.slice(0, 10),
    ...(printed ? { printedAt: sec(iso) } : {}),
  });
  // 06:00 New York every day, set long ago, run by the Assistant.
  const schedule = readTask(
    setRunner(
      {
        public: [],
        private: [
          ["task", "observer"],
          ["cron", "0 6 * * *", NY, "1"],
        ],
      },
      "b".repeat(64),
      1000,
    ),
  );
  // 2026-11-12 06:00 New York is 11:00 UTC; at 15:00 UTC it is more than 3 hours past.
  const DUE = Date.parse("2026-11-12T11:00:00Z");
  const NOW = Date.parse("2026-11-12T15:00:00Z");

  it("counts a paper printed that day on the schedule's clock, before the run or after", () => {
    expect(printedFor(ed("2026-11-12T10:00:00Z"), DUE, NY)).toBe(true); // 05:00 manual print
    expect(printedFor(ed("2026-11-12T14:00:00Z"), DUE, NY)).toBe(true);
    expect(printedFor(ed("2026-11-12T02:00:00Z"), DUE, NY)).toBe(false); // 21:00 last night
    expect(printedFor(ed("2026-11-12T00:00:00Z", false), DUE, NY)).toBe(true); // UTC day, no time
    expect(printedFor(ed("2026-11-11T00:00:00Z", false), DUE, NY)).toBe(false);
  });

  it("takes the newest dated print from either, the reader's on a tie", () => {
    expect(lastPrinted([], [])).toBeNull();
    expect(lastPrinted([ed("2026-11-11T00:00:00Z", false)], [])).toBeNull();
    const mine = ed("2026-11-11T11:00:00Z");
    const theirs = ed("2026-11-12T11:05:00Z");
    expect(lastPrinted([mine], [theirs])).toMatchObject({ byRunner: true, at: Date.parse("2026-11-12T11:05:00Z") });
    expect(lastPrinted([theirs], [mine])).toMatchObject({ byRunner: false });
    expect(lastPrinted([theirs], [theirs])).toMatchObject({ byRunner: false });
  });

  it("warns 3 hours after a morning with no paper on either site, not before, and not with one on either", () => {
    expect(missedOnSites(schedule, [], [], NOW)).toBe(DUE);
    expect(missedOnSites(schedule, [], [], Date.parse("2026-11-12T13:59:00Z"))).not.toBe(DUE);
    expect(missedOnSites(schedule, [], [ed("2026-11-12T11:02:00Z")], NOW)).toBeNull();
    expect(missedOnSites(schedule, [ed("2026-11-12T10:00:00Z")], [], NOW)).toBeNull();
    expect(missedOnSites(schedule, [], [ed("2026-11-11T11:02:00Z")], NOW)).toBe(DUE);
  });

  it("never warns while paused, nor for a morning before the schedule was set", () => {
    const paused = readTask({ public: [["p", "b".repeat(64)]], private: [["cron", "0 6 * * *", NY, "1"], ["paused"]] });
    expect(missedOnSites(paused, [], [], NOW)).toBeNull();
    const fresh = readTask({
      public: [["p", "b".repeat(64)]],
      private: [["cron", "0 6 * * *", NY, String(sec("2026-11-12T12:00:00Z"))]],
    });
    expect(missedOnSites(fresh, [], [], NOW)).toBeNull();
  });

  it("counts a device's ran at or after the morning (from before the runner was named)", () => {
    const ran = readTask({
      public: [["p", "b".repeat(64)]],
      private: [
        ["cron", "0 6 * * *", NY, "1"],
        ["ran", String(sec("2026-11-12T11:01:00Z"))],
      ],
    });
    expect(missedOnSites(ran, [], [], NOW)).toBeNull();
  });
});

/** Quartz's ObserverParamsTest, case for case, so the two apps pick the same key and model. */
describe("ported: Quartz ObserverParamsTest", () => {
  const openRouter = "https://openrouter.ai/api/v1";
  const first = { key: "sk-or-v1-0000000000001111", url: openRouter };
  const second = { key: "sk-or-v1-000000000000a3f9", url: openRouter };
  const ppq = { key: "sk-ppq-00000000000000bb", url: "https://api.ppq.ai" };
  const keys = [ppq, first, second];
  const schedule = emptyObserverSchedule();
  const t = (tags: TaskTags) => readTask(tags);

  it("theModelIsTheFirstValueAndMissingMeansTheAppsDefault", () => {
    expect(observerModel(t(schedule))).toBeNull();
    expect(observerModel(t(withObserverModel(schedule, "anthropic/claude-sonnet-4.5")))).toBe(
      "anthropic/claude-sonnet-4.5",
    );
    expect(observerModel(t(setParam(schedule, "model", [" "])))).toBeNull();
    expect(observerModel(t(setParam(schedule, "model", [])))).toBeNull();
    expect(t(withObserverModel(withObserverModel(schedule, "m"), null)).params).toEqual([]);
  });

  it("theKeyMatchesByUrlAndSuffix", () => {
    const chosen = withObserverKey(schedule, second);
    expect(chosen.private.at(-1)).toEqual(["param", "key", openRouter, "a3f9"]);
    expect(chosen.private.some((tag) => tag.includes(second.key))).toBe(false);
    expect(observerKeyChoice(t(chosen))).toEqual({ url: openRouter, suffix: "a3f9" });
    expect(pickObserverKey(t(chosen), keys)).toBe(second);
    expect(pickObserverKey(t(setParam(schedule, "key", [`${openRouter}/`, "a3f9"])), keys)).toBe(second);
  });

  it("theKeyFallsBackToTheFirstAtThatUrlThenTheDefault", () => {
    expect(pickObserverKey(t(setParam(schedule, "key", [openRouter, "zzzz"])), keys)).toBe(first);
    expect(pickObserverKey(t(setParam(schedule, "key", [openRouter])), keys)).toBe(first);
    expect(pickObserverKey(t(setParam(schedule, "key", ["https://elsewhere.example/v1", "a3f9"])), keys)).toBe(ppq);
    expect(pickObserverKey(t(schedule), keys)).toBe(ppq);
    expect(pickObserverKey(t(schedule), [])).toBeNull();
    // From a NIP-FA list's tags: a key over plain http to another machine isn't usable, even when named.
    const tags = [
      ["key", "sk-insecure-a3f9", "http://example.com/v1"],
      ["key", ppq.key, ppq.url],
      ["key", second.key, second.url],
    ];
    const usable = parseAgentKeys(tags);
    expect(pickObserverKey(t(setParam(schedule, "key", ["http://example.com/v1", "a3f9"])), usable)).toEqual(ppq);
    expect(pickObserverKey(t(withObserverKey(schedule, second)), usable)).toEqual(second);
  });

  it("aKeylessEndpointIsNamedByItsUrlOnly", () => {
    const local = { key: "", url: "http://localhost:11434/v1" };
    const chosen = withObserverKey(schedule, local);
    expect(chosen.private.at(-1)).toEqual(["param", "key", "http://localhost:11434/v1"]);
    expect(pickObserverKey(t(chosen), [ppq, local])).toBe(local);
    expect(t(withObserverKey(chosen, null)).params).toEqual([]);
  });

  it("settingsKeepTheParamsTheyDontKnow", () => {
    const other: TaskTags = { public: schedule.public, private: [...schedule.private, ["param", "size", "big"]] };
    const edited = withObserverKey(withObserverModel(other, "m"), first);
    expect(t(edited).params.map((p) => p.name)).toEqual(["size", "model", "key"]);
    expect(unknownObserverParams(t(edited))).toEqual(["size"]);
    expect(observerUnderstands(t(edited))).toBe(false);
    expect(observerUnderstands(t({ public: [], private: edited.private.filter((x) => x[1] !== "size") }))).toBe(true);
    expect(observerUnderstands(t(schedule))).toBe(true);
    expect(t(withObserverModel(edited, "m2")).params.map((p) => p.name)).toEqual(["size", "model", "key"]);
    expect(observerModel(t(withObserverModel(edited, "m2")))).toBe("m2");
  });
});

/**
 * Quartz's ObserverRunnerSiteTest, where it applies to a reader's client: the two-site
 * checks, the newest print and the missed-run warning. New York in November, UTC-5;
 * Wednesday 2026-11-11 06:00 there is 11:00 UTC.
 */
describe("ported: Quartz ObserverRunnerSiteTest", () => {
  const NY = "America/New_York";
  const HOURS = 3_600;
  const SIX = 1_794_394_800;
  const ASSISTANT = "b".repeat(64);
  const ed = (day: string, printedAt?: number) => ({ day, ...(printedAt !== undefined ? { printedAt } : {}) });
  const daily: TaskTags = {
    public: [],
    private: [
      ["task", "observer"],
      ["cron", "0 6 * * *", NY, "0"],
    ],
  };
  const run = setRunner(daily, ASSISTANT, 0);
  const withRan = (tags: TaskTags, ran: number) => ({ ...tags, private: [...tags.private, ["ran", String(ran)]] });
  const ms = (s: number) => s * 1000;
  // Quartz warns at exactly 3 hours; NIP-FB and this app at more than 3: the cases sit a second past.
  const LATER = ms(SIX + 3 * HOURS + 1);

  it("alreadyPrintedReadsBothSites", () => {
    const yesterday = ed("2026-11-10", SIX - 19 * HOURS);
    const manualThisMorning = ed("2026-11-11", SIX - HOURS);
    const both = (reader: { day: string }[], runner: { day: string }[]) =>
      [...reader, ...runner].some((e) => printedFor(e, ms(SIX), NY));
    expect(both([yesterday], [])).toBe(false);
    expect(both([yesterday, manualThisMorning], [yesterday])).toBe(true);
    expect(both([yesterday], [manualThisMorning])).toBe(true);
  });

  it("lastPrintedIsTheNewestPrintedAtAcrossBoth", () => {
    const own = ed("2026-11-10", SIX - 19 * HOURS);
    const runner = ed("2026-11-11", SIX + 60);
    const undated = ed("2026-11-12");
    expect(lastPrinted([own, undated], [runner])).toEqual({ at: ms(SIX + 60), byRunner: true, edition: runner });
    expect(lastPrinted([own], [undated])).toEqual({ at: ms(SIX - 19 * HOURS), byRunner: false, edition: own });
    expect(lastPrinted([runner], [runner])?.byRunner).toBe(false);
    expect(lastPrinted([undated], [])).toBeNull();
    expect(lastPrinted([])).toBeNull();
  });

  it("theMissedRunWarningReadsTheSitesWhenARunnerIsNamed", () => {
    const yesterday = ed("2026-11-10", SIX - 24 * HOURS + 60);
    const today = ed("2026-11-11", SIX + 60);
    const missed = (tags: TaskTags, reader: { day: string }[], runner: { day: string }[], now: number) =>
      missedOnSites(readTask(tags), reader, runner, now);
    // Within the grace: no warning yet.
    expect(missed(run, [], [yesterday], ms(SIX + 3 * HOURS - 1))).toBeNull();
    // Past it, nothing on either site for this morning: missed, even with nothing ever printed.
    expect(missed(run, [], [yesterday], LATER)).toBe(ms(SIX));
    expect(missed(run, [], [], LATER)).toBe(ms(SIX));
    expect(missed(run, [], [today], LATER)).toBeNull();
    expect(missed(run, [today], [], LATER)).toBeNull();
    // A device's `ran` from before the runner was named still counts.
    expect(missed(withRan(run, SIX + 60), [], [], LATER)).toBeNull();
    // Paused, or nothing due since the schedule was set.
    expect(missed(setEnabled(run, false, 0), [], [], LATER)).toBeNull();
    const reset: TaskTags = {
      ...run,
      private: [
        ["task", "observer"],
        ["cron", "0 6 * * *", NY, String(SIX + 1)],
      ],
    };
    expect(missed(reset, [], [], LATER)).toBeNull();
  });
});
