/**
 * Scheduled tasks (kind 34817, draft NIP-FB "Scheduled Tasks", shared with Amethyst): one
 * addressable event per person per task, `d` = the task's id. Like a NIP-51 list, its tags
 * are public (`event.tags`) or private (`content`: a NIP-44 ciphertext, by the author to
 * themselves, of a JSON array of tags), and readers use both:
 *
 *   ["task", "observer"]   ["cron", "0 6 * * 1-5", "America/New_York", "<set at>"]   ["paused"]
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
  /**
   * Unix seconds `cron` was last set (its fourth value; 0 when absent). Changing `cron` or
   * removing `paused` sets it, and no occurrence due before it is ever reported missed.
   */
  setAt: number;
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
    setAt: seconds(cron?.[3]) ?? 0,
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
// Any number of digits: `06` is 6, and the range check, not the pattern, rejects `060`.
const ELEMENT = /^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/;

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

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = wallFormatters.get(tz);
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
    wallFormatters.set(tz, f);
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

/**
 * A wall time's instant is that time written as UTC, less the offset in force then. No zone
 * is more than 14 h ahead of UTC (Kiribati; Chatham is 13:45 in summer, Auckland 13) or 12 h
 * behind it, so the instant lies in [wall − 14 h, wall + 12 h]. The offsets just outside
 * that window are the ones before and after any change inside it.
 */
const AHEAD = 15 * HOUR;
const BEHIND = 13 * HOUR;

/**
 * The instant `hh:mm` falls on the calendar day `y-m-d` in `tz`, as NIP-FB reads it: a
 * time a daylight-saving change repeats is its first occurrence, and a time it skips is
 * the first instant after it (the moment the clocks jump).
 */
