/**
 * Scheduled tasks (kind 34817, draft NIP-FB "Scheduled Tasks", shared with Amethyst): one
 * addressable event per person per task, `d` = the task's id. Like a NIP-51 list, its tags
 * are public (`event.tags`) or private (`content`: a NIP-44 ciphertext, by the author to
 * themselves, of a JSON array of tags), and readers use both:
 *
 *   ["task", "observer"]   ["cron", "0 6 * * 1-5", "America/New_York"]   ["paused"]
 *   ["claim", "<due unix>", "<install id>", "<device name>", "<claimed at>"]   ["ran", "<unix>"]
 *
 * and any other tag is one of the task's own options. `cron` is a POSIX five-field
 * expression read in its zone, so every device agrees on the instant. Nobody is designated
 * to run it: each device the user turned it on for races to `claim` an occurrence when it
 * falls due, and the winner stamps `ran` when done. Brainstorm never claims, never runs
 * and never writes `claim` or `ran`: a web page can't run anything with nobody there. It
 * reads them to say who last ran it and whether a run was missed, and edits `paused` and
 * `cron`.
 *
 * Pure. A task is kept as the two tag lists it was read as, and an edit changes only the
 * tags it means to, each where it was (public or private); a tag that wasn't there goes
 * private. Every other tag, known or not, survives a rewrite on its own side. A task's
 * specifics (its id, what it runs) live with the task: the Observer's morning paper is
 * `lib/frontPage/observerSchedule`. The relay and signer half is `services/observerSchedule`.
 */

export const SCHEDULED_TASK_KIND = 34817;

/** A task's tags as found: the event's public ones (without `d`) and its decrypted private ones. */
export interface TaskTags {
  public: string[][];
  private: string[][];
}

/** Cron's day-of-week numbering: Sunday is 0. */
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** The latest claimed occurrence. */
export interface TaskClaim {
  /** Unix seconds the claimed occurrence was due. */
  due: number;
  /** The claiming installation's own random id; empty when absent. */
  id: string;
  /** A name the user recognizes; null when absent. */
  by: string | null;
  /** Unix seconds it was claimed; null when absent. */
  at: number | null;
}

/** What the tags say, read tolerantly: a tag that isn't what it should be reads as absent. */
export interface ScheduledTask {
  /** The task's id as its `task` tag names it; null when absent. */
  task: string | null;
  /** No `paused` tag. */
  enabled: boolean;
  /** The expression as written, readable or not (`parseCron` says which); null when absent. */
  cron: string | null;
  /** The `cron` tag's zone, when this browser knows it; null otherwise. */
  tz: string | null;
  /** Null when absent or malformed: nothing has claimed an occurrence yet. */
  claim: TaskClaim | null;
  /** Unix seconds the claimed occurrence finished; null when absent. */
  ran: number | null;
}

/** A task nobody has written yet: named, paused, no schedule (all private). */
export function emptyTask(task: string): TaskTags {
  return { public: [], private: [["task", task], ["paused"]] };
}

/** Whether this browser knows `tz` as a time zone. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Both sides, private first: NIP-FB reads a duplicated tag as the private one, then the first. */
const merged = (tags: TaskTags) => [...tags.private, ...tags.public];
const first = (tags: TaskTags, name: string) => merged(tags).find((t) => t[0] === name);

/** A unix-seconds tag value; null when it isn't one. */
function seconds(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,12}$/.test(value)) return null;
  return Number(value);
}

function readClaim(tag: string[] | undefined): TaskClaim | null {
  const due = seconds(tag?.[1]);
  if (!tag || due === null) return null;
  const by = tag[3]?.trim();
  return { due, id: tag[2] ?? "", by: by ? by : null, at: seconds(tag[4]) };
}

export function readTask(tags: TaskTags): ScheduledTask {
  const cron = first(tags, "cron");
  const task = first(tags, "task")?.[1];
  return {
    task: task ? task : null,
    enabled: !merged(tags).some((t) => t[0] === "paused"),
    cron: typeof cron?.[1] === "string" ? cron[1] : null,
    tz: cron?.[2] && isValidTimeZone(cron[2]) ? cron[2] : null,
    claim: readClaim(first(tags, "claim")),
    ran: seconds(first(tags, "ran")?.[1]),
  };
}

/**
 * Every `name` tag replaced by `make(old)` on the side it is on; when there is none, one
 * `make(undefined)` added to the private side.
 */
