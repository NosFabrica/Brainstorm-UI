/**
 * The Observer's morning paper as a scheduled task (NIP-FB, `lib/scheduledTasks`; quartz
 * `plans/2026-11-11-observer-site.md`, "The morning schedule, synced" and "The Observer's
 * settings and the Assistant"): the one task with the fixed id `observer`, printed by
 * whichever of the reader's Amethyst devices claims the morning first, or, when the
 * schedule names one, by the reader's Brainstorm Assistant (a NIP-FB runner). Brainstorm
 * shows it and edits `paused`, `cron`, who prints and the settings; it never claims a
 * morning and never prints on a schedule.
 *
 * What is the Observer's own lives here: where the event is, a blank schedule, its
 * settings (`param`s), and how a print knows today's paper already exists, on the reader's
 * own site and on their Assistant's.
 */
import {
  SCHEDULED_TASK_KIND,
  dateIn,
  emptyTask,
  lastDue,
  paramValues,
  parseCron,
  removeParam,
  setParam,
  readTask,
  type ScheduledTask,
  type TaskTags,
} from "@/lib/scheduledTasks";
import { apiRoot, type AgentKey } from "@/lib/agentKeys";

/** The event's address: NIP-FB's kind, and the `d` the Observer fixes (one per person). */
export const SCHEDULE_KIND = SCHEDULED_TASK_KIND;
export const OBSERVER_TASK = "observer";
export const SCHEDULE_D = OBSERVER_TASK;

/** The morning paper before anyone set it up: paused, no schedule. */
export function emptyObserverSchedule(): TaskTags {
  return emptyTask(OBSERVER_TASK);
}

// --- before a print: already printed today? -------------------------------------

/** A `printedAt` this far ahead of our clock is another device's skew; further is nonsense. */
const FUTURE_SKEW_MS = 3_600_000;

/** What the check needs of an edition: an Observer site entry, or the session's own paper. */
export interface PrintedEdition {
  /** UTC `YYYY-MM-DD`. */
  day: string;
  /** Unix seconds; absent on a site entry that didn't record it. */
  printedAt?: number;
}

/**
 * Whose calendar "today" is on: the schedule's zone when there is a schedule NIP-FB can
 * read (an expression and a known zone, paused or not), else the viewer's own.
 */
export function printedTodayZone(schedule: ScheduledTask | null | undefined, viewerTz: string): string {
  return schedule?.tz && parseCron(schedule.cron) ? schedule.tz : viewerTz;
}

/**
 * The newest edition that makes today's print already done (the spec's "Before any
 * scheduled print", with now standing in for the occurrence's due time): one printed on
 * today's calendar date in `zone` (`printedTodayZone`), or, for an entry with no
 * `printedAt`, one whose UTC day is today's UTC date. Brainstorm only uses it as a hint;
 * a manual print is never skipped.
 */
export function printedToday<T extends PrintedEdition>(editions: readonly T[], now: number, zone: string): T | null {
  const todayUtc = new Date(now).toISOString().slice(0, 10);
  const today = dateIn(now, zone);
  const at = (e: T) => (e.printedAt !== undefined ? e.printedAt * 1000 : Date.parse(`${e.day}T00:00:00Z`));
  let best: T | null = null;
  for (const e of editions) {
    const counts =
      typeof e.printedAt === "number"
        ? e.printedAt * 1000 <= now + FUTURE_SKEW_MS && dateIn(e.printedAt * 1000, zone) === today
        : e.day === todayUtc;
    if (counts && (!best || at(e) > at(best))) best = e;
  }
  return best;
}

// --- the Observer's settings, as NIP-FB params -----------------------------------

/**
 * The Observer's params (quartz `ObserverParams`). `key` names the NIP-FA key to print
 * with by its endpoint URL and the key's last four characters, never the key itself;
 * `model` is the model id as that endpoint takes it. Missing, the first usable key and
 * the app's default for the endpoint apply.
 */
export const MODEL_PARAM = "model";
export const KEY_PARAM = "key";
/** How many of the key's last characters the `key` param holds. */
export const KEY_SUFFIX_LENGTH = 4;

/** The model the schedule names; null when it names none (the app's default for the endpoint). */
export function observerModel(task: ScheduledTask | null | undefined): string | null {
  const model = task ? paramValues(task, MODEL_PARAM)?.[0]?.trim() : undefined;
  return model ? model : null;
}

/** The `key` param: an endpoint and, for a key that has one, its last characters. */
export interface KeyChoice {
  url: string;
  suffix: string | null;
}

