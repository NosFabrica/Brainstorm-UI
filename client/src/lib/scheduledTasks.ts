/**
 * Scheduled tasks (kind 34817, draft NIP-FB "Scheduled Tasks", shared with Amethyst): one
 * addressable event per person per task, `d` = the task's id. Like a NIP-51 list, its tags
 * are public (`event.tags`) or private (`content`: a NIP-44 ciphertext, by the author to
 * themselves, of a JSON array of tags), and readers use both:
 *
 *   ["task", "observer"]   ["cron", "0 6 * * 1-5", "America/New_York", "<set at>"]   ["paused"]
 *   ["claim", "<due unix>", "<install id>", "<device name>", "<claimed at>"]   ["ran", "<unix>"]
 *
 *   ["param", "<name>", "<values>…"]   (public) ["p", "<runner>"]
 *
 * `param`s are the task's own options, ordered and repeatable, kept as read; any other tag
 * is kept too. A public `p` names a runner (NIP-FB, Runner): another key, such as the
 * reader's Brainstorm Assistant, that runs the task for them. The private tags are then
 * NIP-44 between the author and the runner, so both read them, and no device of the author
 * runs it; more than one `p` is a conflict and nobody does. `cron` is a POSIX five-field
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
  /**
   * The `cron` tag's zone, when this browser knows it; null otherwise. NIP-FB: a `cron`
   * with no zone, or one that isn't an IANA zone, is unreadable (`taskStatus`).
   */
  tz: string | null;
  /** The `cron` tag's zone as written, known or not; null when absent or blank. For showing, never for timing. */
  writtenTz: string | null;
  /**
   * Unix seconds `cron` was last set (its fourth value; 0 when absent). Changing `cron` or
   * removing `paused` sets it, and no occurrence due before it is ever reported missed.
   */
  setAt: number;
  /** Null when absent or malformed: nothing has claimed an occurrence yet. */
  claim: TaskClaim | null;
  /** Unix seconds the claimed occurrence finished; null when absent. */
  ran: number | null;
  /**
   * Every `param`, the private ones first, then the public ones, each side in its order.
   * NIP-FB: a name may repeat, and every one is kept as read, understood or not.
   */
  params: TaskParam[];
  /**
   * The value of every public `p`: the keys the task names as its runner (NIP-FB,
   * Runner). A private `p` is just a tag that is kept.
   */
  runners: string[];
  /**
   * The one key that runs the task for its author: a single public `p` holding a lowercase
   * 64-hex key that isn't the author's. Null with none, more than one, or any other `p`;
   * a `p` that isn't a runner still means one is named (`runners`), and nobody runs it.
   */
  runner: string | null;
  /** More than one public `p`: NIP-FB says nobody runs the task. */
  runnerConflict: boolean;
}

/** `["param", name, values…]`: one of the task's own options (NIP-FB gives them no meaning). */
export interface TaskParam {
  name: string;
  values: string[];
}

/** A task nobody has written yet: named, paused, no schedule (all private). */
export function emptyTask(task: string): TaskTags {
  return { public: [], private: [["task", task], ["paused"]] };
}

/**
 * Whether `tz` is an IANA zone this browser knows. Newer engines also take a UTC offset
 * (`+05:00`) as a zone and older ones throw on it; it isn't an IANA name, so it never is.
 */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || /^[+-]/.test(tz)) return false;
  const known = validZones.get(tz);
  if (known !== undefined) return known;
  let valid: boolean;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    valid = true;
  } catch {
    valid = false;
  }
  // Making a formatter costs far more than asking a map; the names a session sees are few.
  if (validZones.size < 256) validZones.set(tz, valid);
  return valid;
}
const validZones = new Map<string, boolean>();

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

/**
 * The task its tags describe. `author`, when known, is who signed it: a `p` naming them
 * is no runner (`runner`).
 */