function zonedInstant(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsets = [zoneOffset(asUtc - AHEAD, tz), zoneOffset(asUtc, tz), zoneOffset(asUtc + BEHIND, tz)];
  const candidates = [...new Set(offsets.map((o) => asUtc - o))].sort((a, b) => a - b);
  // The earliest instant that reads as this time: a repeated time's first occurrence.
  const exact = candidates.find((c) => wallAt(c, tz) === asUtc);
  if (exact !== undefined) return exact;
  // Skipped: the clock reads before it at the earliest candidate and after it at the
  // latest. Changes happen on a minute, so search the minutes between.
  let lo = candidates[0];
  let hi = candidates[candidates.length - 1];
  while (hi - lo > MINUTE) {
    const mid = lo + Math.floor((hi - lo) / (2 * MINUTE)) * MINUTE;
    if (wallAt(mid, tz) >= asUtc) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The one offset `tz` keeps for every wall time on the calendar day `y-m-d`, or null when it
 * changes around that day. Most days have one, and then each of the day's times is a
 * subtraction, not a search.
 */
function dayOffset(y: number, m: number, d: number, tz: string): number | null {
  const start = Date.UTC(y, m - 1, d);
  const before = zoneOffset(start - AHEAD, tz);
  return before === zoneOffset(start + DAY + BEHIND, tz) ? before : null;
}

const indices = (allowed: boolean[]) => allowed.flatMap((on, i) => (on ? [i] : []));

/** Far enough to find a 29 February past a skipped leap year (2096 → 2104). */
const HORIZON_DAYS = 366 * 8 + 2;
/** No zone's clock moves by more than this in one change: a wall time this far before now can't be after it. */
const MAX_SHIFT = 3 * HOUR;

const asCron = (expr: string | Cron | null) => (typeof expr === "string" || expr === null ? parseCron(expr) : expr);

/**
 * The next instant after `now` the expression matches, read in `tz`; null when it never
 * matches (`0 6 31 2 *`) or isn't an expression.
 */
export function nextCronAt(expr: string | Cron | null, tz: string, now: number): number | null {
  const cron = asCron(expr);
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
    const fixed = dayOffset(y, m, d, tz);
    for (const hh of hours) {
      for (const mm of minutes) {
        const wall = Date.UTC(y, m - 1, d, hh, mm);
        if (wall < nowWall - MAX_SHIFT) continue;
        const at = fixed !== null ? wall - fixed : zonedInstant(y, m, d, hh, mm, tz);
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
  const cron = asCron(expr);
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
    const fixed = dayOffset(y, m, d, tz);
    for (const hh of hours) {
      for (const mm of minutes) {
        const wall = Date.UTC(y, m - 1, d, hh, mm);
        if (wall > nowWall + MAX_SHIFT) continue;
        const at = fixed !== null ? wall - fixed : zonedInstant(y, m, d, hh, mm, tz);
        if (at <= now) return at;
      }
    }
  }
  return null;
}

// --- liveness (NIP-FB: who last ran it, and a warning for a missed run) ------------

/** NIP-FB: how long an occurrence has to run before a `ran` older than it is worth a warning. */
export const MISSED_RUN_GRACE_MS = 3 * HOUR;

/**
 * The newest occurrence that was due more than three hours before `now`; null when the
 * task doesn't run (off, or no usable schedule), or when that occurrence came before
 * `cron` was last set (NIP-FB: due before it, or while paused, is never missed; resuming
 * sets it too).
 */
export function lastDue(task: ScheduledTask, now: number): number | null {
  if (!task.enabled || !task.tz) return null;
  const due = prevCronAt(task.cron, task.tz, now - MISSED_RUN_GRACE_MS - 1);
  return due !== null && due >= task.setAt * 1000 ? due : null;
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

const NUMBER = /^\d+$/;

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
 * The next occurrence at the expression's own wall time `hour:minute`: one no
 * daylight-saving change moved. A gap day's run is at the jump, which is not the time the
 * schedule says.
 */
function unmovedOccurrence(cron: Cron, tz: string, hour: number, minute: number, now: number): number | null {
  let from = now;
  for (let i = 0; i < 16; i++) {
    const at = nextCronAt(cron, tz, from);
    if (at === null) return null;
    const w = wallClock(at, tz);
    if (w.hh === hour && w.mm === minute) return at;
    from = at;
  }
  return null;
}

/** Whole days the viewer's calendar is ahead of the schedule's at `instant`: -1, 0 or 1. */
function dayShift(instant: number, tz: string, viewerTz: string): number {
  const there = wallClock(instant, tz);
  const here = wallClock(instant, viewerTz);
  return Math.round((Date.UTC(here.y, here.m - 1, here.d) - Date.UTC(there.y, there.m - 1, there.d)) / DAY);
}

const shiftDays = (dow: boolean[], shift: number) => WEEKDAYS.filter((_, i) => dow[(((i - shift) % 7) + 7) % 7]);

/**
 * The schedule in `viewerTz`'s terms, when it is simple: the time on the viewer's clock,
 * and the weekdays it falls on there (22:00 Monday in New York is Tuesday morning in
 * Tokyo). On the schedule's own clock that is the expression's own fields; on another, both
 * come from one occurrence no daylight-saving change moved, so the time is the one the
 * schedule says and the weekday is that run's. Null when it isn't a simple shape, or has
 * no zone.
 */
export function localSimple(task: ScheduledTask, viewerTz: string, now: number): LocalSimple | null {
  const shape = simpleShape(task.cron);
  if (!shape || !task.tz) return null;
  if (viewerTz === task.tz) return { time: hhmm(shape.hour, shape.minute), days: shiftDays(shape.dow, 0) };
  const at = unmovedOccurrence(parseCron(task.cron)!, task.tz, shape.hour, shape.minute, now);
  if (at === null) return null;
  const here = wallClock(at, viewerTz);
  return { time: hhmm(here.hh, here.mm), days: shiftDays(shape.dow, dayShift(at, task.tz, viewerTz)) };
}

// --- edits: each returns new tags, the rest where they were ------------------------

const unix = (ms: number) => String(Math.floor(ms / 1000));

/** The `cron` tag with its fourth value, when it was last set, at `now`; the values after it kept. */
function stampCron(tags: TaskTags, now: number): TaskTags {
  return putTag(tags, "cron", (old) =>
    !old || old.length < 2 ? (old ?? ["cron"]) : ["cron", old[1], old[2] ?? "", unix(now), ...old.slice(4)],
  );
}

/**
 * Running: no `paused` tag on either side, and, when one was there, `cron` marked as set
 * `now` (NIP-FB: the mornings it was paused for are not missed ones). Paused: one, private
 * unless one was there.
 */
export function setEnabled(tags: TaskTags, enabled: boolean, now: number): TaskTags {
  if (enabled) {
    if (!merged(tags).some((t) => t[0] === "paused")) return tags;
    const keep = (list: string[][]) => list.filter((t) => t[0] !== "paused");
    const resumed = { public: keep(tags.public), private: keep(tags.private) };
    return merged(resumed).some((t) => t[0] === "cron") ? stampCron(resumed, now) : resumed;
  }
  return putTag(tags, "paused", (old) => old ?? ["paused"]);
}

/**
 * The schedule as a time and weekdays on the editor's clock: the `cron` tag becomes
 * `M H * * <days>` in the editor's zone (NIP-FB: the zone of whoever last set it), on its
 * own side, set `now`, with any values after that kept. The same expression in the same
 * zone is no change, and keeps the tag as it was.
 */
export function setSimpleSchedule(tags: TaskTags, simple: LocalSimple, tz: string, now: number): TaskTags {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(simple.time);
  if (!m) throw new RangeError(`Not a time: ${simple.time}`);
  if (!isValidTimeZone(tz)) throw new RangeError(`Not a time zone: ${tz}`);
  if (simple.days.length === 0) throw new RangeError("Pick at least one day.");
  const expr = `${Number(m[2])} ${Number(m[1])} * * ${dowField(simple.days)}`;
  return putTag(tags, "cron", (old) =>
    old && old[1] === expr && old[2] === tz ? old : ["cron", expr, tz, unix(now), ...(old?.slice(4) ?? [])],
  );
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

const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** One `Intl.DateTimeFormat` per locale and options: making one costs far more than using it. */
function dtf(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, f);
  }
  return f;
}

const zoned = (tz: string | undefined) => (tz ? { timeZone: tz } : {});

const WEEKDAY_SET: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND_SET: readonly Weekday[] = ["sun", "sat"];
const sameDays = (a: readonly Weekday[], b: readonly Weekday[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

/** Monday first, as a week reads. */
export const WEEK_ORDER: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const weekdayNames = new Map<string, string[]>();

/** A weekday's name in the reader's language; `style` as Intl's `weekday`. */
export function weekdayName(day: Weekday, style: "narrow" | "short" | "long" = "short", locale?: string): string {
  const key = `${locale ?? ""}|${style}`;
  let names = weekdayNames.get(key);
  if (!names) {
    const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" });
    // 2024-01-07 was a Sunday.
    names = WEEKDAYS.map((_, i) => f.format(new Date(Date.UTC(2024, 0, 7 + i))));
    weekdayNames.set(key, names);
  }
  return names[WEEKDAYS.indexOf(day)];
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
  return dtf(locale, { hour: "numeric", minute: "2-digit", ...zoned(tz) }).format(new Date(instant));
}

/** `6:00 AM` for a time of day, `HH:MM` or hours and minutes, as the viewer writes times. */
export function formatTimeOfDay(time: string | { hh: number; mm: number }, locale?: string): string {
  const { hh, mm } = typeof time === "string" ? { hh: Number(time.slice(0, 2)), mm: Number(time.slice(3, 5)) } : time;
  return dtf(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, 1, hh, mm)),
  );
}

/** `Thu 6:00 AM`: an instant within the week ahead, in the viewer's zone unless `tz` is given. */
export function formatWhen(instant: number, tz?: string, locale?: string): string {
  return dtf(locale, { weekday: "short", hour: "numeric", minute: "2-digit", ...zoned(tz) }).format(new Date(instant));
}

/** The calendar day of `instant` in `zone`, as days since 1970. */
function dayNumber(instant: number, zone: string): number {
  const w = wallClock(instant, zone);
  return Math.round(Date.UTC(w.y, w.m - 1, w.d) / DAY);
}

/**
 * A coming instant: `Thu 6:00 AM` within the next six days, where the weekday names one
 * day, and `Tue, Dec 1, 6:00 AM` further out. In the viewer's zone unless `tz` is given.
 */
export function formatNext(instant: number, now: number, tz?: string, locale?: string): string {
  const zone = tz ?? browserTimeZone();
  if (dayNumber(instant, zone) - dayNumber(now, zone) <= 6) return formatWhen(instant, tz, locale);
  return dtf(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...zoned(tz),
  }).format(new Date(instant));
}

/**
 * A past instant as the day it fell on, in the viewer's zone: `today`, `yesterday`, the
 * weekday within the last week (`Monday`), else the date (`Nov 3`).
 */
export function relativeDay(instant: number, now: number, tz?: string, locale?: string): string {
  const zone = tz ?? browserTimeZone();
  const ago = dayNumber(now, zone) - dayNumber(instant, zone);
  if (ago <= 0) return "today";
  if (ago === 1) return "yesterday";
  if (ago < 7) return dtf(locale, { weekday: "long", timeZone: zone }).format(new Date(instant));
  return dtf(locale, { month: "short", day: "numeric", timeZone: zone }).format(new Date(instant));
}

/** `HH:MM` on the wall clock in `tz` at `instant`. */
export function wallTime(instant: number, tz: string): string {
  const w = wallClock(instant, tz);
  return hhmm(w.hh, w.mm);
}

/** How a zone reads in a sentence: `New York time`, `UTC`. */
export function zoneLabel(tz: string): string {
  if (/^(Etc\/)?(UTC|GMT|UCT|Zulu|Universal)$/.test(tz)) return "UTC";
  return `${(tz.split("/").pop() ?? tz).replace(/_/g, " ")} time`;
}

// --- a schedule in words --------------------------------------------------------------

const COUNTS = ["", "Once", "Twice", "Three times", "Four times"];
const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};
const and = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Minutes past midnight, for a count of minutes that may run into the day before or after. */
const timeOfDay = (t: number) => ((t % 1440) + 1440) % 1440;

/** Minutes the viewer's clock is ahead of the schedule's at `instant`. */
function minutesAhead(instant: number, tz: string, viewerTz: string): number {
  return Math.round((zoneOffset(instant, viewerTz) - zoneOffset(instant, tz)) / MINUTE);
}

/** ` on weekdays`, ` on Mon, Wed`, or nothing for every day. */
function onDays(days: Weekday[], locale?: string): string {
  const words = describeDays(days, locale);
  return words === "every" ? "" : ` on ${words}`;
}

/**
 * A schedule a time-and-weekdays editor can't show, in words, when it can be said
 * plainly: `Every 6 hours`, `Twice a day, 6:00 AM and 6:00 PM`, `Monthly on the 1st at
 * 6:00 AM`, `Yearly on Jan 1 at 6:00 AM`. Times are on the viewer's clock; where moving
 * them there would move the day too (a monthly run at 01:00 in Tokyo is the day before in
 * New York), they stay on the schedule's clock and say whose (`(Tokyo time)`). Null when
 * it isn't one of these shapes (or isn't an expression): show the expression as written.
 */
export function describeCron(
  expr: string | null,
  tz: string,
  viewerTz: string,
  now: number,
  locale?: string,
): string | null {
  const cron = parseCron(expr);
  const fields = cronFields(expr);
  if (!cron || !fields) return null;
  const next = nextCronAt(cron, tz, now);
  if (next === null) return null;
  const [mi, ho, dom, mon, dow] = fields;
  const minutes = indices(cron.minute);
  const hours = indices(cron.hour);
  const days = WEEKDAYS.filter((_, i) => cron.dow[i]);
  const ahead = minutesAhead(next, tz, viewerTz);
  const step = (field: string) => (field === "*" ? 1 : Number(/^\*\/(\d+)$/.exec(field)?.[1] ?? 0));

  // Every n minutes, all day, every day.
  const minuteStep = step(mi);
  if (minuteStep && 60 % minuteStep === 0 && ho === "*" && dom === "*" && mon === "*" && dow === "*") {
    return minuteStep === 1 ? "Every minute" : `Every ${minuteStep} minutes`;
  }
  // Every n hours, at one minute past, every day.
  const hourStep = step(ho);
  if (hourStep && 24 % hourStep === 0 && minutes.length === 1 && dom === "*" && mon === "*" && dow === "*") {
    const past = (((minutes[0] + ahead) % 60) + 60) % 60;
    const every = hourStep === 1 ? "Every hour" : `Every ${hourStep} hours`;
    return past === 0 ? every : `${every}, at :${String(past).padStart(2, "0")}`;
  }

  // Each run's time of day on both clocks, and how far the viewer's moves its day.
  const times = hours.flatMap((h) => minutes.map((m) => h * 60 + m));
  const moved = times.map((t) => t + ahead);
  const shifts = new Set(moved.map((t) => Math.floor(t / 1440)));
  const clock = (t: number) => formatTimeOfDay({ hh: Math.floor(t / 60), mm: t % 60 }, locale);
  const viewerClock = (t: number) => clock(timeOfDay(t));
  const elsewhere = viewerTz === tz ? "" : ` (${zoneLabel(tz)})`;

  // A few times a day, on some weekdays or every day.
  if (dom === "*" && mon === "*" && times.length >= 1 && times.length <= 4) {
    const count = times.length === 1 ? "Daily" : `${COUNTS[times.length]} a day`;
    if (shifts.size === 1) {
      const shift = [...shifts][0];
      const list = moved
        .map(timeOfDay)
        .sort((a, b) => a - b)
        .map(clock);
      const at = times.length === 1 ? ` at ${list[0]}` : `, ${and(list)}`;
      return `${count}${onDays(shiftDays(cron.dow, shift), locale)}${at}`;
    }
    const at = times.length === 1 ? ` at ${clock(times[0])}` : `, ${and(times.map(clock))}`;
    return `${count}${onDays(days, locale)}${at}${elsewhere}`;
  }

  // On some days of the month (or one day of the year), at one time.
  if (times.length !== 1 || dow !== "*" || !/^\d+(,\d+)*$/.test(dom)) return null;
  const monthDays = indices(cron.dom);
  const sameDay = shifts.has(0);
  const time = sameDay ? viewerClock(moved[0]) : clock(times[0]);
  const zoneNote = sameDay ? "" : elsewhere;
  if (mon === "*" && monthDays.length <= 3) {
    return `Monthly on the ${and(monthDays.map(ordinal))} at ${time}${zoneNote}`;
  }
  if (NUMBER.test(mon) && monthDays.length === 1) {
    const date = dtf(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, Number(mon) - 1, monthDays[0])),
    );
    return `Yearly on ${date} at ${time}${zoneNote}`;
  }
  return null;
}

/**
 * Whether every time of day the expression runs at is before noon on the viewer's clock
 * (what makes it a morning paper); null when it isn't an expression or never runs.
 */
export function runsBeforeNoon(expr: string | null, tz: string, viewerTz: string, now: number): boolean | null {
  const cron = parseCron(expr);
  if (!cron) return null;
  const next = nextCronAt(cron, tz, now);
  if (next === null) return null;
  const ahead = minutesAhead(next, tz, viewerTz);
  for (const h of indices(cron.hour)) {
    for (const m of indices(cron.minute)) {
      if (timeOfDay(h * 60 + m + ahead) >= 720) return false;
    }
  }
  return true;
}

let zoneCache: { tz: string; at: number } | null = null;

/** The browser's own IANA zone: the `tz` a schedule edited here is written with. Asked at most once a minute. */
export function browserTimeZone(): string {
  const now = Date.now();
  if (zoneCache && now - zoneCache.at < MINUTE && now >= zoneCache.at) return zoneCache.tz;
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    // An old engine without zones: UTC.
  }
  zoneCache = { tz, at: now };
  return tz;
}