function putTag(tags: TaskTags, name: string, make: (old: string[] | undefined) => string[]): TaskTags {
  const found = merged(tags).some((t) => t[0] === name);
  const swap = (list: string[][]) => list.map((t) => (t[0] === name ? make(t) : t));
  return found
    ? { public: swap(tags.public), private: swap(tags.private) }
    : { public: tags.public, private: [...tags.private, make(undefined)] };
}

// --- cron: NIP-FB's subset of POSIX five-field crontab -------------------------------

/** Each field as the values it allows, by index (day of week folded: 7 is Sunday, 0). */
export interface Cron {
  minute: boolean[];
  hour: boolean[];
  dom: boolean[];
  month: boolean[];
  dow: boolean[];
  /** The field is a bare `*`: NIP-FB ORs the two day fields when neither is (`*\/2` is restricted). */
  domStar: boolean;
  dowStar: boolean;
}

const FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week, 0 and 7 Sunday
];

// `*`, `n` or `a-b`, each optionally `/step` — except a bare number (`a/n` is not in the NIP).
const ELEMENT = /^(?:\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/;

function parseField(text: string, min: number, max: number): boolean[] | null {
  const allowed = new Array<boolean>(max + 1).fill(false);
  for (const part of text.split(",")) {
    const m = ELEMENT.exec(part);
    if (!m) return null;
    const [, from, to, stepText] = m;
    if (from !== undefined && to === undefined && stepText !== undefined) return null;
    const lo = from === undefined ? min : Number(from);
    const hi = from === undefined ? max : to === undefined ? lo : Number(to);
    const step = stepText === undefined ? 1 : Number(stepText);
    if (step < 1 || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) allowed[v] = true;
  }
  return allowed;
}

/** The five fields, split on whitespace as NIP-FB reads them; null when there aren't five. */
function cronFields(expr: string | null | undefined): string[] | null {
  if (typeof expr !== "string") return null;
  const fields = expr.trim().split(/\s+/);
  return fields.length === 5 ? fields : null;
}

/**
 * The expression, or null when NIP-FB calls it unreadable: five whitespace-separated
 * fields, each `*`, a number, `a-b`, `*` or `a-b` with `/n`, or a comma list of these, all
 * in range, `a` ≤ `b`, steps above 0. No names, seconds, `?`, `L`, `W`, `#` or `@` macros.
 */
export function parseCron(expr: string | null | undefined): Cron | null {
  const fields = cronFields(expr);
  if (!fields) return null;
  const parsed = fields.map((f, i) => parseField(f, FIELD_RANGES[i][0], FIELD_RANGES[i][1]));
  if (parsed.some((p) => p === null)) return null;
  const [minute, hour, dom, month, dowRaw] = parsed as boolean[][];
  const dow = dowRaw.slice(0, 7);
  if (dowRaw[7]) dow[0] = true;
  return { minute, hour, dom, month, dow, domStar: fields[2] === "*", dowStar: fields[4] === "*" };
}

/** Whether the calendar day (month `m`, day `d`, weekday `wd`) is one the expression runs on. */
function dayMatches(cron: Cron, m: number, d: number, wd: number): boolean {
  if (!cron.month[m]) return false;
  // As cron does: both day fields restricted means either one; otherwise both must hold
  // (the `*` one always does).
  if (!cron.domStar && !cron.dowStar) return cron.dom[d] || cron.dow[wd];
  return cron.dom[d] && cron.dow[wd];
}

// --- time zones ---------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** `{ y, m, d, hh, mm, ss }` of `instant` on the wall clock in `tz`. */
function wallClock(instant: number, tz: string) {
  const parts = formatterFor(tz).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour") % 24, mm: get("minute"), ss: get("second") };
}

/** How far `tz`'s wall clock is ahead of UTC at `instant`, in ms. */
function zoneOffset(instant: number, tz: string): number {
  const w = wallClock(instant, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss) - Math.floor(instant / 1000) * 1000;
}

/** The wall clock in `tz` at `instant`, to the minute, written as if it were UTC. */
function wallAt(instant: number, tz: string): number {
  const w = wallClock(instant, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm);
}

const HALF_DAY = 43_200_000;
const DAY = 86_400_000;

/**
 * The instant `hh:mm` falls on the calendar day `y-m-d` in `tz`, as NIP-FB reads it: a
 * time a daylight-saving change repeats is its first occurrence, and a time it skips is
 * the first instant after it (the moment the clocks jump).
 */
function zonedInstant(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  // Every offset the zone uses around that day: at most two, before and after a change.
  const offsets = [zoneOffset(asUtc - HALF_DAY, tz), zoneOffset(asUtc, tz), zoneOffset(asUtc + HALF_DAY, tz)];
  const candidates = [...new Set(offsets.map((o) => asUtc - o))].sort((a, b) => a - b);
  const exact = candidates.find((c) => wallAt(c, tz) === asUtc);
  if (exact !== undefined) return exact;
  // Skipped: the clock reads before it at the earliest candidate and after it at the
  // latest. Changes happen on a minute, so search the minutes between.
  let lo = candidates[0];
  let hi = candidates[candidates.length - 1];
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
    if (wallAt(mid, tz) >= asUtc) hi = mid;
    else lo = mid;
  }
  return hi;
}