/** The schedule's `key` choice; null when it has none, or one without a URL. */
export function observerKeyChoice(task: ScheduledTask | null | undefined): KeyChoice | null {
  const values = task ? paramValues(task, KEY_PARAM) : null;
  const url = values?.[0]?.trim();
  if (!url) return null;
  const suffix = values?.[1]?.trim();
  return { url, suffix: suffix ? suffix : null };
}

const atUrl = (choice: KeyChoice, key: AgentKey) => apiRoot(key.url.trim()) === apiRoot(choice.url);

/**
 * The key to print with, out of `keys` (the reader's usable NIP-FA keys, in their order):
 * the one at the `key` param's URL ending with its suffix, else the first at that URL,
 * else NIP-FA's default, the first. Null only when there are none. Only usable keys
 * count: pass `parseAgentKeys`' list, which drops a key NIP-FA forbids sending to its URL.
 * URLs compare trimmed, without a trailing `/`; the suffix by `endsWith` (quartz
 * `ObserverParams.key`).
 */
export function pickObserverKey(task: ScheduledTask | null | undefined, keys: readonly AgentKey[]): AgentKey | null {
  const choice = observerKeyChoice(task);
  if (!choice) return keys[0] ?? null;
  const { suffix } = choice;
  return (
    (suffix ? keys.find((k) => atUrl(choice, k) && !!k.key && k.key.endsWith(suffix)) : undefined) ??
    keys.find((k) => atUrl(choice, k)) ??
    keys[0] ??
    null
  );
}

/**
 * Whether `keys` (a runner's own NIP-FA list: the Assistant prints with its keys, never
 * the reader's) hold the key the schedule names: one at the `key` param's URL ending with
 * its suffix (any key there, for a param without one). With no `key` param, any key at all
 * (NIP-FA's default, the first). False means the runner prints with another key, or none.
 */
export function holdsObserverKey(task: ScheduledTask | null | undefined, keys: readonly AgentKey[]): boolean {
  const choice = observerKeyChoice(task);
  if (!choice) return keys.length > 0;
  const { suffix } = choice;
  return keys.some((k) => atUrl(choice, k) && (!suffix || (!!k.key && k.key.endsWith(suffix))));
}

/** The `key` param's values for `key`: its URL, then its last four characters (none for a key-less endpoint). */
export function keyParamValues(key: AgentKey): string[] {
  return key.key ? [key.url, key.key.slice(-KEY_SUFFIX_LENGTH)] : [key.url];
}

/**
 * How hard the writer thinks: the reader's choice, kept in the schedule as the `effort` param
 * so every app, the Assistant and the worker print with it. Standard sends nothing extra and
 * is the param's absence; Deep (`deep`) asks each provider for its high reasoning effort.
 * Amethyst's `FrontPageParams`; quartz 2.17.0 lists it among `ObserverParams.KNOWN`.
 */
export const EFFORT_PARAM = "effort";

export type WritingEffort = "standard" | "deep";

/** A param value as an effort: `deep` is Deep, anything else (or none) is Standard. */
export function effortOf(value: string | null | undefined): WritingEffort {
  return value?.trim().toLowerCase() === "deep" ? "deep" : "standard";
}

/** The schedule's writing effort; Standard when it names none. */
export function observerEffort(task: ScheduledTask | null | undefined): WritingEffort {
  return effortOf(task ? paramValues(task, EFFORT_PARAM)?.[0] : null);
}

/** Printing with `effort`: Standard removes the param, so apps that don't know it still run the schedule. */
export function withObserverEffort(tags: TaskTags, effort: WritingEffort): TaskTags {
  return effort === "deep" ? setParam(tags, EFFORT_PARAM, ["deep"]) : removeParam(tags, EFFORT_PARAM);
}

/** The params this code understands (quartz `ObserverParams.KNOWN`); `size` isn't defined yet. */
export const KNOWN_PARAMS: readonly string[] = [MODEL_PARAM, KEY_PARAM, EFFORT_PARAM];

/** The names of the schedule's params this code doesn't understand, in order, each once. */
export function unknownObserverParams(task: ScheduledTask): string[] {
  return [...new Set(task.params.map((p) => p.name).filter((n) => !KNOWN_PARAMS.includes(n)))];
}

/**
 * Whether this code understands every param on the schedule. NIP-FB says not to run a task
 * with one it doesn't; Brainstorm never runs on schedule, so it only keeps them.
 */
export function observerUnderstands(task: ScheduledTask): boolean {
  return unknownObserverParams(task).length === 0;
}

/** Printing with `model`; null or blank removes the param, so the app's default applies. */
export function withObserverModel(tags: TaskTags, model: string | null): TaskTags {
  const trimmed = model?.trim();
  return trimmed ? setParam(tags, MODEL_PARAM, [trimmed]) : removeParam(tags, MODEL_PARAM);
}