export function readTask(tags: TaskTags, author?: string): ScheduledTask {
  const cron = first(tags, "cron");
  const task = first(tags, "task")?.[1];
  const runners = runnersOf(tags.public);
  return {
    task: task ? task : null,
    enabled: !merged(tags).some((t) => t[0] === "paused"),
    cron: typeof cron?.[1] === "string" ? cron[1] : null,
    tz: cron?.[2] && isValidTimeZone(cron[2]) ? cron[2] : null,
    writtenTz: typeof cron?.[2] === "string" && cron[2].trim() ? cron[2].trim() : null,
    setAt: seconds(cron?.[3]) ?? 0,
    claim: readClaim(first(tags, "claim")),
    ran: seconds(first(tags, "ran")?.[1]),
    params: merged(tags).flatMap((t) => {
      const param = readParam(t);
      return param ? [param] : [];
    }),
    runners,
    runner: soleRunner(runners, author),
    runnerConflict: runners.length > 1,
  };
}

// --- params: the task's own options ------------------------------------------------

const PARAM = "param";

/** A `param` tag as a name and its values; null for one without a name. */
function readParam(tag: string[]): TaskParam | null {
  if (tag[0] !== PARAM || typeof tag[1] !== "string" || !tag[1].trim()) return null;
  return { name: tag[1], values: tag.slice(2) };
}

const isParam = (name: string) => (t: string[]) => t[0] === PARAM && t[1] === name;
const sameTag = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The values of the first `param` named `name` (private first, as readers see them); null when there is none. */
export function paramValues(task: ScheduledTask, name: string): string[] | null {
  return task.params.find((p) => p.name === name)?.values ?? null;
}

/**
 * The `param`s named `name` set to one holding `values`: it takes the place of the first
 * one (private side first, as readers see them), and every other one of that name goes,
 * on either side. With none, it is added to the private side. Every other tag, unknown
 * params included, stays where it was (Quartz's `ScheduledTask.withParam`). The same
 * tags come back when that one param already says exactly this.
 */
export function setParam(tags: TaskTags, name: string, values: readonly string[]): TaskTags {
  const tag = [PARAM, name, ...values];
  const is = isParam(name);
  const all = [...tags.private.filter(is), ...tags.public.filter(is)];
  if (all.length === 1 && sameTag(all[0], tag)) return tags;
  const swapFirst = (list: string[][]) => {
    let done = false;
    return list.flatMap((t) => {
      if (!is(t)) return [t];
      if (done) return [];
      done = true;
      return [tag];
    });
  };
  if (tags.private.some(is)) return { public: tags.public.filter((t) => !is(t)), private: swapFirst(tags.private) };
  if (tags.public.some(is)) return { public: swapFirst(tags.public), private: tags.private };
  return { public: tags.public, private: [...tags.private, tag] };
}

/** No `param` named `name`, on either side; the same tags when there was none. */
export function removeParam(tags: TaskTags, name: string): TaskTags {
  const is = isParam(name);
  if (!tags.public.some(is) && !tags.private.some(is)) return tags;
  return { public: tags.public.filter((t) => !is(t)), private: tags.private.filter((t) => !is(t)) };
}

// --- the runner: another key that runs the task for its author ----------------------

const HEX_KEY = /^[0-9a-f]{64}$/;

/**
 * The value of every public `p` with a value, in order, well-formed or not (blank included):
 * any of them stops the author's devices, and only a single valid one runs the task. A bare
 * `["p"]` names nobody.
 */
export function runnersOf(publicTags: readonly string[][]): string[] {
  return publicTags.filter((t) => t[0] === "p" && typeof t[1] === "string").map((t) => t[1]);
}

/**
 * The one runner `runners` names: exactly one, a lowercase 64-hex key, and not the author
 * (when known); null otherwise.
 */
function soleRunner(runners: readonly string[], author?: string): string | null {
  return runners.length === 1 && HEX_KEY.test(runners[0]) && runners[0] !== author ? runners[0] : null;
}

/**
 * Run by `runner`, or by the author's own devices when it is null: every public `p` goes,
 * and for a runner one public `["p", runner]` is added. A private `p` isn't a runner and
 * stays. `cron`, when there is one, is marked as set `now`, as resuming does: the mornings
 * before the change are nobody's to print, so the devices don't print one the runner
 * already did (after a clear), nor both of them one in progress (after naming it). Whoever
 * writes the event next encrypts the private tags to the new peer (`privateTagsPeer`): the
 * runner, or the author when cleared. The same tags come back when the task already names
 * exactly that runner, or none.
 */