const indices = (allowed: boolean[]) => allowed.flatMap((on, i) => (on ? [i] : []));

/** Far enough to find a 29 February past a skipped leap year (2096 → 2104). */
const HORIZON_DAYS = 366 * 8 + 2;
/** No zone's clock moves by more than this in one change: a wall time this far before now can't be after it. */
const MAX_SHIFT = 3 * 3_600_000;

/**
 * The next instant after `now` the expression matches, read in `tz`; null when it never
 * matches (`0 6 31 2 *`) or isn't an expression.
 */
export function nextCronAt(expr: string | Cron | null, tz: string, now: number): number | null {
  const cron = typeof expr === "string" || expr === null ? parseCron(expr) : expr;
  if (!cron) return null;
  const hours = indices(cron.hour);
  const minutes = indices(cron.minute);
  const today = wallClock(now, tz);
  const nowWall = Date.UTC(today.y, today.m - 1, today.d, today.hh, today.mm);
  // Calendar days in `tz`, walked with UTC arithmetic, never 24 h steps.
  for (let add = 0; add < HORIZON_DAYS; add++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d + add));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (!dayMatches(cron, m, d, date.getUTCDay())) continue;
    for (const hh of hours) {
      for (const mm of minutes) {
        if (Date.UTC(y, m - 1, d, hh, mm) < nowWall - MAX_SHIFT) continue;
        const at = zonedInstant(y, m, d, hh, mm, tz);
        if (at > now) return at;
      }
    }
  }
  return null;
}

/**
 * The latest instant at or before `now` the expression matched, read in `tz` (the same
 * instants `nextCronAt` gives); null when it never matched in the horizon or isn't an
 * expression.
 */
export function prevCronAt(expr: string | Cron | null, tz: string, now: number): number | null {
  const cron = typeof expr === "string" || expr === null ? parseCron(expr) : expr;
  if (!cron) return null;
  const hours = indices(cron.hour).reverse();
  const minutes = indices(cron.minute).reverse();
  const today = wallClock(now, tz);
  const nowWall = Date.UTC(today.y, today.m - 1, today.d, today.hh, today.mm);
  for (let back = 0; back < HORIZON_DAYS; back++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d - back));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (!dayMatches(cron, m, d, date.getUTCDay())) continue;
    for (const hh of hours) {
      for (const mm of minutes) {
        if (Date.UTC(y, m - 1, d, hh, mm) > nowWall + MAX_SHIFT) continue;
        const at = zonedInstant(y, m, d, hh, mm, tz);
        if (at <= now) return at;
      }
    }
  }
  return null;
}

// --- liveness (NIP-FB: who last ran it, and a warning for a missed run) ------------

/** NIP-FB: how long an occurrence has to run before a `ran` older than it is worth a warning. */
export const MISSED_RUN_GRACE_MS = 3 * 3_600_000;

/**
 * The newest occurrence that was due more than three hours before `now`; null when the
 * task doesn't run (off, or no usable schedule).
 */
export function lastDue(task: ScheduledTask, now: number): number | null {
  if (!task.enabled || !task.tz) return null;
  return prevCronAt(task.cron, task.tz, now - MISSED_RUN_GRACE_MS - 1);
}

export interface MissedRun {
  /** The occurrence with no run (ms). */
  due: number;
  /** When a run last finished (ms). */
  ran: number;
}

/**
 * NIP-FB's missed-run warning: `ran` is older than the newest occurrence due more than
 * three hours ago. Null when it isn't, when the task doesn't run, or when there is no
 * `ran` to go on (a task that never ran is not a missed run).
 */