/** Printing with `key` (its URL and last characters, never the key); null removes the param. */
export function withObserverKey(tags: TaskTags, key: AgentKey | null): TaskTags {
  return key ? setParam(tags, KEY_PARAM, keyParamValues(key)) : removeParam(tags, KEY_PARAM);
}

/**
 * The plan's migration: the model this browser remembered for the key the schedule prints
 * with (`remembered`, by endpoint) written as `model` the first time Brainstorm edits the
 * event, unless it already names one. The same tags when there is nothing to add.
 */
export function withRememberedModel(
  tags: TaskTags,
  keys: readonly AgentKey[],
  remembered: (url: string) => string | null,
): TaskTags {
  const task = readTask(tags);
  if (observerModel(task)) return tags;
  const key = pickObserverKey(task, keys);
  const model = key ? remembered(key.url)?.trim() : null;
  return model ? withObserverModel(tags, model) : tags;
}

// --- who prints ------------------------------------------------------------------

/**
 * Who prints the reader's mornings, by the public `p` of their own schedule:
 * - `devices`: no runner; whichever of their devices claims it.
 * - `assistant`: their Brainstorm Assistant (`assistant`, the `ta_pubkey` the app knows).
 * - `other`: one runner, but not the Assistant this account has now.
 * - `conflict`: more than one `p`; NIP-FB says nobody prints it.
 * - `invalid`: one `p` that isn't a key: the devices don't print it, and nobody can.
 */
export type WhoPrints = "devices" | "assistant" | "other" | "conflict" | "invalid";

export function whoPrints(task: ScheduledTask, assistant: string | null | undefined): WhoPrints {
  if (task.runnerConflict) return "conflict";
  if (task.runners.length === 0) return "devices";
  if (task.runner === null) return "invalid";
  return task.runner === assistant ? "assistant" : "other";
}

// --- two sites: the reader's own and their runner's ----------------------------------

/**
 * Whether `edition` is the paper of the occurrence due at `occurrence` (ms): printed on the
 * same calendar day as that due time on the schedule's clock (`zone`), or, for a site entry
 * without `printedAt`, dated the occurrence's UTC date (quartz `ObserverSite.printedFor`).
 * A manual print at 05:00 covers that day's 06:00 run; last night's paper does not.
 */
export function printedFor(edition: PrintedEdition, occurrence: number, zone: string): boolean {
  if (typeof edition.printedAt === "number") return dateIn(edition.printedAt * 1000, zone) === dateIn(occurrence, zone);
  return edition.day === new Date(occurrence).toISOString().slice(0, 10);
}

/** The newest dated print on either site; on a tie the reader's own. */
export interface LastPrint<T extends PrintedEdition> {
  /** Unix ms. */
  at: number;
  /** It came from the runner's site. */
  byRunner: boolean;
  edition: T;
}

/**
 * The newest print the two sites show, by `printedAt` ("Last printed by your Assistant,
 * <time> ago"). An edition without `printedAt` doesn't say when, so it isn't one. Null
 * when neither site has a dated print.
 */
export function lastPrinted<T extends PrintedEdition>(
  reader: readonly T[],
  runner: readonly T[] = [],
): LastPrint<T> | null {
  const newest = (list: readonly T[]) =>
    list.reduce<T | null>(
      (best, e) => (typeof e.printedAt === "number" && (!best || e.printedAt > best.printedAt!) ? e : best),
      null,
    );
  const own = newest(reader);
  const theirs = newest(runner);
  if (!own && !theirs) return null;
  if (own && (!theirs || own.printedAt! >= theirs.printedAt!)) {
    return { at: own.printedAt! * 1000, byRunner: false, edition: own };
  }
  return { at: theirs!.printedAt! * 1000, byRunner: true, edition: theirs! };
}

/**
 * The 3-hour missed-run warning while the schedule names a runner (NIP-FB, Runner: it can't
 * write `ran`, so its paper is the sign it ran): the newest occurrence due more than three
 * hours ago (never one before the schedule was set, never while paused) when no edition on
 * either site is its paper and `ran` (a device's print from before the runner was named)
 * isn't at or after it. Unix ms of that occurrence, or null. A conflict prints nowhere, so
 * it warns the same way (quartz `ObserverSite.missedRun`).
 */
export function missedOnSites(
  task: ScheduledTask,
  reader: readonly PrintedEdition[],
  runner: readonly PrintedEdition[],
  now: number,
): number | null {
  const due = lastDue(task, now);
  if (due === null || !task.tz) return null;
  if (task.ran !== null && task.ran * 1000 >= due) return null;
  const zone = task.tz;
  return reader.some((e) => printedFor(e, due, zone)) || runner.some((e) => printedFor(e, due, zone)) ? null : due;
}
