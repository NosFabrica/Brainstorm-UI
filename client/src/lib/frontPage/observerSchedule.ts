/**
 * The Observer's morning paper as a scheduled task (NIP-FB, `lib/scheduledTasks`; quartz
 * `plans/2026-11-11-observer-site.md`, "The morning schedule, synced"): the one task with
 * the fixed id `observer`, printed by whichever of the reader's Amethyst devices claims
 * the morning first. Brainstorm shows it and edits `paused` and `cron`; it never
 * claims a morning and never prints on a schedule.
 *
 * What is the Observer's own lives here: where the event is, a blank schedule, and how a
 * print knows today's paper already exists.
 */
import {
  SCHEDULED_TASK_KIND,
  dateIn,
  emptyTask,
  parseCron,
  type ScheduledTask,
  type TaskTags,
} from "@/lib/scheduledTasks";

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