export function setRunner(tags: TaskTags, runner: string | null, now: number): TaskTags {
  const current = runnersOf(tags.public);
  if (runner === null ? current.length === 0 : current.length === 1 && current[0] === runner) return tags;
  if (runner !== null && !HEX_KEY.test(runner)) throw new RangeError("Not a key.");
  const kept = tags.public.filter((t) => t[0] !== "p");
  const next = { public: runner === null ? kept : [...kept, ["p", runner]], private: tags.private };
  return merged(next).some((t) => t[0] === "cron") ? stampCron(next, now) : next;
}

/**
 * The other key of the NIP-44 conversation the private tags are written in, for `author`:
 * the runner when the task names one, else the author (NIP-51's to-self). A conflict, or a
 * `p` that is no runner, is written to self: nobody runs it, and only the author must read it.
 */
export function privateTagsPeer(tags: TaskTags, author: string): string {
  return soleRunner(runnersOf(tags.public), author) ?? author;
}

/**
 * Which keys the author tries, in order, to read the private tags of an event with these
 * public tags (Quartz's `ScheduledTaskEvent.privateTagsPeers`): first the peer NIP-FB's
 * writers encrypt to (`privateTagsPeer`: the valid runner, else themselves), then, for what
 * other writers did with a conflict or an odd `p`, every other hex key in a public `p`
 * (any case), then themselves. So a conflict tries self first.
 */
export function privateTagsReadPeers(publicTags: readonly string[][], author: string): string[] {
  const runners = runnersOf(publicTags);
  const others = runners.filter((p) => ANY_HEX_KEY.test(p) && p.toLowerCase() !== author);
  return [...new Set([soleRunner(runners, author) ?? author, ...others, author])];
}

/** A hex key in either case: a peer worth trying to read with, though only lowercase names a runner. */
const ANY_HEX_KEY = /^[0-9a-fA-F]{64}$/;

/**
 * Every `name` tag replaced by `make(old)` on the side it is on; when there is none, one
 * `make(undefined)` added to the private side. When `make` hands back every tag it was
 * given, so are the tags: no change is the same object, which is how a caller tells there
 * is nothing to write.
 */