export function missedRun(task: ScheduledTask, now: number): MissedRun | null {
  if (task.ran === null) return null;
  const due = lastDue(task, now);
  const ran = task.ran * 1000;
  return due !== null && ran < due ? { due, ran } : null;
}

// --- the simple editor: a time and some weekdays ------------------------------------

/** `M H * * <dow>`, M and H single numbers: what a time-and-weekdays editor can show again. */
export interface SimpleShape {
  hour: number;
  minute: number;
  /** By cron's numbering, Sunday 0. All seven for `*`. */
  dow: boolean[];
}

const NUMBER = /^\d{1,2}$/;

/** The expression as a time and weekdays, or null when it says more than that (NIP-FB: show it as it is). */
export function simpleShape(expr: string | null | undefined): SimpleShape | null {
  const cron = parseCron(expr);
  const fields = cronFields(expr);
  if (!cron || !fields) return null;
  const [minute, hour, dom, month] = fields;
  if (!NUMBER.test(minute) || !NUMBER.test(hour) || dom !== "*" || month !== "*") return null;
  return { hour: Number(hour), minute: Number(minute), dow: cron.dow };
}

/** The day-of-week field for a set of days: `*` for all, runs of three or more as ranges (`1-5`). */
export function dowField(days: readonly Weekday[]): string {
  const on = WEEKDAYS.map((d) => days.includes(d));
  if (on.every(Boolean)) return "*";
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (!on[i]) continue;
    let j = i;
    while (j + 1 < 7 && on[j + 1]) j++;
    if (j - i >= 2) parts.push(`${i}-${j}`);
    else for (let k = i; k <= j; k++) parts.push(String(k));
    i = j;
  }
  return parts.join(",");
}

/** A simple schedule as one reader sees it: the time and the weekdays on their own clock. */
export interface LocalSimple {
  /** `HH:MM`. */
  time: string;
  /** The days it runs, Sunday first; all seven for every day. */
  days: Weekday[];
}

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * The schedule in `viewerTz`'s terms, when it is simple: the time on the viewer's clock,
 * and the weekdays it falls on there (22:00 Monday in New York is Tuesday morning in
 * Tokyo). Null when it isn't a simple shape, or has no zone.
 */
export function localSimple(task: ScheduledTask, viewerTz: string, now: number): LocalSimple | null {
  const shape = simpleShape(task.cron);
  if (!shape || !task.tz) return null;
  const at = nextCronAt(`${shape.minute} ${shape.hour} * * *`, task.tz, now);
  if (at === null) return null;
  const there = wallClock(at, task.tz);
  const here = wallClock(at, viewerTz);
  // How many days the viewer's calendar is ahead at that moment: -1, 0 or 1.
  const shift = Math.round((Date.UTC(here.y, here.m - 1, here.d) - Date.UTC(there.y, there.m - 1, there.d)) / DAY);
  return {
    time: hhmm(here.hh, here.mm),
    days: WEEKDAYS.filter((_, i) => shape.dow[(((i - shift) % 7) + 7) % 7]),
  };
}

// --- edits: each returns new tags, the rest where they were ------------------------

/** Running: no `paused` tag on either side. Paused: one, private unless one was there. */
export function setEnabled(tags: TaskTags, enabled: boolean): TaskTags {
  if (enabled) {
    const keep = (list: string[][]) => list.filter((t) => t[0] !== "paused");
    return { public: keep(tags.public), private: keep(tags.private) };
  }
  return putTag(tags, "paused", (old) => old ?? ["paused"]);
}

/**
 * The schedule as a time and weekdays on the editor's clock: the `cron` tag becomes
 * `M H * * <days>` in the editor's zone (NIP-FB: the zone of whoever last set it), on its
 * own side, with any values after the zone kept.
 */
export function setSimpleSchedule(tags: TaskTags, simple: LocalSimple, tz: string): TaskTags {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(simple.time);
  if (!m) throw new RangeError(`Not a time: ${simple.time}`);
  if (!isValidTimeZone(tz)) throw new RangeError(`Not a time zone: ${tz}`);
  if (simple.days.length === 0) throw new RangeError("Pick at least one day.");
  const expr = `${Number(m[2])} ${Number(m[1])} * * ${dowField(simple.days)}`;
  return putTag(tags, "cron", (old) => ["cron", expr, tz, ...(old?.slice(3) ?? [])]);
}