function putTag(tags: TaskTags, name: string, make: (old: string[] | undefined) => string[]): TaskTags {
  let found = false;
  const swap = (list: string[][]) => {
    let out: string[][] | null = null;
    list.forEach((t, i) => {
      if (t[0] !== name) return;
      found = true;
      const next = make(t);
      if (next !== t) (out ??= list.slice())[i] = next;
    });
    return out ?? list;
  };
  const pub = swap(tags.public);
  const priv = swap(tags.private);
  if (!found) return { public: tags.public, private: [...tags.private, make(undefined)] };
  return pub === tags.public && priv === tags.private ? tags : { public: pub, private: priv };
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

/** Every instant `tz`'s wall clock reads `hh:mm` on `y-m-d`: none when skipped, two when repeated. */
function readingsOf(y: number, m: number, d: number, hh: number, mm: number, tz: string): number[] {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsets = [zoneOffset(asUtc - AHEAD, tz), zoneOffset(asUtc, tz), zoneOffset(asUtc + BEHIND, tz)];
  return [...new Set(offsets.map((o) => asUtc - o))].filter((c) => wallAt(c, tz) === asUtc).sort((a, b) => a - b);
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

/**
 * Names of one zone. Engines canonicalise some of these themselves (`resolvedOptions`) and
 * not all the same way (older ones say `Asia/Calcutta`, newer keep what they were given),
 * so both spellings fold to one here.
 */
const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Pacific/Enderbury": "Pacific/Kanton",
};
const UTC_NAMES = /^(Etc\/)?(UTC|UCT|GMT|GMT[+-]?0|Zulu|Universal|Greenwich)$/;

const canonicalZones = new Map<string, string>();

function canonicalZone(tz: string): string {
  const known = canonicalZones.get(tz);
  if (known !== undefined) return known;
  const name = canonicalName(tz);
  if (canonicalZones.size < 256) canonicalZones.set(tz, name);
  return name;
}

function canonicalName(tz: string): string {
  let name = tz;
  try {
    name = new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone || tz;
  } catch {
    // Not a zone: it stays what it is, equal only to itself.
  }
  if (UTC_NAMES.test(name)) return "UTC";
  return ZONE_ALIASES[name] ?? name;
}

const sameRules = new Map<string, boolean>();
/** How far ahead two zones' offsets are compared: past a year of clock changes. */
const RULES_HORIZON_DAYS = 400;

/**
 * Whether `a` and `b` keep the same offset at every instant over the next year or so
 * (`America/Toronto` and `America/New_York`): checked once a day, and every quarter hour
 * across a day either one's clocks change. Kept for the session.
 */
function sameOffsets(a: string, b: string, now: number): boolean {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const known = sameRules.get(key);
  if (known !== undefined) return known;
  const start = Math.floor(now / DAY) * DAY;
  let same = true;
  let last = [zoneOffset(start, a), zoneOffset(start, b)];
  if (last[0] !== last[1]) same = false;
  for (let day = 1; same && day <= RULES_HORIZON_DAYS; day++) {
    const at = start + day * DAY;
    const here = [zoneOffset(at, a), zoneOffset(at, b)];
    if (here[0] !== here[1]) same = false;
    else if (here[0] !== last[0] || here[1] !== last[1]) {
      for (let t = at - DAY + 15 * MINUTE; same && t < at; t += 15 * MINUTE) {
        if (zoneOffset(t, a) !== zoneOffset(t, b)) same = false;
      }
    }
    last = here;
  }
  sameRules.set(key, same);
  return same;
}

/**
 * Whether two zone names are one clock for the editor: the same zone by another name
 * (`Asia/Calcutta`, `Asia/Kolkata`; `UTC`, `Etc/UTC`), or zones with the same offsets and
 * changes ahead. A schedule on such a zone is edited in place, not across zones.
 */
export function sameZone(a: string, b: string, now = Date.now()): boolean {
  if (a === b) return true;
  if (!isValidTimeZone(a) || !isValidTimeZone(b)) return false;
  if (canonicalZone(a) === canonicalZone(b)) return true;
  return sameOffsets(a, b, now);
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
  // A stepped weekday field (`*/2`, `1-5/2`) is a shape the editor wouldn't write back the
  // same: shown as written, as Quartz's `SimpleCron.parse` does.
  if (fields[4].includes("/")) return null;
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
  if (sameZone(viewerTz, task.tz, now)) return { time: hhmm(shape.hour, shape.minute), days: shiftDays(shape.dow, 0) };
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

/** `HH:MM` as hours and minutes; a RangeError when it isn't a time of day. */
function parseTime(time: string): { hour: number; minute: number } {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) throw new RangeError(`Not a time: ${time}`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/**
 * The `cron` tag as `M H * * <days>` read in `tz`, exactly as given, on its own side, set
 * `now`, with any values after that kept. The same expression in the same zone is no
 * change, and keeps the tag as it was. The editor's edits go through `editSimpleSchedule`,
 * which keeps a schedule's zone; this one writes a first schedule, in the viewer's zone.
 */
export function setSimpleSchedule(tags: TaskTags, simple: LocalSimple, tz: string, now: number): TaskTags {
  const { hour, minute } = parseTime(simple.time);
  if (!isValidTimeZone(tz)) throw new RangeError(`Not a time zone: ${tz}`);
  if (simple.days.length === 0) throw new RangeError("Pick at least one day.");
  const expr = `${minute} ${hour} * * ${dowField(simple.days)}`;
  return putTag(tags, "cron", (old) =>
    old && old[1] === expr && old[2] === tz ? old : ["cron", expr, tz, unix(now), ...(old?.slice(4) ?? [])],
  );
}

const dowOf = (days: readonly Weekday[]) => WEEKDAYS.map((d) => days.includes(d));
const sameDow = (a: boolean[], b: boolean[]) => WEEKDAYS.every((_, i) => !!a[i] === !!b[i]);

/** `Sunday, March 29` (or with `weekdayOnly`, `Sunday`): a calendar day, for a message. */
const dayWords = (w: { y: number; m: number; d: number }, weekdayOnly = false) =>
  dtf(undefined, {
    weekday: "long",
    ...(weekdayOnly ? {} : { month: "long", day: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(Date.UTC(w.y, w.m - 1, w.d)));

/**
 * The time and weekdays the viewer picked in the editor, `simple`, on their own clock
 * (`viewerTz`), as an edit of the schedule that keeps its zone (NIP-FB: changing the time
 * keeps the time zone), matching Amethyst's `planTimeEdit` (Quartz `SimpleCron.movedTo`):
 *
 * - No schedule yet: written in the viewer's zone, as there is nothing to keep.
 * - On the schedule's own clock (or the same zone by another name): its fields, changed in
 *   place.
 * - On another clock: the schedule, still in its zone, whose next run the editor would show
 *   as `simple` (`localSimple`, the round trip). It is found from the first picked day
 *   after `now` whose picked time is a time on the viewer's clock: that instant on the
 *   schedule's clock is the new time, and the picked weekdays move with it when it crosses
 *   midnight there. When a clock change between now and then would make the editor show
 *   another time, the next picked day is tried. So a nudge from London to a New York
 *   schedule stays a New York time, and keeps following New York's clock changes, not
 *   London's.
 *
 * Confirming what the editor showed is no change: the same `tags` come back (nothing to
 * write; when it was set stays). A RangeError refuses what isn't a time, no days, a
 * schedule the editor can't show (another app changed it meanwhile), and a picked time
 * that can't be kept: one the viewer's clocks skip on a picked day, or one the schedule's
 * zone reads twice when the schedule would run at the other reading. Only picked days are
 * ever the reason.
 */
export function editSimpleSchedule(tags: TaskTags, simple: LocalSimple, viewerTz: string, now: number): TaskTags {
  const { hour, minute } = parseTime(simple.time);
  if (!isValidTimeZone(viewerTz)) throw new RangeError(`Not a time zone: ${viewerTz}`);
  if (simple.days.length === 0) throw new RangeError("Pick at least one day.");
  const task = readTask(tags);
  if (task.cron === null) return setSimpleSchedule(tags, simple, viewerTz, now);
  const shape = simpleShape(task.cron);
  const tz = task.tz;
  const changedElsewhere = "Your schedule was changed in another app, so nothing was saved.";
  if (!shape || !tz) throw new RangeError(changedElsewhere);
  const picked = dowOf(simple.days);
  const unchanged = (h: number, m: number, dow: boolean[]) => h === hour && m === minute && sameDow(dow, picked);

  if (sameZone(tz, viewerTz, now)) {
    return unchanged(shape.hour, shape.minute, shape.dow) ? tags : setSimpleSchedule(tags, simple, tz, now);
  }

  // Confirming what the editor shows writes nothing.
  const shown = localSimple(task, viewerTz, now);
  if (!shown) throw new RangeError(changedElsewhere);
  if (shown.time === simple.time && sameDow(dowOf(shown.days), picked)) return tags;

  const shows = (out: TaskTags) => {
    const back = localSimple(readTask(out), viewerTz, now);
    return !!back && back.time === simple.time && sameDow(dowOf(back.days), picked);
  };
  let refusal: string | null = null;
  const today = wallClock(now, viewerTz);
  // Two weeks: every picked weekday twice, past any one week's clock change.
  for (let add = 0; add < 15; add++) {
    const date = new Date(Date.UTC(today.y, today.m - 1, today.d + add));
    if (!picked[date.getUTCDay()]) continue;
    const day = { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
    // Each instant the viewer's clock reads the picked time that day: none when it skips it,
    // two when it repeats it.
    const readings = readingsOf(day.y, day.m, day.d, hour, minute, viewerTz);
    if (!readings.length) {
      refusal ??= `${formatTimeOfDay(simple.time)} is skipped on ${dayWords(day)} when your clocks change. Pick another time.`;
      continue;
    }
    for (const at of readings) {
      if (at <= now) continue;
      // Where that lands on the schedule's clock, which must run then and not at another reading.
      const there = wallClock(at, tz);
      if (zonedInstant(there.y, there.m, there.d, there.hh, there.mm, tz) !== at) {
        refusal ??= `${formatTimeOfDay(simple.time)} that ${dayWords(day, true)} is the second ${formatTimeOfDay({ hh: there.hh, mm: there.mm })} in ${zoneLabel(tz)}, and the schedule would run at the first. Pick another time.`;
        continue;
      }
      // The viewer's days as the schedule's: a day later there when it is a day behind here.
      const days = shiftDays(picked, -dayShift(at, tz, viewerTz));
      const out = setSimpleSchedule(tags, { time: hhmm(there.hh, there.mm), days }, tz, now);
      if (shows(out)) return out;
      // Its next run reads another time here: the clocks change between that run and this one.
      if (refusal === null) {
        const next = unmovedOccurrence(parseCron(readTask(out).cron)!, tz, there.hh, there.mm, now);
        if (next !== null) {
          const w = wallClock(next, viewerTz);
          // The picked day that run stands for: the one it would have been on, at the picked time.
          const off = (((((w.hh - hour) * 60 + w.mm - minute + 720) % 1440) + 1440) % 1440) - 720;
          const meant = wallClock(next - off * MINUTE, viewerTz);
          refusal = `${formatTimeOfDay(simple.time)} can't be kept on ${dayWords(meant)}: the clocks change, and that run would be at ${formatTimeOfDay({ hh: w.hh, mm: w.mm })} on yours. Pick another time.`;
        }
      }
    }
  }
  throw new RangeError(
    refusal ?? `${formatTimeOfDay(simple.time)} can't be kept while the clocks change. Pick another time.`,
  );
}

/**
 * No public `client` tag: NIP-FB says clients SHOULD keep every tag but `d` private, and a
 * public `client` would tell anyone who looks which app the user schedules with. Amethyst
 * used to add one; a rewrite drops it. A private one stays: nobody else can read it.
 */
export function withoutPublicClient(tags: TaskTags): TaskTags {
  return tags.public.some((t) => t[0] === "client")
    ? { public: tags.public.filter((t) => t[0] !== "client"), private: tags.private }
    : tags;
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
  /** On, but no `cron`. */
  | "no-schedule"
  /**
   * `cron` is there but isn't an expression NIP-FB defines, or its zone is missing or
   * isn't an IANA zone: shown as it is, never run, never edited as a simple schedule.
   */
  | "unreadable-schedule"
  /** A valid expression that never matches a real date (`0 6 31 2 *`). */
  | "never"
  | "scheduled";

/** Why the task does or doesn't run, first reason only. */
export function taskStatus(task: ScheduledTask, now: number): TaskStatus {
  if (!task.enabled) return "off";
  if (task.cron === null) return "no-schedule";
  if (!task.tz || !parseCron(task.cron)) return "unreadable-schedule";
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

/** The calendar date of `instant` in `zone`: `YYYY-MM-DD`. */
export function dateIn(instant: number, zone: string): string {
  const w = wallClock(instant, zone);
  return `${String(w.y).padStart(4, "0")}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
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

const agoFormats = new Map<string, Intl.RelativeTimeFormat>();

/** `3 hours ago`, `2 days ago`, `just now`: how long before `now` a past instant was. */
export function formatAgo(instant: number, now: number, locale?: string): string {
  const seconds = Math.max(0, Math.round((now - instant) / 1000));
  if (seconds < 60) return "just now";
  const key = locale ?? "";
  let rtf = agoFormats.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
    agoFormats.set(key, rtf);
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.floor(hours / 24), "day");
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
  const elsewhere = sameZone(viewerTz, tz, now) ? "" : ` (${zoneLabel(tz)})`;

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

/**
 * The browser's own IANA zone: the clock the editor shows, and the `tz` a first schedule is
 * written with (an edit keeps the schedule's own). Asked at most once a minute.
 */
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