/** The task named, when no `task` tag says what it is (NIP-FB requires one). */
export function withTaskName(tags: TaskTags, task: string): TaskTags {
  return first(tags, "task")?.[1] ? tags : putTag(tags, "task", () => ["task", task]);
}

// --- reading it -------------------------------------------------------------------

/**
 * Who ran it last and when: the claim's name when the claim is finished (NIP-FB: `ran` at
 * or after its due time), so a claim still in flight doesn't take credit for the last
 * run. Null when it never ran.
 */
export function lastRun(task: ScheduledTask): { at: number; by: string | null } | null {
  if (task.ran === null) return null;
  const claimed = task.claim && task.ran >= task.claim.due ? task.claim.by : null;
  return { at: task.ran * 1000, by: claimed };
}

export type TaskStatus =
  /** Turned off. */
  | "off"
  /** On, but no `cron` or no usable `tz`. */
  | "no-schedule"
  /** `cron` is there but isn't an expression NIP-FB defines: shown as it is, never run. */
  | "unreadable-schedule"
  /** A valid expression that never matches a real date (`0 6 31 2 *`). */
  | "never"
  | "scheduled";

/** Why the task does or doesn't run, first reason only. */
export function taskStatus(task: ScheduledTask, now: number): TaskStatus {
  if (!task.enabled) return "off";
  if (task.cron === null || !task.tz) return "no-schedule";
  if (!parseCron(task.cron)) return "unreadable-schedule";
  if (nextCronAt(task.cron, task.tz, now) === null) return "never";
  return "scheduled";
}

/** The next instant the task runs after `now` (ms), or null when it doesn't run. */
export function nextRunAt(task: ScheduledTask, now: number): number | null {
  if (!task.enabled || !task.tz) return null;
  return nextCronAt(task.cron, task.tz, now);
}

// --- display ------------------------------------------------------------------------

const WEEKDAY_SET: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND_SET: readonly Weekday[] = ["sun", "sat"];
const sameDays = (a: readonly Weekday[], b: readonly Weekday[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

/** Monday first, as a week reads. */
export const WEEK_ORDER: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** A weekday's name in the reader's language; `style` as Intl's `weekday`. */
export function weekdayName(day: Weekday, style: "narrow" | "short" | "long" = "short", locale?: string): string {
  // 2024-01-07 was a Sunday.
  const date = new Date(Date.UTC(2024, 0, 7 + WEEKDAYS.indexOf(day)));
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(date);
}

/** How the days read: `every`, `weekdays`, `weekends`, or the days themselves (`Mon, Wed, Fri`). */
export function describeDays(days: readonly Weekday[], locale?: string): string {
  if (days.length === 7) return "every";
  if (sameDays(days, WEEKDAY_SET)) return "weekdays";
  if (sameDays(days, WEEKEND_SET)) return "weekends";
  return WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => weekdayName(d, "short", locale))
    .join(", ");
}

/** `6:00 AM` (or the viewer's own convention) for an instant, in the viewer's zone unless `tz` is given. */
export function formatClock(instant: number, tz?: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  }).format(new Date(instant));
}

/** `Thu 6:00 AM`: an instant within the week ahead, in the viewer's zone unless `tz` is given. */
export function formatWhen(instant: number, tz?: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(tz ? { timeZone: tz } : {}),
  }).format(new Date(instant));
}

/**
 * A past instant as the day it fell on, in the viewer's zone: `today`, `yesterday`, the
 * weekday within the last week (`Monday`), else the date (`Nov 3`).
 */
export function relativeDay(instant: number, now: number, tz?: string, locale?: string): string {
  const zone = tz ?? browserTimeZone();
  const day = (t: number) => {
    const w = wallClock(t, zone);
    return Date.UTC(w.y, w.m - 1, w.d);
  };
  const ago = Math.round((day(now) - day(instant)) / DAY);
  if (ago <= 0) return "today";
  if (ago === 1) return "yesterday";
  if (ago < 7) return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: zone }).format(new Date(instant));
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: zone }).format(new Date(instant));
}

/** `HH:MM` on the wall clock in `tz` at `instant`. */
export function wallTime(instant: number, tz: string): string {
  const w = wallClock(instant, tz);
  return hhmm(w.hh, w.mm);
}

/** The browser's own IANA zone: the `tz` a schedule edited here is written with. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
